import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, Send, Sparkles, Swords, X } from 'lucide-react';
import type { GameSessionView } from '../shared/types';
import { apiFetch } from '../utils/api';
import { NashmiMascot } from './ShowArt';

type BotTabMode = 'guide' | 'ai';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isError?: boolean;
  suggestions?: string[];
}

interface JordanianBotDrawerProps {
  open: boolean;
  onClose: () => void;
  screen: string;
  activeSession: GameSessionView | null;
  onStartVsBot: () => Promise<void> | void;
}

const DEFAULT_GUIDE_SUGGESTIONS = [
  'شو كل الـ12 جولة؟',
  'كيف النقاط بتنحسب؟',
  'كيف ألعب ضد نشمي؟',
  'كيف أربط التلفزيون والموبايلات؟',
];

const LIVE_SESSION_SUGGESTIONS = [
  'شو وضع المباراة؟',
  'اشرحلي الجولة الحالية',
  'كيف النقاط بتنحسب؟',
  'اعطيني تكتيك للفوز',
];

export function JordanianBotDrawer({
  open,
  onClose,
  screen,
  activeSession,
  onStartVsBot,
}: JordanianBotDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<BotTabMode>('guide');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [startingBotMatch, setStartingBotMatch] = useState(false);

  const initialSuggestions = activeSession ? LIVE_SESSION_SUGGESTIONS : DEFAULT_GUIDE_SUGGESTIONS;

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'model',
      text: 'أهلاً أهلاً بالنشمي! أنا نشمي ⭐ مساعد تحدّي الـ30 ثانية وبعرف كل شي عن اللعبة (الـ12 جولة، النقاط، المزايدة، والجرس) — وإذا اختلفتوا على إجابة أو بدك تتحدّاني، أنا الحكم والخصم!',
      suggestions: initialSuggestions,
    },
  ]);

  useEffect(() => {
    const nextSuggestions = activeSession ? LIVE_SESSION_SUGGESTIONS : DEFAULT_GUIDE_SUGGESTIONS;
    setMessages((prev) =>
      prev.map((m) => (m.id === 'welcome' ? { ...m, suggestions: nextSuggestions } : m))
    );
  }, [activeSession?.code]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [messages, open]);

  const sendQuery = async (rawText: string, overrideTab?: BotTabMode) => {
    const text = rawText.trim();
    if (!text || sending) return;
    const activeTab = overrideTab ?? tab;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setSending(true);

    try {
      if (activeTab === 'guide') {
        const res = await apiFetch<{ reply: string; suggestions?: string[] }>('/api/bot/guide', {
          method: 'POST',
          body: JSON.stringify({
            message: text,
            screen,
            sessionCode: activeSession?.code,
          }),
        });
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            role: 'model',
            text: res.reply,
            suggestions: res.suggestions ?? initialSuggestions,
          },
        ]);
      } else {
        const historyPayload = nextHistory
          .filter((m) => !m.isError && m.id !== 'welcome')
          .slice(-8)
          .map((m) => ({ role: m.role, text: m.text }));
        const res = await apiFetch<{ reply: string; model?: string }>('/api/bot/chat', {
          method: 'POST',
          body: JSON.stringify({
            message: text,
            history: historyPayload.slice(0, -1),
            screen,
            sessionCode: activeSession?.code,
          }),
        });
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            role: 'model',
            text: res.reply,
            suggestions: initialSuggestions,
          },
        ]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر التواصل مع نشمي حالياً.';
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'model',
          text: msg,
          isError: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendQuery(input);
  };

  const handlePlayVsBotClick = async () => {
    if (startingBotMatch) return;
    setStartingBotMatch(true);
    try {
      await onStartVsBot();
      onClose();
    } finally {
      setStartingBotMatch(false);
    }
  };

  const latestBotMsgWithSuggestions = [...messages]
    .reverse()
    .find((m) => m.role === 'model' && !m.isError && m.id !== 'welcome' && m.suggestions?.length);
  const chips = activeSession
    ? (latestBotMsgWithSuggestions?.suggestions ?? LIVE_SESSION_SUGGESTIONS)
    : (latestBotMsgWithSuggestions?.suggestions ?? DEFAULT_GUIDE_SUGGESTIONS);

  return (
    <dialog
      ref={dialogRef}
      className="nashmi-dialog"
      dir="rtl"
      aria-labelledby="nashmi-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="nashmi-modal">
        {/* Top Header Row — matching the screenshot layout cleanly */}
        <div className="nashmi-modal__head">
          <div className="nashmi-modal__brand">
            <NashmiMascot size={40} mood={sending ? 'thinking' : 'happy'} />
            <div>
              <h2 id="nashmi-dialog-title">نشمي</h2>
              <span>
                مساعد تحدّي الـ30 ثانية
                {activeSession ? ` · #${activeSession.code}` : ''}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="nashmi-modal__close"
            aria-label="إغلاق نافذة نشمي"
            onClick={onClose}
          >
            <X size={20} strokeWidth={2.6} />
          </button>
        </div>

        {/* Mode Switcher + Quick Vs Bot Action */}
        <div className="nashmi-modal__toolbar">
          <div className="nashmi-tabs" role="tablist" aria-label="وضع مساعد نشمي">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'guide'}
              className={tab === 'guide' ? 'is-active' : ''}
              onClick={() => setTab('guide')}
            >
              <Bot size={15} />
              <span>مرشد نشمي الفوري</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'ai'}
              className={tab === 'ai' ? 'is-active' : ''}
              onClick={() => setTab('ai')}
            >
              <Sparkles size={15} />
              <span>دردشة الذكاء (Gemini)</span>
            </button>
          </div>

          {!activeSession?.settings.botOpponent?.enabled && (
            <button
              type="button"
              className="nashmi-vs-cta"
              disabled={startingBotMatch}
              onClick={handlePlayVsBotClick}
            >
              <Swords size={15} />
              <span>{startingBotMatch ? 'عم يجهّز…' : 'تحدّى نشمي هسا!'}</span>
            </button>
          )}
        </div>

        {/* Chat Stream */}
        <div className="nashmi-modal__body" aria-live="polite">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`nashmi-msg ${msg.role === 'user' ? 'nashmi-msg--user' : 'nashmi-msg--bot'} ${
                msg.isError ? 'nashmi-msg--error' : ''
              }`}
            >
              <div className="nashmi-msg__bubble">
                <p>{msg.text}</p>
                {msg.isError && tab === 'ai' && (
                  <button
                    type="button"
                    className="nashmi-error-switch"
                    onClick={() => setTab('guide')}
                  >
                    استخدم «مرشد نشمي الفوري» مجاناً
                  </button>
                )}
              </div>
              {msg.role === 'model' && (
                <NashmiMascot
                  size={28}
                  mood={msg.isError ? 'tease' : 'happy'}
                  className="nashmi-msg__avatar"
                />
              )}
            </div>
          ))}

          {sending && (
            <div className="nashmi-msg nashmi-msg--bot">
              <div className="nashmi-msg__bubble">
                <p>نشمي عم يرتّبلك الجواب…</p>
              </div>
              <NashmiMascot size={28} mood="thinking" className="nashmi-msg__avatar" />
            </div>
          )}

          {/* Suggested Prompt Pills */}
          <div className="nashmi-chips" aria-label="أسئلة سريعة">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                className="nashmi-chip"
                disabled={sending}
                onClick={() => void sendQuery(chip)}
              >
                {chip}
              </button>
            ))}
          </div>

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Composer */}
        <form className="nashmi-modal__composer" onSubmit={handleSubmit}>
          <label htmlFor="nashmi-chat-input" className="sr-only">
            اسأل نشمي عن أي شيء في اللعبة
          </label>
          <input
            id="nashmi-chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="...اسأل نشمي عن أي شيء في اللعبة"
            maxLength={1000}
            autoComplete="off"
          />
          <button
            type="submit"
            className="nashmi-send-btn"
            aria-label="إرسال السؤال"
            disabled={sending || !input.trim()}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </dialog>
  );
}
