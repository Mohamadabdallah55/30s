import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type Database from 'better-sqlite3';
import {
  answerGameQuestionLocally,
  buildJordanianBotSystemPrompt,
  type BotAdvisorContext,
} from '../shared/jordanianBot';
import type { GameSessionHub } from './wsHub';

export class BotGeminiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function buildAdvisorContextFromDb(
  db: Database.Database,
  hub: GameSessionHub,
  screen?: string,
  sessionCode?: string
): BotAdvisorContext {
  const session = sessionCode ? hub.getSessionView(sessionCode, false) : null;
  let availableBanksCount = 0;
  let totalQuestionsCount = 0;
  try {
    availableBanksCount = (
      db.prepare(`SELECT COUNT(*) as c FROM question_banks WHERE is_active = 1`).get() as { c: number }
    ).c;
    totalQuestionsCount = (
      db.prepare(`SELECT COUNT(*) as c FROM questions WHERE status = 'published'`).get() as { c: number }
    ).c;
  } catch {
    // Ignore DB stats errors
  }
  return {
    screen,
    session,
    availableBanksCount,
    totalQuestionsCount,
  };
}

export function getLocalJordanianGuideReply(
  db: Database.Database,
  hub: GameSessionHub,
  params: { message: string; screen?: string; sessionCode?: string }
) {
  const context = buildAdvisorContextFromDb(db, hub, params.screen, params.sessionCode);
  return answerGameQuestionLocally(params.message, context);
}

export interface BotChatMessage {
  role: 'user' | 'model';
  text: string;
}

export async function callJordanianBotGemini(
  db: Database.Database,
  hub: GameSessionHub,
  params: {
    message: string;
    history?: BotChatMessage[];
    screen?: string;
    sessionCode?: string;
  }
): Promise<{ reply: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new BotGeminiError(
      'مفتاح خدمة الذكاء الاصطناعي (GEMINI_API_KEY) مش مضاف على الخادم. تقدر تستخدم «مرشد نشمي الفوري» مجاناً أو تضيف المفتاح من Settings > Secrets.',
      503,
      'GEMINI_KEY_MISSING'
    );
  }

  const context = buildAdvisorContextFromDb(db, hub, params.screen, params.sessionCode);
  const systemInstruction = buildJordanianBotSystemPrompt(context);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const safeHistory = (params.history ?? []).slice(-8).map((item) => ({
    role: item.role === 'model' ? ('model' as const) : ('user' as const),
    parts: [{ text: String(item.text || '').slice(0, 1200) }],
  }));

  const contents = [
    ...safeHistory,
    {
      role: 'user' as const,
      parts: [{ text: params.message.slice(0, 1200) }],
    },
  ];

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    const rawText = (response.text ?? '').trim();
    const text = rawText
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .trim();
    if (!text) {
      throw new BotGeminiError('ما رجع رد واضح من نموذج الذكاء الاصطناعي. جرّب تسأل مرة ثانية.', 502, 'EMPTY_RESPONSE');
    }
    return { reply: text, model: 'gemini-4-hydrogen' };
  } catch (err) {
    if (err instanceof BotGeminiError) throw err;
    const raw = err instanceof Error ? err.message : String(err);
    if (/403|PERMISSION_DENIED|API_KEY_INVALID|400/i.test(raw)) {
      throw new BotGeminiError(
        'مفتاح Gemini API غير صالح أو مرفوض. تأكد من المفتاح في Settings > Secrets.',
        403,
        'API_KEY_INVALID'
      );
    }
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) {
      throw new BotGeminiError(
        'انشغلت حصة الذكاء الاصطناعي المجانية هسا (429). استخدم «مرشد نشمي الفوري» أو جرّب بعد شوي.',
        429,
        'QUOTA_EXHAUSTED'
      );
    }
    throw new BotGeminiError('تعذّر الاتصال بمحرك الذكاء الاصطناعي حالياً. استخدم المرشد الفوري أو حاول بعد لحظة.', 502, 'UPSTREAM_ERROR');
  }
}
