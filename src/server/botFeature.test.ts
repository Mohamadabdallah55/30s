import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createAppAndHub } from './appFactory';
import { createDatabase } from './db';
import { seedDatabase } from './seed';
import type { GameSessionView } from '../shared/types';

async function withServer(
  fn: (
    baseUrl: string,
    db: ReturnType<typeof createDatabase>,
    hub: ReturnType<typeof createAppAndHub>['hub']
  ) => Promise<void>
) {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const { app, hub } = createAppAndHub(db);
  const server = http.createServer(app);
  hub.attach(server);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await fn(baseUrl, db, hub);
  } finally {
    hub.stop();
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
}

test('POST /api/bot/guide explains all 12 rounds and live match context without leaking secret answers', async () => {
  await withServer(async (baseUrl, _db, hub) => {
    const resAll = await fetch(`${baseUrl}/api/bot/guide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'شو كل الـ12 جولة؟', screen: 'title' }),
    });
    assert.equal(resAll.status, 200);
    const jsonAll = (await resAll.json()) as { reply: string; suggestions: string[]; mode: string };
    assert.equal(jsonAll.mode, 'local_guide');
    assert.ok(jsonAll.reply.includes('الرشاش') && jsonAll.reply.includes('مين يزوّد') && jsonAll.reply.includes('الجولة الذهبية'));
    assert.ok(jsonAll.suggestions.length >= 2);

    // Create a live session and start play
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'اختبار نشمي',
        bankId: 'bank-general-mosque',
        teams: [
          { name: 'فريق النشامى', color: '#38BDF8', participantIds: [], participantNames: [] },
          { name: 'نشمي (البوت الأردني)', color: '#F59E0B', participantIds: [], participantNames: [] },
        ],
        roundTypes: ['multiple_choice'],
        settings: {
          showMode: true,
          botOpponent: { enabled: true, teamIndex: 1, skill: 'balanced', personaName: 'نشمي (البوت الأردني)' },
        },
      }),
    });
    assert.equal(createRes.status, 201);
    const { session } = (await createRes.json()) as { session: GameSessionView };
    assert.equal(session.settings.botOpponent?.enabled, true);

    hub.handleHostAction(session.code, 'start_match');
    hub.handleHostAction(session.code, 'skip_intro');

    const internal = hub.getSessionInternal(session.code)!;
    const secretAnswer = internal.currentQuestion!.acceptableAnswers[0];
    assert.ok(secretAnswer);

    const statusRes = await fetch(`${baseUrl}/api/bot/guide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'شو وضع المباراة وهل تقدر تغششني الإجابة؟',
        screen: 'arena',
        sessionCode: session.code,
      }),
    });
    assert.equal(statusRes.status, 200);
    const statusJson = (await statusRes.json()) as { reply: string };
    assert.ok(statusJson.reply.includes('فريق النشامى'));
    assert.ok(!statusJson.reply.includes(secretAnswer), 'Must never leak secret acceptable answer');
  });
});

test('POST /api/bot/chat validates empty input and fails honestly with 503 when GEMINI_API_KEY is missing', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    await withServer(async (baseUrl) => {
      const emptyRes = await fetch(`${baseUrl}/api/bot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '   ' }),
      });
      assert.equal(emptyRes.status, 400);

      const noKeyRes = await fetch(`${baseUrl}/api/bot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'اشرحلي لعبة مين يزوّد' }),
      });
      assert.equal(noKeyRes.status, 503);
      const body = (await noKeyRes.json()) as { code: string; error: string };
      assert.equal(body.code, 'GEMINI_KEY_MISSING');
      assert.ok(body.error.includes('GEMINI_API_KEY'));
    });
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

test('Playable Jordanian bot (نشمي) reacts on its turn after human answers and emits Jordanian banter', async () => {
  await withServer(async (baseUrl, _db, hub) => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'مواجهة نشمي',
        bankId: 'bank-general-mosque',
        teams: [
          { name: 'أبو العز', color: '#38BDF8', participantIds: [], participantNames: [] },
          { name: 'نشمي (البوت الأردني)', color: '#F59E0B', participantIds: [], participantNames: [] },
        ],
        roundTypes: ['multiple_choice'],
        roundOverrides: {
          multiple_choice: { questionsPerRound: 2, durationSec: 30 },
        },
        settings: {
          showMode: true,
          botOpponent: { enabled: true, teamIndex: 1, skill: 'fierce', personaName: 'نشمي (البوت الأردني)' },
        },
      }),
    });
    assert.equal(createRes.status, 201);
    const cookie = (createRes.headers.get('set-cookie') ?? '').split(';')[0];
    const { session } = (await createRes.json()) as { session: GameSessionView };

    hub.handleHostAction(session.code, 'start_match');
    hub.handleHostAction(session.code, 'skip_intro');

    // Question 1: activeTeamIndex starts at 0 (human), then human answers
    const q1 = hub.getSessionInternal(session.code)!.currentQuestion!;
    const ans1 = q1.correctIndex ?? q1.acceptableAnswers[0];
    const humanRes = await fetch(`${baseUrl}/api/sessions/${session.code}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ teamIndex: 0, submitted: ans1, questionId: q1.id }),
    });
    assert.equal(humanRes.status, 200);
    const afterHuman = (await humanRes.json()) as { view: GameSessionView };
    assert.ok(afterHuman.view.botChat?.text, 'Bot should react with Jordanian banter after human answers');

    // Advance to question 2, whose turn switches to team 1 (bot)
    hub.handleHostAction(session.code, 'next_question');
    const stateBeforeBot = hub.getSessionInternal(session.code)!;
    assert.equal(stateBeforeBot.activeTeamIndex, 1);

    // Wait up to ~2.5s for wsHub tickInterval + processBotTurn to answer for bot
    let afterBot = hub.getSessionView(session.code, false)!;
    const deadline = Date.now() + 4000;
    while (!afterBot.answerRevealed && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
      afterBot = hub.getSessionView(session.code, false)!;
    }

    assert.equal(afterBot.answerRevealed, true, 'Bot should have submitted its answer during its turn');
    assert.ok(afterBot.botChat?.text, 'Bot should update botChat when playing its turn');
  });
});
