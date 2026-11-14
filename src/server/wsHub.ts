import crypto from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import type Database from 'better-sqlite3';
import { WebSocket, WebSocketServer } from 'ws';
import {
  buildDefaultRoundConfigs,
  calculateQuestionPoints,
  determineWinner,
  evaluateAnswerMatch,
  normalizeAgeGroup,
  normalizeArabicText,
  resolveBidChallengePoints,
  ROUND_RULES,
} from '../shared/gameRules';
import type {
  AgeGroup,
  AudienceQuestionView,
  BidChallengeState,
  Difficulty,
  GameSessionView,
  QuestionObjection,
  QuestionRecord,
  RoundConfig,
  RoundType,
  ScoreAuditEntry,
  SessionPhase,
  SessionSettings,
  TeamState,
  UndoActionSnapshot,
} from '../shared/types';
import { getBankAvailability, resetExposureCycleTx, selectNextQuestionTx } from './questionSelection';
import { resolveUserFromToken } from './rbac';

export interface InternalSessionState {
  id: string;
  code: string;
  hostProfileId: string | null;
  title: string;
  bankId: string;
  bankName: string;
  lessonId: string | null;
  ageGroup: AgeGroup;
  difficulty: Difficulty | 'mixed';
  category: string;
  categories: string[];
  phase: SessionPhase;
  teams: TeamState[];
  activeTeamIndex: number;
  buzzedTeamIndex: number | null;
  failedBuzzTeams: number[];
  rounds: RoundConfig[];
  currentRoundIndex: number;
  currentQuestionIndexInRound: number;
  timerRemainingSec: number;
  timerRunning: boolean;
  timerEndsAtMs: number | null;
  answerRevealed: boolean;
  hasShownIntro: boolean;
  isClutchTime: boolean;
  overtimeTieBreaker: boolean;
  previousLeaderIndex: number | null;
  leadChangedAtMs: number | null;
  lastAnsweredSlotKey: string | null;
  lastFeedback: GameSessionView['lastFeedback'];
  revealedClueCount: number;
  memoryPhase: 'memorize' | 'recall' | 'none';
  memoryRemainingSec: number;
  memoryEndsAtMs: number | null;
  bidState: BidChallengeState | null;
  exhaustedNotice: GameSessionView['exhaustedNotice'];
  settings: SessionSettings;
  currentQuestion: QuestionRecord | null;
  recentPrompts: string[];
  usedQuestionIdsInSession: string[];
  stats: {
    totalAnswered: number;
    totalCorrect: number;
    rapidFireAnsweredInRound: number;
  };
  scoreAuditLog: ScoreAuditEntry[];
  undoStack: UndoActionSnapshot[];
  objections: QuestionObjection[];
  updatedAt: string;
}

interface RoomClient {
  ws: WebSocket;
  role: 'host' | 'audience' | 'player';
  profileId?: string;
}

export class GameSessionHub {
  private db: Database.Database;
  private rooms = new Map<string, Set<RoomClient>>();
  private sessionCache = new Map<string, InternalSessionState>();
  private wss: WebSocketServer | null = null;
  private tickInterval: NodeJS.Timeout | null = null;

  constructor(db: Database.Database) {
    this.db = db;
  }

  attach(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '/ws', 'http://localhost');
      const code = (url.searchParams.get('code') || '').toUpperCase().trim();
      const requestedRole = url.searchParams.get('role') || 'audience';
      const token = url.searchParams.get('token') || undefined;
      const user = resolveUserFromToken(this.db, token);

      if (!code) {
        ws.close(1008, 'Missing session code');
        return;
      }

      const session = this.getSessionInternal(code);
      if (!session) {
        ws.close(1008, 'Session not found');
        return;
      }

      // Enforce strict RBAC on host WebSocket role
      let role: 'host' | 'audience' | 'player' = 'audience';
      if (requestedRole === 'host') {
        const isAllowedHost =
          !session.hostProfileId ||
          (user && (user.role === 'admin' || user.role === 'teacher' || user.id === session.hostProfileId));
        role = isAllowedHost ? 'host' : 'audience';
      } else if (requestedRole === 'player') {
        role = 'player';
      }

      const client: RoomClient = { ws, role, profileId: user?.id };
      if (!this.rooms.has(code)) this.rooms.set(code, new Set());
      this.rooms.get(code)!.add(client);

