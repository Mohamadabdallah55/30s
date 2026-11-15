import React, { useState } from 'react';
import { Check, CheckCircle2, Sparkles, X } from 'lucide-react';
import { DIFFICULTY_LABELS, ROUND_RULES } from '../../shared/gameRules';
import { COGNITIVE_LEVEL_LABELS } from '../../shared/lessonIntelligence';
import type {
  QuestionAlternativeCandidate,
  QuestionRecord,
} from '../../shared/types';

export interface QuestionPreviewBundle {
  originalQuestion: QuestionRecord;
  alternatives: QuestionAlternativeCandidate[];
}

interface QuestionPreviewModalProps {
  previews: QuestionPreviewBundle[];
  applyingId: string | null;
  onApply: (targetQuestionId: string, candidate: QuestionAlternativeCandidate, approveAfterApply: boolean) => Promise<void>;
  onClose: () => void;
}

export function QuestionPreviewModal({
  previews,
  applyingId,
  onApply,
  onClose,
}: QuestionPreviewModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [approveOnReplace, setApproveOnReplace] = useState(false);

  if (previews.length === 0) return null;
  const current = previews[Math.min(activeIndex, previews.length - 1)];
  const orig = current.originalQuestion;

  return (
    <div
      data-testid="question-preview-modal"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div className="w-full max-w-4xl rounded-3xl border border-sky-400/30 bg-[#09143A] p-5 sm:p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              <span>معاينة البدائل المقترحة قبل الاستبدال ({activeIndex + 1} من {previews.length})</span>
            </div>
            <h3 className="text-lg font-black text-white mt-0.5">
              قارن بين السؤال الأصلي والبدائل قبل تأكيد الاستبدال
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {previews.length > 1 && (
              <div className="flex items-center gap-1">
                {previews.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold tabular-nums ${
                      idx === activeIndex
                        ? 'bg-sky-400 text-slate-950'
                        : 'bg-[#060D24] text-slate-300 border border-white/10'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/15 bg-[#060D24] px-3 py-1.5 text-xs font-bold text-slate-200 hover:border-white/30 flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              <span>إلغاء والإبقاء على الأصلي</span>
            </button>
          </div>
        </div>

        {/* Original Question Snapshot */}
        <div className="rounded-2xl border border-white/15 bg-[#060D24]/90 p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-black text-slate-300">السؤال الأصلي الحالي</span>
            <span className="text-slate-400">
              {ROUND_RULES[orig.roundType]?.nameAr ?? orig.roundType} ·{' '}
              {DIFFICULTY_LABELS[orig.difficulty]} · ص {orig.sourcePage ?? 1}
            </span>
          </div>
          <div className="text-sm font-bold text-white leading-relaxed">{orig.prompt}</div>
          <div className="text-xs text-emerald-300">
            الإجابة: {orig.acceptableAnswers.join(' / ')}
          </div>
          {orig.sourceExcerpt && (
            <p className="text-[11px] text-slate-400">«{orig.sourceExcerpt}»</p>
          )}
        </div>

        {/* Alternatives List */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black text-sky-300">
              البدائل المولدة ({current.alternatives.length})
            </span>
            {!orig.isReligious && (
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={approveOnReplace}
                  onChange={(e) => setApproveOnReplace(e.target.checked)}
                  className="accent-emerald-400 w-4 h-4"
                />
                <span>اعتماد البديل للعب مباشرة بعد الاستبدال</span>
              </label>
            )}
          </div>

          {current.alternatives.map((cand, idx) => (
            <div
              key={cand.candidateId}
              className="rounded-2xl border border-sky-400/25 bg-[#101E52]/55 p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-black text-sky-200">
                  البديل {idx + 1} · {ROUND_RULES[cand.roundType]?.nameAr ?? cand.roundType} ·{' '}
                  {COGNITIVE_LEVEL_LABELS[cand.cognitiveLevel]} · {DIFFICULTY_LABELS[cand.difficulty]} · ص{' '}
                  {cand.sourcePage}
                </div>
                {cand.isHypotheticalScenario && (
                  <span className="text-[11px] font-bold text-amber-300">موقف تطبيقي افتراضي</span>
                )}
              </div>

              <div className="text-sm font-bold text-white leading-relaxed">{cand.prompt}</div>

              {cand.options && cand.options.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-200">
                  {cand.options.map((opt, oIdx) => (
                    <div
                      key={oIdx}
                      className={`rounded-lg px-2.5 py-1.5 border ${
                        cand.acceptableAnswers.includes(opt) || cand.correctIndex === oIdx
                          ? 'border-emerald-400/40 bg-emerald-950/30 text-emerald-200'
                          : 'border-white/10 bg-[#060D24]/70'
                      }`}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] bg-[#060D24]/75 rounded-xl p-3 border border-white/10">
                <div>
                  <span className="text-slate-400 font-bold">الإجابة المعتمدة: </span>
                  <span className="text-emerald-300 font-bold">{cand.acceptableAnswers.join(' / ')}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold">الهدف التعليمي: </span>
                  <span className="text-slate-200">{cand.learningObjective || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold">سبب صحة الإجابة: </span>
                  <span className="text-slate-200">{cand.answerCorrectnessReason || cand.explanation || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold">معيار التصحيح: </span>
                  <span className="text-slate-200">{cand.gradingCriterion || '—'}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-slate-400 truncate max-w-xl">
                  المقتطف: «{cand.sourceExcerpt}»
                </span>
                <button
                  type="button"
                  disabled={Boolean(applyingId)}
                  onClick={async () => {
                    await onApply(orig.id, cand, approveOnReplace);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 font-black px-4 py-2 text-xs transition whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {applyingId === cand.candidateId ? (
                    <span>جارٍ الاستبدال...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>اعتماد هذا البديل واستبدال الأصلي</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#060D24] px-4 py-2 text-xs font-bold text-slate-200 hover:border-white/30"
          >
            <CheckCircle2 className="w-4 h-4 text-slate-400" />
            <span>إلغاء وإغلاق المعاينة</span>
          </button>
        </div>
      </div>
    </div>
  );
}
