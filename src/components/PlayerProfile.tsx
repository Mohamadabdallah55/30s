import React, { useEffect, useState } from 'react';
import { ArrowRight, Award, BookOpen, CheckCircle2, LogOut, Trophy } from 'lucide-react';
import { AGE_GROUP_LABELS, DIFFICULTY_LABELS } from '../shared/gameRules';
import type { ProfilePublic } from '../shared/types';
import { apiFetch } from '../utils/api';
import { PlayerAvatar } from './BrandEmblem';

interface PlayerProfileProps {
  user: ProfilePublic | null;
  onBack: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}

interface MeResponse {
  profile: ProfilePublic;
  exposedCount: number;
  recentAnswers: Array<{
    is_correct: number;
    points_delta: number;
    created_at: string;
    category: string;
    difficulty: string;
    round_type: string;
  }>;
}

interface LeaderboardEntry {
  id: string;
  display_name: string;
  avatar_id: string;
  age_group: string;
  xp: number;
  total_correct: number;
}

export function PlayerProfile({ user, onBack, onOpenAuth, onLogout }: PlayerProfileProps) {
  const [meData, setMeData] = useState<MeResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const lbRes = await apiFetch<{ leaderboard: LeaderboardEntry[] }>('/api/leaderboard');
        if (active) setLeaderboard(lbRes.leaderboard);
        if (user) {
          const meRes = await apiFetch<MeResponse>('/api/auth/me');
          if (active) setMeData(meRes);
        } else {
          setMeData(null);
        }
      } catch {
        // Ignore
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [user]);

  const prof = meData?.profile || user;
  const accuracy =
    prof && prof.totalQuestionsSeen > 0
      ? Math.round((prof.totalCorrect / prof.totalQuestionsSeen) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-[#09143A] text-slate-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-white/10 text-sm font-bold"
          >
            <ArrowRight className="w-4 h-4" />
            <span>عودة خطوة</span>
          </button>

          {prof ? (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-sm font-bold text-rose-100"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-5 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-sm font-extrabold"
            >
              تسجيل الدخول أو إنشاء حساب
            </button>
          )}
        </div>

        {!prof ? (
          <div className="rounded-2xl bg-[#101E52] border border-sky-400/25 p-8 text-center space-y-4">
            <h1 className="text-2xl font-extrabold text-white">أنت تتصفح حالياً بوضع الضيف المؤقت</h1>
            <p className="text-slate-300 max-w-xl mx-auto text-sm leading-relaxed">
              يتيح وضع الضيف المشاركة السريعة في الحلقات، لكن حفظ التقدم والإحصاءات ومنع تكرار الأسئلة عند تغيير الجهاز يتطلب حساباً شخصياً دائماً.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-6 py-3 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-extrabold"
            >
              إنشاء حساب طالب أو تسجيل الدخول
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Card */}
            <div className="lg:col-span-2 rounded-2xl bg-[#101E52] border border-sky-400/25 p-6 space-y-6">
              <div className="flex items-center gap-4">
                <PlayerAvatar avatarId={prof.avatarId} size="lg" />
                <div>
                  <h1 className="text-2xl font-extrabold text-white">{prof.displayName}</h1>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mt-1">
                    <span>@{prof.username}</span>
                    <span>·</span>
                    <span>{AGE_GROUP_LABELS[prof.ageGroup]}</span>
                    <span>·</span>
                    <span className="text-sky-300 font-bold">
                      {prof.role === 'admin' ? 'إدارة المسجد' : prof.role === 'teacher' ? 'معلم / مشرف' : 'متسابق دائم'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-[#09143A] p-4 border border-white/10">
                  <div className="text-xs text-slate-400">الأسئلة المعروضة</div>
                  <div className="text-2xl font-extrabold text-white tabular-nums mt-1">
                    {prof.totalQuestionsSeen}
                  </div>
                </div>
                <div className="rounded-xl bg-[#09143A] p-4 border border-white/10">
                  <div className="text-xs text-slate-400">الإجابات الصحيحة</div>
                  <div className="text-2xl font-extrabold text-emerald-400 tabular-nums mt-1">
                    {prof.totalCorrect}
                  </div>
                </div>
                <div className="rounded-xl bg-[#09143A] p-4 border border-white/10">
                  <div className="text-xs text-slate-400">نسبة الدقة</div>
                  <div className="text-2xl font-extrabold text-sky-400 tabular-nums mt-1">{accuracy}%</div>
                </div>
                <div className="rounded-xl bg-[#09143A] p-4 border border-white/10">
                  <div className="text-xs text-slate-400">نقاط الخبرة (XP)</div>
                  <div className="text-2xl font-extrabold text-amber-400 tabular-nums mt-1">{prof.xp}</div>
                </div>
              </div>

              {/* Categories & Difficulties */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-[#09143A] p-4 border border-white/10">
                  <h2 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-sky-400" />
                    <span>الفئات التي لعبتها</span>
                  </h2>
                  {Object.keys(prof.categoriesPlayed).length === 0 ? (
                    <p className="text-xs text-slate-400">لم تُلعب فئات بعد — ابدأ أول تحدٍ!</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(prof.categoriesPlayed).map(([cat, count]) => (
                        <div key={cat} className="flex items-center justify-between text-xs">
                          <span className="text-slate-200">{cat}</span>
                          <span className="tabular-nums font-bold text-sky-300">{count} سؤال</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-[#09143A] p-4 border border-white/10">
                  <h2 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span>مستويات الصعوبة والإنجازات</span>
                  </h2>
                  <div className="space-y-1.5 text-xs mb-3">
                    {(['easy', 'medium', 'hard'] as const).map((d) => (
                      <div key={d} className="flex items-center justify-between">
                        <span className="text-slate-300">{DIFFICULTY_LABELS[d]}</span>
                        <span className="tabular-nums font-bold text-white">
                          {prof.difficultiesPlayed[d] ?? 0}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-white/10 flex flex-wrap gap-2">
                    {prof.achievements.map((ach) => (
                      <span
                        key={ach}
                        className="inline-flex items-center gap-1 text-xs text-amber-300 font-bold"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{ach}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {meData && (
                <div className="text-xs text-slate-400">
                  سجل عدم التكرار المحفوظ في قاعدة البيانات: <span className="tabular-nums text-sky-300 font-bold">{meData.exposedCount}</span> سؤال محصّن ضد التكرار لحسابك.
                </div>
              )}
            </div>

            {/* Leaderboard */}
            <div className="rounded-2xl bg-[#101E52] border border-sky-400/25 p-6">
              <h2 className="text-lg font-extrabold text-white mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <span>لوحة المتصدرين (مسجد ابن تيمية)</span>
              </h2>
              {loading ? (
                <p className="text-sm text-slate-400">جاري التحميل...</p>
              ) : (
                <div className="space-y-2.5">
                  {leaderboard.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between p-3 rounded-xl border ${
                        idx === 0
                          ? 'bg-amber-400/15 border-amber-400/40'
                          : 'bg-[#09143A] border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 text-center font-extrabold tabular-nums text-sm text-slate-300">
                          {idx + 1}
                        </span>
                        <PlayerAvatar avatarId={entry.avatar_id} size="sm" />
                        <span className="text-sm font-bold text-white truncate">{entry.display_name}</span>
                      </div>
                      <span className="tabular-nums text-sm font-extrabold text-amber-300 shrink-0">
                        {entry.xp} XP
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
