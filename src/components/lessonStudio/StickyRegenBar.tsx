import React, { useState } from 'react';
import {
  CheckCircle2,
  PlusCircle,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { DIFFICULTY_LABELS } from '../../shared/gameRules';
import type {
  Difficulty,
  LessonBatchSummary,
  RegenerationSettings,
  RoundSuitabilityItem,
  RoundType,
} from '../../shared/types';

interface StickyRegenBarProps {
  lesson: LessonBatchSummary;
  selectedQuestionIds: string[];
  actualRejectedQuestionCount: number;
  settings: RegenerationSettings;
  busyAction: string | null;
  onChangeSettings: (next: RegenerationSettings) => void;
  onRegenerateRejected: () => void;
  onCompleteMissing: () => void;
  onRegenerateSelected: () => void;
  onGenerateMore: (count: number) => void;
}

export function StickyRegenBar({
  lesson,
  selectedQuestionIds,
  actualRejectedQuestionCount,
  settings,
  busyAction,
  onChangeSettings,
  onRegenerateRejected,
  onCompleteMissing,
  onRegenerateSelected,
  onGenerateMore,
}: StickyRegenBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreCount, setMoreCount] = useState(5);

  const rejectedCount = Math.max(actualRejectedQuestionCount, lesson.rejectedCount);
  const hasRejected = rejectedCount > 0;
  const missingCount = Math.max(0, lesson.requestedCount - lesson.verifiedCount);
  const suitability: RoundSuitabilityItem[] = lesson.roundSuitability ?? [];
  const selectableRounds = suitability.filter((s) => s.selectable && !s.isMultiplier);

  const togglePreferredRound = (rt: RoundType) => {
    const exists = settings.preferredRoundTypes.includes(rt);
    const next = exists
      ? settings.preferredRoundTypes.filter((x) => x !== rt)
      : [...settings.preferredRoundTypes, rt];
    onChangeSettings({ ...settings, preferredRoundTypes: next });
  };

  const renderSettingsPanel = () => (
    <div className="mt-3 rounded-2xl border border-sky-400/25 bg-[#060D24] p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-black text-white flex items-center gap-1.5">
          <Settings2 className="w-4 h-4 text-sky-400" />
          إعدادات إعادة التوليد والتحسين
        </span>
        <button
          type="button"
          onClick={() => setSettingsOpen(false)}
          className="text-slate-400 hover:text-white p-1"
          aria-label="إغلاق إعدادات إعادة التوليد"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-slate-400 font-bold mb-1">عدد البدائل المقترحة (1–3)</label>
          <select
            value={settings.alternativeCount}
            onChange={(e) =>
              onChangeSettings({
                ...settings,
                alternativeCount: Math.max(1, Math.min(3, Number(e.target.value || 2))),
              })
            }
            className="w-full rounded-xl bg-[#09143A] border border-white/15 px-3 py-1.5 text-white"
          >
            <option value={1}>بديل واحد (1)</option>
            <option value={2}>بديلان للمقارنة (2)</option>
            <option value={3}>ثلاثة بدائل (3)</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-400 font-bold mb-1">مستوى الصعوبة المستهدف</label>
          <select
            value={settings.targetDifficulty || ''}
            onChange={(e) =>
              onChangeSettings({
                ...settings,
                targetDifficulty: (e.target.value || undefined) as Difficulty | undefined,
              })
            }
            className="w-full rounded-xl bg-[#09143A] border border-white/15 px-3 py-1.5 text-white"
          >
            <option value="">حسب صعوبة الدرس ({DIFFICULTY_LABELS[lesson.difficulty]})</option>
            <option value="easy">{DIFFICULTY_LABELS.easy}</option>
            <option value="medium">{DIFFICULTY_LABELS.medium}</option>
            <option value="hard">{DIFFICULTY_LABELS.hard}</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-400 font-bold mb-1">آلية تطبيق الاستبدال</label>
          <select
            value={settings.applyMode}
            onChange={(e) =>
              onChangeSettings({
                ...settings,
                applyMode: e.target.value as 'preview' | 'auto',
              })
            }
            className="w-full rounded-xl bg-[#09143A] border border-white/15 px-3 py-1.5 text-white"
          >
            <option value="preview">معاينة البدائل قبل الاستبدال (آمن)</option>
            <option value="auto">اختيار الأول عند الإكمال التلقائي</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.prioritizeUndercoveredTopics}
            onChange={(e) =>
              onChangeSettings({ ...settings, prioritizeUndercoveredTopics: e.target.checked })
            }
            className="accent-sky-400 w-4 h-4"
          />
          <span>إعطاء الأولوية للمحاور الأقل تغطية في الدرس</span>
        </label>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">عدد «توليد المزيد»:</span>
          <input
            type="number"
            min={1}
            max={25}
            value={moreCount}
            onChange={(e) => setMoreCount(Math.max(1, Math.min(25, Number(e.target.value || 5))))}
            className="w-16 rounded-lg bg-[#09143A] border border-white/15 px-2 py-1 text-center font-bold text-white tabular-nums"
          />
        </div>
      </div>

      {selectableRounds.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-slate-400 font-bold">تفضيل أنواع الجولات أثناء التعويض:</div>
          <div className="flex flex-wrap gap-1.5">
            {selectableRounds.map((s) => {
              const active = settings.preferredRoundTypes.includes(s.roundType);
              return (
                <button
                  key={s.roundType}
                  type="button"
                  onClick={() => togglePreferredRound(s.roundType)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition whitespace-nowrap ${
                    active
                      ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                      : 'border-white/10 bg-[#09143A] text-slate-300'
                  }`}
                >
                  {s.nameAr}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Persistent Control Center */}
      <div
        data-testid="sticky-regen-bar-desktop"
        className="hidden md:block sticky top-3 z-30 rounded-2xl border border-sky-400/25 bg-[#09143A]/95 backdrop-blur-md p-3.5 shadow-[0_14px_38px_rgba(2,6,23,0.6)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs font-extrabold text-sky-300 shrink-0">
            <Wrench className="w-4 h-4" />
            <span>مركز إعادة التوليد والتحكم الدائم</span>
            <span className="text-slate-400 font-normal tabular-nums">
              · محفوظ {lesson.verifiedCount}/{lesson.requestedCount} · مرفوض {rejectedCount}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Regenerate Rejected — Always visible, explicitly disabled with clear message at 0 */}
            <button
              type="button"
              disabled={!hasRejected || Boolean(busyAction) || lesson.isProcessing}
              onClick={onRegenerateRejected}
              title={hasRejected ? 'توليد بدائل للأسئلة المرفوضة بالاستفادة من أسباب الرفض' : 'لا توجد أسئلة مرفوضة الآن'}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border transition whitespace-nowrap shrink-0 ${
                hasRejected
                  ? 'border-amber-400/45 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 cursor-pointer'
                  : 'border-white/10 bg-[#060D24]/80 text-slate-400 cursor-not-allowed opacity-75'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'rejected' ? 'animate-spin' : ''}`} />
              <span>{hasRejected ? `إعادة توليد المرفوض (${rejectedCount})` : 'لا توجد أسئلة مرفوضة الآن'}</span>
            </button>

            {/* 2. Complete Missing */}
            <button
              type="button"
              disabled={missingCount === 0 || Boolean(busyAction) || lesson.isProcessing}
              onClick={onCompleteMissing}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border transition whitespace-nowrap shrink-0 ${
                missingCount > 0
                  ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 cursor-pointer'
                  : 'border-white/10 bg-[#060D24]/80 text-slate-400 cursor-not-allowed opacity-75'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {missingCount > 0 ? `استكمال الناقص (+${missingCount})` : 'اكتمل العدد المطلوب'}
              </span>
            </button>

            {/* 3. Regenerate Selected (with preview) */}
            <button
              type="button"
              disabled={selectedQuestionIds.length === 0 || Boolean(busyAction) || lesson.isProcessing}
              onClick={onRegenerateSelected}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border transition whitespace-nowrap shrink-0 ${
                selectedQuestionIds.length > 0
                  ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30 cursor-pointer'
                  : 'border-white/10 bg-[#060D24]/80 text-slate-400 cursor-not-allowed opacity-75'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {selectedQuestionIds.length > 0
                  ? `معاينة بدائل المحدد (${selectedQuestionIds.length})`
                  : 'إعادة توليد المحدد (حدد سؤالاً)'}
              </span>
            </button>

            {/* 4. Generate More */}
            <button
              type="button"
              disabled={Boolean(busyAction) || lesson.isProcessing}
              onClick={() => onGenerateMore(moreCount)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border border-sky-400/45 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-45 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>توليد المزيد (+{moreCount})</span>
            </button>

            {/* 5. Settings Toggle */}
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border transition whitespace-nowrap shrink-0 cursor-pointer ${
                settingsOpen
                  ? 'border-sky-400 bg-sky-400 text-slate-950'
                  : 'border-white/15 bg-[#060D24] text-slate-200 hover:border-sky-400/40'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>الإعدادات</span>
            </button>
          </div>
        </div>

        {settingsOpen && renderSettingsPanel()}
      </div>

      {/* Mobile Compact Sticky Bar (<= 15% of viewport height) + Expandable Action Drawer */}
      <div
        data-testid="sticky-regen-bar-mobile"
        className="md:hidden fixed bottom-2 inset-x-2.5 z-40 rounded-2xl border border-sky-400/30 bg-[#09143A]/95 backdrop-blur-md px-3 py-2 shadow-[0_-8px_30px_rgba(2,6,23,0.75)] max-h-[14vh]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-bold text-slate-200 whitespace-nowrap tabular-nums">
            <span className="text-sky-300 font-black">{lesson.verifiedCount}/{lesson.requestedCount}</span>
            <span className="text-slate-400"> · مرفوض </span>
            <span className={hasRejected ? 'text-amber-300 font-black' : 'text-slate-300'}>{rejectedCount}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasRejected ? (
              <button
                type="button"
                disabled={Boolean(busyAction) || lesson.isProcessing}
                onClick={onRegenerateRejected}
                className="rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap"
              >
                إعادة المرفوض
              </button>
            ) : (
              <button
                type="button"
                disabled={Boolean(busyAction) || lesson.isProcessing}
                onClick={() => onGenerateMore(moreCount)}
                className="rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-200 px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap"
              >
                +{moreCount} إضافي
              </button>
            )}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-xl bg-sky-400 text-slate-950 px-2.5 py-1.5 text-[11px] font-black whitespace-nowrap"
            >
              إجراءات التوليد
            </button>
          </div>
        </div>
      </div>

      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end">
          <div className="w-full rounded-t-3xl border-t border-sky-400/30 bg-[#09143A] p-4 space-y-3 max-h-[82vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-sm font-black text-white">مركز إعادة التوليد والتحسين</span>
              <button
                type="button"
                aria-label="إغلاق قائمة إجراءات التوليد"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                disabled={!hasRejected || Boolean(busyAction) || lesson.isProcessing}
                onClick={() => {
                  setDrawerOpen(false);
                  onRegenerateRejected();
                }}
                className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold border text-right flex items-center justify-between ${
                  hasRejected
                    ? 'border-amber-400/45 bg-amber-500/15 text-amber-200'
                    : 'border-white/10 bg-[#060D24] text-slate-400 opacity-75'
                }`}
              >
                <span>{hasRejected ? `إعادة توليد المرفوض (${rejectedCount})` : 'لا توجد أسئلة مرفوضة الآن'}</span>
                <RefreshCw className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={missingCount === 0 || Boolean(busyAction) || lesson.isProcessing}
                onClick={() => {
                  setDrawerOpen(false);
                  onCompleteMissing();
                }}
                className="w-full rounded-xl px-4 py-2.5 text-xs font-bold border border-emerald-400/35 bg-emerald-500/15 text-emerald-200 disabled:opacity-50 text-right flex items-center justify-between"
              >
                <span>{missingCount > 0 ? `استكمال الأسئلة الناقصة (+${missingCount})` : 'اكتمل العدد المطلوب'}</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={selectedQuestionIds.length === 0 || Boolean(busyAction) || lesson.isProcessing}
                onClick={() => {
                  setDrawerOpen(false);
                  onRegenerateSelected();
                }}
                className="w-full rounded-xl px-4 py-2.5 text-xs font-bold border border-indigo-400/40 bg-indigo-500/15 text-indigo-100 disabled:opacity-50 text-right flex items-center justify-between"
              >
                <span>
                  {selectedQuestionIds.length > 0
                    ? `معاينة بدائل المحدد (${selectedQuestionIds.length})`
                    : 'إعادة توليد المحدد (حدد سؤالاً أولاً)'}
                </span>
                <Sparkles className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={Boolean(busyAction) || lesson.isProcessing}
                onClick={() => {
                  setDrawerOpen(false);
                  onGenerateMore(moreCount);
                }}
                className="w-full rounded-xl px-4 py-2.5 text-xs font-bold border border-sky-400/40 bg-sky-500/15 text-sky-200 text-right flex items-center justify-between"
              >
                <span>توليد المزيد من الأسئلة (+{moreCount}) للمحاور الأقل تغطية</span>
                <PlusCircle className="w-4 h-4" />
              </button>
            </div>

            {renderSettingsPanel()}
          </div>
        </div>
      )}
    </>
  );
}