      ws.send(
        JSON.stringify({
          type: 'session:sync',
          payload: this.projectView(session, role === 'host'),
        })
      );

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type: string; payload?: Record<string, unknown> };
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
            return;
          }
          if (msg.type === 'buzz' && typeof msg.payload?.teamIndex === 'number') {
            this.handleBuzz(code, msg.payload.teamIndex);
            return;
          }
          if (msg.type === 'bid_raise' || msg.type === 'bid_challenge') {
            if (session.settings.hostControlled && role !== 'host') return;
            this.handleBidAction(code, msg.type, msg.payload || {}, role === 'host');
            return;
          }
          if (role === 'host') {
            this.handleHostAction(code, msg.type, msg.payload || {});
          }
        } catch {
          // Ignore malformed WS message
        }
      });

      ws.on('close', () => {
        this.rooms.get(code)?.delete(client);
      });
    });

    // Authoritative server timer loop (250ms resolution for crisp 1s countdown & memory hide)
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      for (const [code, session] of this.sessionCache.entries()) {
        if (!this.rooms.get(code)?.size) continue;
        const changed = this.syncLiveTimer(session, now);
        if (changed) {
          this.saveSession(session);
          this.broadcast(code);
        }
      }
    }, 250);
  }

  stop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.terminate();
      }
      this.wss.close();
    }
  }

  private syncLiveTimer(session: InternalSessionState, now = Date.now()): boolean {
    let changed = false;

    if (session.phase === 'playing' && session.memoryPhase === 'memorize' && session.memoryEndsAtMs) {
      const remMem = Math.max(0, Math.ceil((session.memoryEndsAtMs - now) / 1000));
      if (remMem !== session.memoryRemainingSec) {
        session.memoryRemainingSec = remMem;
        changed = true;
      }
      if (remMem <= 0) {
        session.memoryPhase = 'recall';
        session.memoryEndsAtMs = null;
        const dur = session.rounds[session.currentRoundIndex]?.durationSec ?? session.settings.defaultTimerSec ?? 30;
        session.timerRemainingSec = dur;
        session.timerRunning = !session.settings.hostControlled;
        session.timerEndsAtMs = session.timerRunning ? now + dur * 1000 : null;
        changed = true;
      }
    } else if (session.phase === 'playing' && session.timerRunning && session.timerEndsAtMs) {
      const rem = Math.max(0, Math.ceil((session.timerEndsAtMs - now) / 1000));
      if (rem !== session.timerRemainingSec) {
        session.timerRemainingSec = rem;
        changed = true;
      }
      if (rem <= 0) {
        session.timerRunning = false;
        session.timerEndsAtMs = null;
        if (session.bidState && session.bidState.phase === 'executing') {
          session.bidState.phase = 'judging';
        }
        changed = true;
      }
    }

    return changed;
  }

  createSession(params: {
    hostProfileId: string | null;
    title: string;
    bankId: string;
    lessonId?: string | null;
    ageGroup: AgeGroup;
    difficulty: Difficulty | 'mixed';
    category: string;
    categories?: string[];
    teams: Array<{ name: string; color: string; participantIds?: string[]; participantNames?: string[] }>;
    roundTypes: RoundType[];
    roundOverrides?: Partial<Record<RoundType, Partial<RoundConfig>>>;
    settings?: Partial<SessionSettings>;
    skipVs?: boolean;
  }): InternalSessionState {
    const bankRow = this.db
      .prepare(`SELECT id, name, lesson_id FROM question_banks WHERE id = ? AND is_active = 1`)
      .get(params.bankId) as { id: string; name: string; lesson_id: string | null } | undefined;
    if (!bankRow) {
      throw new Error('بنك الأسئلة المحدد غير موجود');
    }

    if (params.settings?.hostControlled && !params.hostProfileId) {
      throw new Error('سجّل الدخول قبل إنشاء مباراة بتحكم الهاتف.');
    }

    const skipVs = Boolean(params.skipVs && !params.settings?.hostControlled);
    const code = this.generateUniqueCode();
    const id = `sess-${crypto.randomUUID().slice(0, 8)}`;
    const defaultTimer = params.settings?.defaultTimerSec ?? 30;
    const mergedOverrides: Partial<Record<RoundType, Partial<RoundConfig>>> = {
      ...params.roundOverrides,
    };
    const roundTypes = params.roundTypes.length > 0 ? params.roundTypes : (['rapid_fire', 'multiple_choice', 'buzzer', 'golden'] as RoundType[]);
    for (const rt of roundTypes) {
      if (defaultTimer !== 30 && !mergedOverrides[rt]?.durationSec) {
        mergedOverrides[rt] = { ...(mergedOverrides[rt] ?? {}), durationSec: defaultTimer };
      }
    }

    if (roundTypes.some((type) => !Object.hasOwn(ROUND_RULES, type) ||
        (type === 'golden' && mergedOverrides.golden?.goldenTargetType && !Object.hasOwn(ROUND_RULES, mergedOverrides.golden.goldenTargetType)))) throw new Error('نوع الجولة غير متاح.');
    const rounds = buildDefaultRoundConfigs(roundTypes, mergedOverrides);

    const teams: TeamState[] = (params.teams.length > 0 ? params.teams : [
      { name: 'فريق النخبة', color: '#38BDF8' },
      { name: 'فريق الرواد', color: '#F59E0B' },
    ]).map((t, index) => ({
      index,
      name: t.name.trim() || `الفريق ${index + 1}`,
      color: t.color || (index === 0 ? '#38BDF8' : '#F59E0B'),
      points: 0,
      strikes: 0,
      streak: 0,
      participantIds: t.participantIds ?? [],
      participantNames: t.participantNames ?? [],
    }));

    if (bankRow.id.startsWith('bank-import-')) {
      const participants = teams.flatMap((team) => team.participantIds);
      if (params.hostProfileId) participants.push(params.hostProfileId);
      const { byRoundType } = getBankAvailability(this.db, {
        bankId: bankRow.id, ageGroup: params.ageGroup, difficulty: params.difficulty,
        category: params.category, categories: params.categories,
        participantProfileIds: participants, exactRounds: true,
      });
      const remaining = new Map<RoundType, number>();
      for (const round of rounds) {
        const type = round.goldenTargetType ?? round.roundType;
        const available = remaining.get(type) ?? byRoundType[type]?.unseen ?? 0;
        if (available < 1) throw new Error(`لا توجد أسئلة جديدة تكفي لجولة «${round.titleAr}» ضمن الفلاتر المختارة.`);
        round.questionsPerRound = Math.min(available, round.questionsPerRound);
        remaining.set(type, available - round.questionsPerRound);
      }
    }

    const settings: SessionSettings = {
      soundEnabled: false,
      calmMode: true,
      reducedMotion: false,
      allowGuestMode: true,
      defaultTimerSec: 30,
      strikesLimit: 3,
      verbalRapidFireDefault: true,
      buzzerWrongRule: 'pass_to_other',
      adaptiveDifficulty: false,
      ...params.settings,
    };

    const session: InternalSessionState = {
      id,
      code,
      hostProfileId: params.hostProfileId,
      title: params.title.trim() || 'مسابقة تحدي الـ30 ثانية',
      bankId: bankRow.id,
      bankName: bankRow.name,
      lessonId: params.lessonId ?? bankRow.lesson_id,
      ageGroup: normalizeAgeGroup(params.ageGroup),
      difficulty: params.difficulty,
      category: params.category || 'الكل',
      categories: (params.categories ?? []).filter((c) => c && c !== 'الكل'),
      phase: skipVs ? 'playing' : 'vs',
      teams,
      activeTeamIndex: 0,
      buzzedTeamIndex: null,
      failedBuzzTeams: [],
      rounds,
      currentRoundIndex: 0,
      currentQuestionIndexInRound: 0,
      timerRemainingSec: rounds[0]?.durationSec ?? 30,
      timerRunning: false,
      timerEndsAtMs: null,
      answerRevealed: false,
      hasShownIntro: skipVs,
      isClutchTime: rounds.length === 1 || rounds[0]?.roundType === 'golden',
      overtimeTieBreaker: false,
      previousLeaderIndex: null,
      leadChangedAtMs: null,
      lastAnsweredSlotKey: null,
      lastFeedback: null,
      revealedClueCount: 1,
      memoryPhase: 'none',
      memoryRemainingSec: 0,
      memoryEndsAtMs: null,
      bidState: null,
      exhaustedNotice: null,
      settings,
      currentQuestion: null,
      recentPrompts: [],
      usedQuestionIdsInSession: [],
      stats: {
        totalAnswered: 0,
        totalCorrect: 0,
        rapidFireAnsweredInRound: 0,
      },
      scoreAuditLog: [],
      undoStack: [],
      objections: [],
      updatedAt: new Date().toISOString(),
    };

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO game_sessions (id, code, host_profile_id, bank_id, lesson_id, title, phase, state_json, settings_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          session.id,
          session.code,
          session.hostProfileId,
          session.bankId,
          session.lessonId,
          session.title,
          session.phase,
          JSON.stringify(session),
          JSON.stringify(settings)
        );

      const insertScore = this.db.prepare(
        `INSERT INTO scores (id, session_id, team_index, team_name, team_color, points, strikes, streak)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0)`
      );
      const insertPart = this.db.prepare(
        `INSERT INTO session_participants (id, session_id, profile_id, team_index, nickname)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const team of teams) {
        insertScore.run(`sc-${crypto.randomUUID().slice(0, 8)}`, session.id, team.index, team.name, team.color);
        team.participantIds.forEach((pid, idx) => {
          insertPart.run(
            `part-${crypto.randomUUID().slice(0, 8)}`,
            session.id,
            pid.startsWith('guest-') ? null : pid,
            team.index,
            team.participantNames[idx] || team.name
          );
        });
      }

      const insertRound = this.db.prepare(
        `INSERT INTO rounds (id, session_id, round_number, round_type, title, config_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const r of rounds) {
        insertRound.run(
          `rnd-${crypto.randomUUID().slice(0, 8)}`,
          session.id,
          r.roundNumber,
          r.roundType,
          r.titleAr,
          JSON.stringify(r),
          r.roundNumber === 1 ? 'active' : 'pending'
        );
      }
    })();

    if (skipVs) {
      this.drawQuestionForCurrentSlot(session, true);
    }

    this.sessionCache.set(code, session);
    return session;
  }

  private generateUniqueCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[crypto.randomInt(0, chars.length)];
      }
      const exists = this.db.prepare(`SELECT 1 FROM game_sessions WHERE code = ?`).get(code);
      if (!exists) return code;
    }
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  getSessionInternal(code: string): InternalSessionState | null {
    const normCode = code.toUpperCase().trim();
    if (this.sessionCache.has(normCode)) {
      return this.sessionCache.get(normCode)!;
    }
    const row = this.db
      .prepare(`SELECT state_json FROM game_sessions WHERE code = ?`)
      .get(normCode) as { state_json: string } | undefined;
    if (!row) return null;
    const parsed = JSON.parse(row.state_json) as InternalSessionState;
    // Hydrate defaults for sessions created before upgrades
    parsed.failedBuzzTeams = parsed.failedBuzzTeams ?? [];
    parsed.scoreAuditLog = parsed.scoreAuditLog ?? [];
    parsed.stats = parsed.stats ?? { totalAnswered: 0, totalCorrect: 0, rapidFireAnsweredInRound: 0 };
    parsed.hasShownIntro = parsed.hasShownIntro ?? true;
    parsed.isClutchTime = parsed.isClutchTime ?? false;
    parsed.overtimeTieBreaker = parsed.overtimeTieBreaker ?? false;
    parsed.previousLeaderIndex = parsed.previousLeaderIndex ?? null;
    parsed.leadChangedAtMs = parsed.leadChangedAtMs ?? null;
    parsed.lastAnsweredSlotKey = parsed.lastAnsweredSlotKey ?? null;
    parsed.categories = parsed.categories ?? [];
    parsed.bidState = parsed.bidState ?? null;
    this.sessionCache.set(normCode, parsed);
    return parsed;
  }

  getSessionView(code: string, includeHostSecret: boolean): GameSessionView | null {
    const s = this.getSessionInternal(code);
    if (!s) return null;
    if (this.syncLiveTimer(s)) {
      this.saveSession(s);
    }
    return this.projectView(s, includeHostSecret);
  }

  private projectView(s: InternalSessionState, includeHostSecret: boolean): GameSessionView {
    let qView: AudienceQuestionView | null = null;
    if (s.currentQuestion) {
      const q = s.currentQuestion;
      const revealed = s.answerRevealed;
      qView = {
        id: q.id,
        bankId: q.bankId,
        roundType: q.roundType,
        category: q.category,
        ageGroup: q.ageGroup,
        difficulty: q.difficulty,
        difficultyLevel: q.difficultyLevel,
        prompt: q.prompt,
        options: q.options,
        cluesCount: q.clues.length,
        revealedClues: q.clues.slice(0, Math.max(1, s.revealedClueCount)),
        orderCriteria: q.orderCriteria,
        memoryItems: s.memoryPhase === 'memorize' || revealed ? q.memoryItems : [],
        memoryPhase: s.memoryPhase,
        memoryRemainingSec: s.memoryRemainingSec,
        sourcePage: q.sourcePage,
        isReligious: q.isReligious,
        ...(revealed
          ? {
              revealedAnswerText: q.acceptableAnswers[0] ?? '',
              revealedAcceptableAnswers: q.acceptableAnswers,
              revealedCorrectIndex: q.correctIndex,
              revealedExplanation: q.explanation,
              revealedOddReason: q.oddReason,
            }
          : {}),
      };
    }

    const view: GameSessionView = {
      id: s.id,
      code: s.code,
      title: s.title,
      bankId: s.bankId,
      bankName: s.bankName,
      lessonId: s.lessonId,
      ageGroup: s.ageGroup,
      difficulty: s.difficulty,
      category: s.category,
      categories: s.categories,
      phase: s.phase,
      teams: s.teams,
      activeTeamIndex: s.activeTeamIndex,
      buzzedTeamIndex: s.buzzedTeamIndex,
      failedBuzzTeams: s.failedBuzzTeams,
      rounds: s.rounds,
      currentRoundIndex: s.currentRoundIndex,
      currentQuestionIndexInRound: s.currentQuestionIndexInRound,
      timerRemainingSec: s.timerRemainingSec,
      timerRunning: s.timerRunning,
      timerEndsAtMs: s.timerEndsAtMs,
      answerRevealed: s.answerRevealed,
      hasShownIntro: s.hasShownIntro,
      isClutchTime: s.isClutchTime,
      overtimeTieBreaker: s.overtimeTieBreaker,
      leadChangedAtMs: s.leadChangedAtMs,
      lastFeedback: s.lastFeedback,
      revealedClueCount: s.revealedClueCount,
      memoryPhase: s.memoryPhase,
      memoryRemainingSec: s.memoryRemainingSec,
      bidState: s.bidState,
      exhaustedNotice: s.exhaustedNotice,
      settings: s.settings,
      currentQuestion: qView,
      stats: s.stats,
      scoreAuditLog: includeHostSecret ? s.scoreAuditLog.slice(-40) : undefined,
      updatedAt: s.updatedAt,
    };

    if (includeHostSecret) {
      view.hostSecret = {
        acceptableAnswers: s.currentQuestion?.acceptableAnswers ?? [],
        requiredCount: s.currentQuestion?.requiredCount,
        correctIndex: s.currentQuestion?.correctIndex,
        explanation: s.currentQuestion?.explanation,
        oddReason: s.currentQuestion?.oddReason,
        sourceExcerpt: s.currentQuestion?.sourceExcerpt,
        sourcePage: s.currentQuestion?.sourcePage,
        undoStackCount: s.undoStack.length,
        objections: s.objections,
      };
    }

    return view;
  }

  private saveSession(s: InternalSessionState) {
    s.updatedAt = new Date().toISOString();
    this.sessionCache.set(s.code, s);
    this.db
      .prepare(`UPDATE game_sessions SET phase = ?, state_json = ?, settings_json = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(s.phase, JSON.stringify(s), JSON.stringify(s.settings), s.id);

    const updateScore = this.db.prepare(
      `UPDATE scores SET points = ?, strikes = ?, streak = ?, updated_at = datetime('now') WHERE session_id = ? AND team_index = ?`
    );
    for (const t of s.teams) {
      updateScore.run(t.points, t.strikes, t.streak, s.id, t.index);
    }
  }

  broadcast(code: string) {
    const s = this.getSessionInternal(code);
    if (!s) return;
    const clients = this.rooms.get(code);
    if (!clients) return;

    const hostMsg = JSON.stringify({
      type: 'session:sync',
      payload: this.projectView(s, true),
    });
    const audienceMsg = JSON.stringify({
      type: 'session:sync',
      payload: this.projectView(s, false),
    });

    for (const c of clients) {
      if (c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(c.role === 'host' ? hostMsg : audienceMsg);
      }
    }
  }

  private pushUndo(s: InternalSessionState, descriptionAr: string) {
    s.undoStack.push({
      id: crypto.randomUUID().slice(0, 8),
      descriptionAr,
      teamScores: s.teams.map((t) => ({ points: t.points, strikes: t.strikes, streak: t.streak })),
      questionIndex: s.currentQuestionIndexInRound,
      roundIndex: s.currentRoundIndex,
      answerRevealed: s.answerRevealed,
      timestamp: new Date().toISOString(),
    });
    if (s.undoStack.length > 25) s.undoStack.shift();
  }

  private recordAudit(s: InternalSessionState, teamIndex: number, delta: number, reason: string) {
    const team = s.teams[teamIndex];
    const round = s.rounds[s.currentRoundIndex];
    s.scoreAuditLog.push({
      id: `aud-${crypto.randomUUID().slice(0, 8)}`,
      teamIndex,
      teamName: team?.name ?? `الفريق ${teamIndex + 1}`,
      delta,
      reason,
      roundTitle: round?.titleAr ?? 'المسابقة',
      timestamp: new Date().toISOString(),
    });
    if (s.scoreAuditLog.length > 150) s.scoreAuditLog.shift();
  }

  private updateLeaderState(s: InternalSessionState): boolean {
    if (s.teams.length < 2) return false;
    const win = determineWinner(s.teams);
    if (win.isTie || win.winnerIndices.length !== 1) return false;
    const newLeader = win.winnerIndices[0];
    const prev = s.previousLeaderIndex;
    s.previousLeaderIndex = newLeader;
    if (prev !== null && prev !== newLeader) {
      s.leadChangedAtMs = Date.now();
      return true;
    }
    return false;
  }

  private buildCurrentSlotKey(s: InternalSessionState): string | null {
    if (!s.currentQuestion) return null;
    return `${s.currentRoundIndex}:${s.currentQuestionIndexInRound}:${s.currentQuestion.id}`;
  }

  private drawQuestionForCurrentSlot(s: InternalSessionState, startTimer = false) {
    const round = s.rounds[s.currentRoundIndex];
    if (!round) {
      s.phase = 'finished';
      s.timerRunning = false;
      s.timerEndsAtMs = null;
      return;
    }

    s.isClutchTime =
      s.overtimeTieBreaker ||
      s.currentRoundIndex === s.rounds.length - 1 ||
      round.roundType === 'golden';

    // Adaptive numeric difficulty level based on recent accuracy
    let adaptiveLevel = s.settings.targetDifficultyLevel;
    if (s.settings.adaptiveDifficulty && s.stats.totalAnswered >= 2) {
      const acc = s.stats.totalCorrect / Math.max(1, s.stats.totalAnswered);
      if (acc >= 0.8) adaptiveLevel = 5;
      else if (acc >= 0.6) adaptiveLevel = 4;
      else if (acc >= 0.4) adaptiveLevel = 3;
      else adaptiveLevel = 2;
    }

    const allParticipants = s.teams.flatMap((t) => t.participantIds);
    if (s.hostProfileId && s.bankId.startsWith('bank-import-')) allParticipants.push(s.hostProfileId);
    const draw = selectNextQuestionTx(this.db, {
      bankId: s.bankId,
      roundType: round.roundType,
      goldenTargetType: round.goldenTargetType,
      ageGroup: s.ageGroup,
      difficulty: s.difficulty,
      targetDifficultyLevel: adaptiveLevel,
      adaptiveDifficulty: s.settings.adaptiveDifficulty,
      category: s.category,
      categories: s.categories,
      participantProfileIds: allParticipants,
      sessionId: s.id,
      recentSessionPrompts: s.recentPrompts.slice(-10),
      excludeQuestionIds: s.usedQuestionIdsInSession,
    });

    if (draw.exhausted || !draw.question) {
      s.currentQuestion = null;
      s.bidState = null;
      s.timerRunning = false;
      s.timerEndsAtMs = null;
      s.exhaustedNotice = {
        exhausted: true,
        message: draw.messageAr || 'انتهت الأسئلة غير المستخدمة في هذه الفئة.',
        availableCategories: draw.availableCategories,
      };
      return;
    }

    s.exhaustedNotice = null;
    s.currentQuestion = draw.question;
    s.usedQuestionIdsInSession.push(draw.question.id);
    s.recentPrompts.push(draw.question.prompt);
    s.answerRevealed = false;
    s.buzzedTeamIndex = null;
    s.failedBuzzTeams = [];
    s.lastAnsweredSlotKey = null;
    s.revealedClueCount = 1;

    const effectiveType =
      round.roundType === 'golden' && round.goldenTargetType ? round.goldenTargetType : round.roundType;
    const now = Date.now();
    if (effectiveType === 'bid_challenge') {
      const maxPossible = new Set(draw.question.acceptableAnswers.map(normalizeArabicText).filter(Boolean)).size;
      const starter = s.activeTeamIndex % Math.max(1, s.teams.length);
      const nextTurn = s.teams.length > 1 ? (starter + 1) % s.teams.length : starter;
      s.bidState = {
        phase: 'bidding',
        currentBid: 1,
        bidderTeamIndex: starter,
        startingTeamIndex: starter,
        turnTeamIndex: nextTurn,
        maxPossible,
        challenged: false,
        acceptedAnswers: [],
        lastDuplicateWarning: null,
      };
      s.memoryPhase = 'none';
      s.memoryRemainingSec = 0;
      s.memoryEndsAtMs = null;
      s.timerRemainingSec = round.durationSec;
      s.timerRunning = false; // Countdown starts once challenged/accepted!
      s.timerEndsAtMs = null;
    } else if (round.roundType === 'memory' && draw.question.memoryItems.length > 0) {
      s.bidState = null;
      const memSec = draw.question.memoryRevealSeconds || round.memoryRevealSec || 8;
      s.memoryPhase = 'memorize';
      s.memoryRemainingSec = memSec;
      s.memoryEndsAtMs = now + memSec * 1000;
      s.timerRunning = false;
      s.timerRemainingSec = round.durationSec;
      s.timerEndsAtMs = null;
    } else {
      s.bidState = null;
      s.memoryPhase = 'none';
      s.memoryRemainingSec = 0;
      s.memoryEndsAtMs = null;
      s.timerRemainingSec = round.durationSec;
      s.timerRunning = startTimer;
      s.timerEndsAtMs = startTimer ? now + round.durationSec * 1000 : null;
    }
  }

  private advanceSprintQuestionPreservingClock(s: InternalSessionState, round: RoundConfig) {
    const keepRunning = s.timerRunning;
    const keepEnds = s.timerEndsAtMs;
    const keepRem = s.timerRemainingSec;
    if (s.currentQuestionIndexInRound + 1 < round.questionsPerRound && keepRem > 0) {
      s.currentQuestionIndexInRound += 1;
      this.drawQuestionForCurrentSlot(s, keepRunning);
      s.timerRunning = keepRunning;
      s.timerEndsAtMs = keepEnds;
      s.timerRemainingSec = keepRem;
    } else {
      s.answerRevealed = true;
      s.timerRunning = false;
      s.timerEndsAtMs = null;
    }
  }

  handleBuzz(code: string, teamIndex: number): GameSessionView | null {
    const s = this.getSessionInternal(code);
    if (!s || s.phase !== 'playing') return null;
    this.syncLiveTimer(s);
    if (s.answerRevealed || s.timerRemainingSec <= 0) return null;
    if (s.settings.hostControlled && (!s.timerRunning || s.currentQuestion?.roundType !== 'buzzer')) return null;
    if (teamIndex < 0 || teamIndex >= s.teams.length) return null;
    if (s.failedBuzzTeams.includes(teamIndex)) return null;
    if (s.buzzedTeamIndex !== null) return null;

    s.buzzedTeamIndex = teamIndex;
    s.activeTeamIndex = teamIndex;
    this.saveSession(s);
    this.broadcast(code);
    return this.projectView(s, false);
  }

  private completeBidChallengeInternal(s: InternalSessionState) {
    const round = s.rounds[s.currentRoundIndex];
    if (!round || !s.bidState || s.answerRevealed) return;
    const slotKey = this.buildCurrentSlotKey(s);
    if (slotKey && s.lastAnsweredSlotKey === slotKey) return;

    this.pushUndo(s, 'حسم جولة مين يزوّد');
    const result = resolveBidChallengePoints({
      currentBid: s.bidState.currentBid,
      bidderTeamIndex: s.bidState.bidderTeamIndex,
      acceptedCount: s.bidState.acceptedAnswers.length,
      teamCount: s.teams.length,
      multiplier: round.multiplier,
    });
    const winnerTeam = s.teams[result.winnerTeamIndex];
    if (winnerTeam && result.pointsAwarded > 0) {
      winnerTeam.points += result.pointsAwarded;
      winnerTeam.streak += 1;
      for (const pid of winnerTeam.participantIds) {
        if (!pid || pid.startsWith('guest-')) continue;
        this.db
          .prepare(`UPDATE profiles SET total_correct = total_correct + 1, xp = xp + ? WHERE id = ?`)
          .run(result.pointsAwarded, pid);
      }
      this.recordAudit(
        s,
        result.winnerTeamIndex,
        result.pointsAwarded,
        result.succeeded
          ? `نجاح مين يزوّد (${s.bidState.acceptedAnswers.length}/${s.bidState.currentBid})`
          : `فوز الخصم بتحدي مين يزوّد (${s.bidState.acceptedAnswers.length}/${s.bidState.currentBid})`
      );
    }
    if (!result.succeeded && s.teams[s.bidState.bidderTeamIndex]) {
      s.teams[s.bidState.bidderTeamIndex].streak = 0;
    }
    s.stats.totalAnswered += 1;
    if (result.succeeded) s.stats.totalCorrect += 1;

    if (s.currentQuestion) {
      this.db
        .prepare(
          `INSERT INTO answers (id, session_id, question_id, team_index, profile_id, submitted_answer, is_correct, points_delta)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          `ans-${crypto.randomUUID().slice(0, 8)}`,
          s.id,
          s.currentQuestion.id,
          s.bidState.bidderTeamIndex,
          null,
          s.bidState.acceptedAnswers.join('، ') || 'لم تكتمل الإجابات',
          result.succeeded ? 1 : 0,
          result.pointsAwarded
        );
    }

    const leadChanged = this.updateLeaderState(s);
    const bidderName = s.teams[s.bidState.bidderTeamIndex]?.name ?? 'المزايد';
    s.lastFeedback = {
      type: result.succeeded ? (leadChanged ? 'lead_change' : 'correct') : 'wrong',
      message: result.succeeded
        ? `نجح ${bidderName} في ذكر ${s.bidState.acceptedAnswers.length}/${s.bidState.currentBid}! +${result.pointsAwarded} نقاط`
        : `توقّف ${bidderName} عند ${s.bidState.acceptedAnswers.length}/${s.bidState.currentBid} — كسب ${winnerTeam?.name ?? 'المنافس'} +${result.pointsAwarded} نقطتين`,
      pointsDelta: result.pointsAwarded,
      teamIndex: result.winnerTeamIndex,
      atMs: Date.now(),
    };

    if (slotKey) s.lastAnsweredSlotKey = slotKey;
    s.bidState.phase = 'judging';
    s.answerRevealed = true;
    s.timerRunning = false;
    s.timerEndsAtMs = null;
  }

  handleBidAction(
    code: string,
    action: string,
    payload: Record<string, unknown> = {},
    isHost = false
  ): { ok: boolean; error?: string; view: GameSessionView } | null {
    const s = this.getSessionInternal(code);
    if (!s || s.phase !== 'playing' || !s.bidState || (s.settings.hostControlled && !isHost)) return null;
    this.syncLiveTimer(s);
    const round = s.rounds[s.currentRoundIndex];
    if (!round) return null;

    const stripAl = (txt: string) => normalizeArabicText(txt).replace(/^ال/, '');

    if (action === 'bid_raise') {
      if (s.bidState.phase !== 'bidding') {
        return { ok: false, error: 'انتهت مرحلة المزايدة وبدأ التنفيذ.', view: this.projectView(s, isHost) };
      }
      const teamIdx = typeof payload.teamIndex === 'number' ? payload.teamIndex : s.bidState.turnTeamIndex;
      if (teamIdx < 0 || teamIdx >= s.teams.length) {
        return { ok: false, error: 'الفريق المحدد غير صالح.', view: this.projectView(s, isHost) };
      }
      const inc = Number(payload.increment ?? 1);
      const targetBid =
        typeof payload.targetBid === 'number'
          ? Math.round(payload.targetBid)
          : s.bidState.currentBid + (inc >= 2 ? 2 : 1);

      if (targetBid <= s.bidState.currentBid || targetBid > s.bidState.maxPossible) {
        return {
          ok: false,
          error: `العدد يجب أن يكون بين ${s.bidState.currentBid + 1} و${s.bidState.maxPossible}.`,
          view: this.projectView(s, isHost),
        };
      }

      s.bidState.currentBid = targetBid;
      s.bidState.bidderTeamIndex = teamIdx;
      s.bidState.turnTeamIndex = s.teams.length > 1 ? (teamIdx + 1) % s.teams.length : teamIdx;
      s.bidState.lastDuplicateWarning = null;

      if (targetBid >= s.bidState.maxPossible) {
        s.bidState.phase = 'executing';
        s.bidState.challenged = true;
        s.activeTeamIndex = teamIdx;
        s.timerRemainingSec = round.durationSec;
        s.timerRunning = true;
        s.timerEndsAtMs = Date.now() + round.durationSec * 1000;
      }

      this.saveSession(s);
      this.broadcast(code);
      return { ok: true, view: this.projectView(s, isHost) };
    }

    if (action === 'bid_challenge' || action === 'bid_pass') {
      if (s.bidState.phase !== 'bidding') {
        return { ok: false, error: 'بدأ التحدي بالفعل.', view: this.projectView(s, isHost) };
      }
      s.bidState.phase = 'executing';
      s.bidState.challenged = true;
      s.activeTeamIndex = s.bidState.bidderTeamIndex;
      s.bidState.lastDuplicateWarning = null;
      s.timerRemainingSec = round.durationSec;
      s.timerRunning = true;
      s.timerEndsAtMs = Date.now() + round.durationSec * 1000;
      this.saveSession(s);
      this.broadcast(code);
      return { ok: true, view: this.projectView(s, isHost) };
    }

    if (action === 'bid_record_answer') {
      if (s.bidState.phase === 'bidding' || s.answerRevealed) {
        return { ok: false, error: 'التحدي ليس في مرحلة استقبال الإجابات.', view: this.projectView(s, isHost) };
      }
      const raw = String(payload.answerText || '').trim();
      const norm = stripAl(raw);
      if (!norm) {
        return { ok: false, error: 'أدخل إجابة غير فارغة.', view: this.projectView(s, isHost) };
      }

      const isDup = s.bidState.acceptedAnswers.some((existing) => stripAl(existing) === norm);
      if (isDup) {
        s.bidState.lastDuplicateWarning = `الإجابة «${raw}» مكررة في هذه الجولة ولا تُحتسب مرتين.`;
        this.saveSession(s);
        this.broadcast(code);
        return { ok: false, error: s.bidState.lastDuplicateWarning, view: this.projectView(s, isHost) };
      }

      const hostConfirmed = Boolean(isHost && payload.hostConfirmed !== false);
      const acceptable = s.currentQuestion?.acceptableAnswers ?? [];
      if (!hostConfirmed && acceptable.length > 0) {
        const matched = acceptable.some((acc) => {
          const accNorm = stripAl(acc);
          return accNorm === norm || (norm.length >= 3 && (accNorm.includes(norm) || norm.includes(accNorm)));
        });
        if (!matched) {
          s.bidState.lastDuplicateWarning = `الإجابة «${raw}» غير مطابقة لقائمة هذا التحدي.`;
          this.saveSession(s);
          this.broadcast(code);
          return { ok: false, error: s.bidState.lastDuplicateWarning, view: this.projectView(s, isHost) };
        }
      }

      s.bidState.lastDuplicateWarning = null;
      s.bidState.acceptedAnswers.push(raw);
      if (s.bidState.acceptedAnswers.length >= s.bidState.currentBid) {
        this.completeBidChallengeInternal(s);
      }

      this.saveSession(s);
      this.broadcast(code);
      return { ok: true, view: this.projectView(s, isHost) };
    }

    if (action === 'bid_complete' && isHost) {
      this.completeBidChallengeInternal(s);
      this.saveSession(s);
      this.broadcast(code);
      return { ok: true, view: this.projectView(s, true) };
    }

    return null;
  }

  submitPlayerAnswer(
    code: string,
    teamIndex: number,
    submitted: string | number | string[],
    profileId?: string
  ): { isCorrect: boolean; pointsDelta: number; view: GameSessionView } | null {
    const s = this.getSessionInternal(code);
    if (!s || !s.currentQuestion || s.phase !== 'playing' || s.settings.hostControlled) return null;
    this.syncLiveTimer(s);
    if (s.answerRevealed || s.timerRemainingSec <= 0) return null;

    const round = s.rounds[s.currentRoundIndex];
    if (!round) return null;

    const slotKey = this.buildCurrentSlotKey(s);
    if (slotKey && s.lastAnsweredSlotKey === slotKey) {
      return null;
    }

    const targetTeamIdx = s.buzzedTeamIndex ?? teamIndex;
    const team = s.teams[targetTeamIdx];
    if (!team) return null;

    this.pushUndo(s, `تسجيل إجابة فريق ${team.name}`);

    const evalRes = evaluateAnswerMatch(s.currentQuestion, submitted);
    let pointsDelta = 0;
    const isSprint = ROUND_RULES[round.roundType].multiQuestionWithinTimer;
    const isBuzzerFlow = round.roundType === 'buzzer' || s.buzzedTeamIndex !== null;

    s.stats.totalAnswered += 1;
    if (isSprint) s.stats.rapidFireAnsweredInRound += 1;

    if (evalRes.isCorrect) {
      if (slotKey) s.lastAnsweredSlotKey = slotKey;
      team.streak += 1;
      s.stats.totalCorrect += 1;
      pointsDelta = calculateQuestionPoints({
        round,
        isCorrect: true,
        revealedClueCount: s.revealedClueCount,
        streakCount: team.streak,
        matchedListCount: evalRes.matchedCount,
        totalRequiredListCount: s.currentQuestion.requiredCount ?? Math.min(3, s.currentQuestion.acceptableAnswers.length || 3),
      });
      team.points += pointsDelta;
      this.recordAudit(s, targetTeamIdx, pointsDelta, `إجابة صحيحة (${round.titleAr})`);

      const creditIds = profileId ? [profileId] : team.participantIds;
      for (const pid of creditIds) {
        if (!pid || pid.startsWith('guest-')) continue;
        this.db
          .prepare(`UPDATE profiles SET total_correct = total_correct + 1, xp = xp + ? WHERE id = ?`)
          .run(pointsDelta, pid);
      }
    } else {
      team.streak = 0;
      team.strikes = Math.min(s.settings.strikesLimit, team.strikes + 1);
      if (isBuzzerFlow) {
        if (!s.failedBuzzTeams.includes(targetTeamIdx)) {
          s.failedBuzzTeams.push(targetTeamIdx);
        }
        if (s.settings.buzzerWrongRule === 'penalty_and_pass' && team.points > 0) {
          team.points = Math.max(0, team.points - 1);
          pointsDelta = -1;
          this.recordAudit(s, targetTeamIdx, -1, 'خصم خطأ جرس');
        } else {
          this.recordAudit(s, targetTeamIdx, 0, 'خطأ جرس وانتقال الفرصة');
        }
        s.buzzedTeamIndex = null;
      } else {
        this.recordAudit(s, targetTeamIdx, 0, `إجابة غير صحيحة (${round.titleAr})`);
      }

      if (s.teams.length > 1) {
        const nextEligible = s.teams.findIndex((t) => !s.failedBuzzTeams.includes(t.index));
        s.activeTeamIndex = nextEligible >= 0 ? nextEligible : (targetTeamIdx + 1) % s.teams.length;
      }
    }

    this.db
      .prepare(
        `INSERT INTO answers (id, session_id, question_id, team_index, profile_id, submitted_answer, is_correct, points_delta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `ans-${crypto.randomUUID().slice(0, 8)}`,
        s.id,
        s.currentQuestion.id,
        targetTeamIdx,
        profileId && !profileId.startsWith('guest-') ? profileId : null,
        Array.isArray(submitted) ? submitted.join('، ') : String(submitted),
        evalRes.isCorrect ? 1 : 0,
        pointsDelta
      );

    const leadChanged = evalRes.isCorrect ? this.updateLeaderState(s) : false;
    const isStreakMilestone = evalRes.isCorrect && (team.streak === 3 || team.streak === 5);

    const canTransferBuzzerTurn =
      !evalRes.isCorrect &&
      isBuzzerFlow &&
      s.teams.length > 1 &&
      s.failedBuzzTeams.length < s.teams.length &&
      s.timerRemainingSec > 0;

    s.lastFeedback = {
      type: evalRes.isCorrect
        ? round.roundType === 'golden'
          ? 'golden'
          : isStreakMilestone
          ? 'streak'
          : leadChanged
          ? 'lead_change'
          : 'correct'
        : 'wrong',
      message: evalRes.isCorrect
        ? leadChanged
          ? `تبدّل الصدارة! +${pointsDelta} لـ ${team.name}`
          : isStreakMilestone
          ? `سلسلة ${team.streak} إجابات متتالية لـ ${team.name}! +${pointsDelta}`
          : `إجابة صحيحة! +${pointsDelta} نقطة لـ ${team.name}`
        : canTransferBuzzerTurn
        ? `خطأ من ${team.name} — انتقلت فرصة الجرس للفريق المنافس!`
        : `إجابة غير صحيحة (${team.name})`,
      pointsDelta,
      teamIndex: targetTeamIdx,
      atMs: Date.now(),
    };

    if (canTransferBuzzerTurn) {
      // Keep question unrevealed and clock running so opponent can buzz/answer!
      s.answerRevealed = false;
    } else if (isSprint && s.timerRemainingSec > 0) {
      this.advanceSprintQuestionPreservingClock(s, round);
    } else {
      if (slotKey) s.lastAnsweredSlotKey = slotKey;
      s.answerRevealed = true;
      s.timerRunning = false;
      s.timerEndsAtMs = null;
    }

    this.saveSession(s);
    this.broadcast(code);
    return {
      isCorrect: evalRes.isCorrect,
      pointsDelta,
      view: this.projectView(s, false),
    };
  }

  handleHostAction(
    code: string,
    action: string,
    payload: Record<string, unknown> = {}
  ): GameSessionView | null {
    const s = this.getSessionInternal(code);
    if (!s) return null;
    this.syncLiveTimer(s);
    const round = s.rounds[s.currentRoundIndex];

    switch (action) {
      case 'start_match': {
        if (s.phase !== 'vs' && s.phase !== 'lobby') break;
        s.phase = 'playing';
        s.currentRoundIndex = 0;
        s.currentQuestionIndexInRound = 0;
        s.stats.rapidFireAnsweredInRound = 0;
        this.drawQuestionForCurrentSlot(s, !s.settings.hostControlled);
        break;
      }

      case 'mark_intro_seen': {
        s.hasShownIntro = true;
        break;
      }

      case 'start_timer': {
        if (!s.currentQuestion || s.answerRevealed || s.memoryPhase === 'memorize' || s.bidState?.phase === 'bidding') break;
        if (s.phase === 'paused') s.phase = 'playing';
        const dur = s.timerRemainingSec > 0 ? s.timerRemainingSec : round?.durationSec ?? 30;
        s.timerRemainingSec = dur;
        s.timerRunning = true;
        s.timerEndsAtMs = Date.now() + dur * 1000;
        break;
      }

      case 'pause_timer': {
        if (s.timerRunning && s.timerEndsAtMs) {
          s.timerRemainingSec = Math.max(0, Math.ceil((s.timerEndsAtMs - Date.now()) / 1000));
        }
        s.timerRunning = false;
        s.timerEndsAtMs = null;
        s.phase = 'paused';
        break;
      }

      case 'resume_timer': {
        s.phase = 'playing';
        if (s.timerRemainingSec > 0 && !s.answerRevealed) {
          s.timerRunning = true;
          s.timerEndsAtMs = Date.now() + s.timerRemainingSec * 1000;
        }
        break;
      }

      case 'reset_timer': {
        if (s.settings.hostControlled) s.phase = 'playing';
        const dur = round?.durationSec ?? 30;
        s.timerRemainingSec = dur;
        s.timerRunning = true;
        s.timerEndsAtMs = Date.now() + dur * 1000;
        break;
      }

      case 'set_timer': {
        const sec = Math.max(0, Math.min(180, Math.round(Number(payload.seconds ?? 0))));
        s.timerRemainingSec = sec;
        s.timerRunning = sec > 0;
        s.timerEndsAtMs = sec > 0 ? Date.now() + sec * 1000 : null;
        break;
      }

      case 'jump_round': {
        const targetIdx = Math.max(0, Math.min(s.rounds.length - 1, Number(payload.roundIndex ?? 0)));
        s.currentRoundIndex = targetIdx;
        s.currentQuestionIndexInRound = 0;
        s.stats.rapidFireAnsweredInRound = 0;
        s.phase = 'playing';
        this.drawQuestionForCurrentSlot(s, true);
        break;
      }

      case 'reveal_answer': {
        s.answerRevealed = true;
        s.timerRunning = false;
        s.timerEndsAtMs = null;
        break;
      }

      case 'reveal_next_clue': {
        if (s.currentQuestion && s.revealedClueCount < s.currentQuestion.clues.length) {
          s.revealedClueCount += 1;
        }
        break;
      }

      case 'award_team': {
        if ((s.phase !== 'playing' && s.phase !== 'paused') || !s.currentQuestion || s.bidState || s.answerRevealed) break;
        const teamIdx = Number(payload.teamIndex ?? s.activeTeamIndex);
        const team = s.teams[teamIdx];
        if (!team || !round) break;
        const slotKey = this.buildCurrentSlotKey(s);
        const isSprint = ROUND_RULES[round.roundType].multiQuestionWithinTimer;
        if (!isSprint && slotKey && s.lastAnsweredSlotKey === slotKey && s.answerRevealed) {
          break;
        }
        this.pushUndo(s, `احتساب نقاط لـ ${team.name}`);
        const pts =
          typeof payload.customPoints === 'number'
            ? payload.customPoints
            : calculateQuestionPoints({
                round,
                isCorrect: true,
                revealedClueCount: s.revealedClueCount,
                streakCount: team.streak + 1,
                matchedListCount: typeof payload.matchedListCount === 'number'
                  ? Math.max(1, Math.trunc(payload.matchedListCount)) : undefined,
                totalRequiredListCount: s.currentQuestion.requiredCount ?? Math.min(3, s.currentQuestion.acceptableAnswers.length || 3),
              });
        team.points += pts;
        team.streak += 1;
        s.stats.totalAnswered += 1;
        s.stats.totalCorrect += 1;
        this.recordAudit(s, teamIdx, pts, `احتساب المشرف (${round.titleAr})`);
        const leadChanged = this.updateLeaderState(s);
        const isStreak = team.streak === 3 || team.streak === 5;

        s.lastFeedback = {
          type:
            round.roundType === 'golden'
              ? 'golden'
              : isStreak
              ? 'streak'
              : leadChanged
              ? 'lead_change'
              : 'correct',
          message: leadChanged
            ? `تبدّل الصدارة! +${pts} لـ ${team.name}`
            : `احتسب المشرف +${pts} نقطة لـ ${team.name}`,
          pointsDelta: pts,
          teamIndex: teamIdx,
          atMs: Date.now(),
        };

        if (isSprint && s.timerRunning && s.timerRemainingSec > 0) {
          s.stats.rapidFireAnsweredInRound += 1;
          this.advanceSprintQuestionPreservingClock(s, round);
        } else {
          if (slotKey) s.lastAnsweredSlotKey = slotKey;
          s.answerRevealed = true;
          s.timerRunning = false;
          s.timerEndsAtMs = null;
        }
        break;
      }

      case 'adjust_points': {
        const teamIdx = Number(payload.teamIndex ?? 0);
        const delta = Number(payload.delta ?? 0);
        const team = s.teams[teamIdx];
        if (!team) break;
        this.pushUndo(s, `تعديل نقاط ${team.name} (${delta > 0 ? `+${delta}` : delta})`);
        const before = team.points;
        team.points = Math.max(0, team.points + delta);
        this.recordAudit(s, teamIdx, team.points - before, String(payload.reason || 'تعديل يدوي من المشرف'));
        this.updateLeaderState(s);
        break;
      }

      case 'strike_team': {
        if (s.settings.hostControlled && (!s.currentQuestion || s.bidState || s.answerRevealed)) break;
        const teamIdx = Number(payload.teamIndex ?? s.activeTeamIndex);
        const team = s.teams[teamIdx];
        if (!team) break;
        this.pushUndo(s, `تسجيل خطأ على ${team.name}`);
        team.strikes = Math.min(s.settings.strikesLimit, team.strikes + 1);
        team.streak = 0;
        s.stats.totalAnswered += 1;

        const isSprint = round ? ROUND_RULES[round.roundType].multiQuestionWithinTimer : false;
        const isBuzzerFlow = round?.roundType === 'buzzer' || s.buzzedTeamIndex !== null;

        if (isBuzzerFlow) {
          if (!s.failedBuzzTeams.includes(teamIdx)) s.failedBuzzTeams.push(teamIdx);
          if (s.settings.buzzerWrongRule === 'penalty_and_pass' && team.points > 0) {
            team.points = Math.max(0, team.points - 1);
            this.recordAudit(s, teamIdx, -1, 'خطأ جرس (-1)');
          } else {
            this.recordAudit(s, teamIdx, 0, 'خطأ جرس');
          }
          s.buzzedTeamIndex = null;
          if (s.teams.length > 1) {
            const nextEligible = s.teams.findIndex((t) => !s.failedBuzzTeams.includes(t.index));
            s.activeTeamIndex = nextEligible >= 0 ? nextEligible : (teamIdx + 1) % s.teams.length;
          }
        } else {
          this.recordAudit(s, teamIdx, 0, 'تسجيل خطأ');
          if (s.teams.length > 1) {
            s.activeTeamIndex = (teamIdx + 1) % s.teams.length;
          }
        }

        const transferTurn =
          isBuzzerFlow && s.teams.length > 1 && s.failedBuzzTeams.length < s.teams.length && s.timerRemainingSec > 0;

        s.lastFeedback = {
          type: 'wrong',
          message: transferTurn
            ? `خطأ على ${team.name} — انتقلت الفرصة للمنافس`
            : `خطأ مسجل على ${team.name}`,
          pointsDelta: 0,
          teamIndex: teamIdx,
          atMs: Date.now(),
        };

        if (isSprint && round && s.timerRunning && s.timerRemainingSec > 0) {
          s.stats.rapidFireAnsweredInRound += 1;
          this.advanceSprintQuestionPreservingClock(s, round);
        } else if ((isBuzzerFlow && !transferTurn) || (s.settings.hostControlled && !isBuzzerFlow)) {
          s.answerRevealed = true;
          s.timerRunning = false;
          s.timerEndsAtMs = null;
        }
        break;
      }

      case 'skip_question': {
        this.pushUndo(s, 'تخطي السؤال الحالي');
        s.lastFeedback = {
          type: 'skip',
          message: 'تم تخطي السؤال',
          pointsDelta: 0,
          teamIndex: null,
          atMs: Date.now(),
        };
        const isSprint = round ? ROUND_RULES[round.roundType].multiQuestionWithinTimer : false;
        if (isSprint && round && s.timerRunning && s.timerRemainingSec > 0) {
          // NEVER reset the 30-second countdown on rapid_fire / true_false skip!
          this.advanceSprintQuestionPreservingClock(s, round);
        } else {
          this.drawQuestionForCurrentSlot(s, !s.settings.hostControlled);
        }
        break;
      }

      case 'next_question': {
        if (!round || (s.phase !== 'playing' && s.phase !== 'paused')) break;
        if (s.currentQuestionIndexInRound + 1 < round.questionsPerRound) {
          s.currentQuestionIndexInRound += 1;
          if (s.teams.length > 1) {
            s.activeTeamIndex = (s.activeTeamIndex + 1) % s.teams.length;
          }
          s.phase = 'playing';
          this.drawQuestionForCurrentSlot(s, !s.settings.hostControlled);
        } else if (s.currentRoundIndex + 1 < s.rounds.length) {
          s.phase = 'round_summary';
          s.timerRunning = false;
          s.timerEndsAtMs = null;
        } else {
          s.phase = 'finished';
          s.timerRunning = false;
          s.timerEndsAtMs = null;
        }
        break;
      }

      case 'next_round': {
        if (s.settings.hostControlled && s.phase !== 'round_summary') break;
        if (s.currentRoundIndex + 1 < s.rounds.length) {
          s.currentRoundIndex += 1;
          s.currentQuestionIndexInRound = 0;
          s.stats.rapidFireAnsweredInRound = 0;
          s.phase = 'playing';
          this.drawQuestionForCurrentSlot(s, !s.settings.hostControlled);
        } else {
          s.phase = 'finished';
          s.timerRunning = false;
          s.timerEndsAtMs = null;
        }
        break;
      }

      case 'start_overtime': {
        const winCheck = determineWinner(s.teams);
        if (!winCheck.isTie || s.teams.length < 2) break;
        const overtimeConfig = buildDefaultRoundConfigs(['buzzer'], {
          buzzer: {
            titleAr: 'جولة كسر التعادل الحاسمة',
            questionsPerRound: 1,
            durationSec: 30,
          },
        })[0];
        overtimeConfig.roundNumber = s.rounds.length + 1;
        s.rounds.push(overtimeConfig);
        s.currentRoundIndex = s.rounds.length - 1;
        s.currentQuestionIndexInRound = 0;
        s.overtimeTieBreaker = true;
        s.isClutchTime = true;
        s.phase = 'playing';
        this.drawQuestionForCurrentSlot(s, true);
        break;
      }

      case 'swap_participant': {
        const fromTeam = Number(payload.fromTeamIndex ?? 0);
        const toTeam = Number(payload.toTeamIndex ?? 1);
        const pIdx = Number(payload.participantIndex ?? 0);
        if (
          s.teams[fromTeam] &&
          s.teams[toTeam] &&
          fromTeam !== toTeam &&
          pIdx >= 0 &&
          pIdx < s.teams[fromTeam].participantNames.length
        ) {
          const [movedName] = s.teams[fromTeam].participantNames.splice(pIdx, 1);
          const [movedId] = s.teams[fromTeam].participantIds.splice(pIdx, 1);
          if (movedName) s.teams[toTeam].participantNames.push(movedName);
          if (movedId) s.teams[toTeam].participantIds.push(movedId);
        }
        break;
      }

      case 'undo': {
        const snap = s.undoStack.pop();
        if (!snap) break;
        snap.teamScores.forEach((sc, idx) => {
          if (s.teams[idx]) {
            s.teams[idx].points = sc.points;
            s.teams[idx].strikes = sc.strikes;
            s.teams[idx].streak = sc.streak;
          }
        });
        s.answerRevealed = snap.answerRevealed;
        s.scoreAuditLog.push({
          id: `aud-${crypto.randomUUID().slice(0, 8)}`,
          teamIndex: 0,
          teamName: 'الكل',
          delta: 0,
          reason: `تراجع: ${snap.descriptionAr}`,
          roundTitle: round?.titleAr ?? 'المسابقة',
          timestamp: new Date().toISOString(),
        });
        s.lastFeedback = {
          type: null,
          message: `تم التراجع عن: ${snap.descriptionAr}`,
          pointsDelta: 0,
          teamIndex: null,
          atMs: Date.now(),
        };
        break;
      }

      case 'exclude_question': {
        if (!s.currentQuestion) break;
        const qId = s.currentQuestion.id;
        this.db.prepare(`UPDATE questions SET status = 'archived' WHERE id = ?`).run(qId);
        this.db
          .prepare(
            `INSERT INTO question_reviews (id, question_id, reviewer_profile_id, action, notes, previous_status, new_status)
             VALUES (?, ?, ?, 'reject', ?, 'published', 'archived')`
          )
          .run(`rev-${crypto.randomUUID().slice(0, 8)}`, qId, s.hostProfileId, String(payload.reason || 'استبعاد أثناء الجلسة'));
        this.drawQuestionForCurrentSlot(s, true);
        break;
      }

      case 'flag_objection': {
        if (!s.currentQuestion) break;
        const obj: QuestionObjection = {
          id: `obj-${crypto.randomUUID().slice(0, 8)}`,
          questionId: s.currentQuestion.id,
          questionPrompt: s.currentQuestion.prompt,
          teamIndex: Number(payload.teamIndex ?? s.activeTeamIndex),
          reason: String(payload.reason || 'طلب مراجعة الإجابة'),
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        s.objections.push(obj);
        this.db
          .prepare(
            `INSERT INTO question_reviews (id, question_id, reviewer_profile_id, action, notes)
             VALUES (?, ?, ?, 'flag_objection', ?)`
          )
          .run(`rev-${crypto.randomUUID().slice(0, 8)}`, s.currentQuestion.id, s.hostProfileId, obj.reason);
        break;
      }

      case 'resolve_objection': {
        const objId = String(payload.objectionId || '');
        const decision = payload.decision === 'exclude' ? 'resolved_excluded' : 'resolved_valid';
        const found = s.objections.find((o) => o.id === objId);
        if (found) {
          found.status = decision;
          if (decision === 'resolved_excluded') {
            this.db.prepare(`UPDATE questions SET status = 'archived' WHERE id = ?`).run(found.questionId);
          }
        }
        break;
      }

      case 'bid_raise':
      case 'bid_challenge':
      case 'bid_pass':
      case 'bid_record_answer':
      case 'bid_complete': {
        const result = this.handleBidAction(code, action, payload, true);
        if (!result?.ok) throw new Error(result?.error ?? 'المزايدة غير متاحة الآن.');
        return result.view;
      }

      case 'switch_category': {
        s.category = String(payload.category || 'الكل');
        s.categories = Array.isArray(payload.categories)
          ? payload.categories.map((c) => String(c)).filter((c) => c && c !== 'الكل')
          : s.category !== 'الكل'
          ? [s.category]
          : [];
        this.drawQuestionForCurrentSlot(s, true);
        break;
      }

      case 'approve_cycle_reset': {
        const participantIds = s.teams.flatMap((t) => t.participantIds);
        if (s.hostProfileId && s.bankId.startsWith('bank-import-')) participantIds.push(s.hostProfileId);
        resetExposureCycleTx(this.db, participantIds, s.bankId, s.category);
        s.usedQuestionIdsInSession = [];
        this.drawQuestionForCurrentSlot(s, true);
        break;
      }

      case 'update_settings': {
        s.settings = { ...s.settings, ...(payload as Partial<SessionSettings>) };
        break;
      }

      case 'end_match': {
        s.phase = 'finished';
        s.timerRunning = false;
        s.timerEndsAtMs = null;
        break;
      }

      case 'resume_match': {
        if (s.phase === 'finished' || s.phase === 'paused') {
          s.phase = 'playing';
        }
        break;
      }
    }

    const winInfo = determineWinner(s.teams);
    if (s.phase === 'finished' && winInfo.winnerIndices.length === 1) {
      const winningTeam = s.teams[winInfo.winnerIndices[0]];
      for (const pid of winningTeam?.participantIds ?? []) {
        if (!pid || pid.startsWith('guest-')) continue;
        const row = this.db.prepare(`SELECT achievements_json FROM profiles WHERE id = ?`).get(pid) as
          | { achievements_json: string }
          | undefined;
        if (row) {
          const list = JSON.parse(row.achievements_json || '[]') as string[];
          if (!list.includes('بطل تحدي الـ30 ثانية')) {
            list.push('بطل تحدي الـ30 ثانية');
            this.db.prepare(`UPDATE profiles SET achievements_json = ? WHERE id = ?`).run(JSON.stringify(list), pid);
          }
        }
      }
    }

    this.saveSession(s);
    this.broadcast(code);
    return this.projectView(s, true);
  }
}
