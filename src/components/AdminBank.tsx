import React, { useEffect, useState } from 'react';
import {
  Archive,
  ArrowRight,
  Check,
  Database,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { AGE_GROUP_LABELS, DIFFICULTY_LABELS, ROUND_RULES } from '../shared/gameRules';
import type { ProfilePublic, QuestionBank, QuestionRecord } from '../shared/types';
import { apiFetch } from '../utils/api';

interface AdminBankProps {
  user: ProfilePublic | null;
  onBack: () => void;
  onOpenAuth: () => void;
}

interface ImportApiReport {
  totalReceived: number;
  validCount: number;
  publishedCount: number;
  needsReviewCount: number;
  duplicateRejectedCount: number;
  errorCount: number;
  issues: Array<{ rowIndex: number; externalId?: string; reason: string }>;
  distribution: {
    byAge: Record<string, number>;
    byCategory: Record<string, number>;
    byDifficulty: Record<string, number>;
    byRoundType: Record<string, number>;
  };
  newBankVersion: number;
}

export function AdminBank({ user, onBack, onOpenAuth }: AdminBankProps) {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('bank-general-mosque');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'needs_review' | 'archived'>('needs_review');
  const [searchQuery, setSearchQuery] = useState('');
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [rawImportText, setRawImportText] = useState('');
  const [importFormat, setImportFormat] = useState<'json' | 'csv'>('json');
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportApiReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  const loadBanks = async () => {
    const res = await apiFetch<{ banks: QuestionBank[] }>('/api/banks');
    setBanks(res.banks);
  };

  const loadQuestions = async () => {
    if (!isStaff) return;
    const res = await apiFetch<{ questions: QuestionRecord[] }>(
      `/api/banks/${selectedBankId}/questions?status=${statusFilter}&q=${encodeURIComponent(searchQuery)}`
    );
    setQuestions(res.questions);
  };

  useEffect(() => {
    if (isStaff) {
      loadBanks();
      loadQuestions();
    }
  }, [isStaff, selectedBankId, statusFilter]);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportFormat(file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json');
    setRawImportText(text);
  };

  const handleImport = async () => {
    setError(null);
    setImporting(true);
    try {
      const payload =
        importFormat === 'csv'
          ? { csvText: rawImportText }
          : { questions: JSON.parse(rawImportText) };
      const res = await apiFetch<{ report: ImportApiReport }>(`/api/banks/${selectedBankId}/import`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setReport(res.report);
      setRawImportText('');
      await loadBanks();
      await loadQuestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر استيراد الملف، تأكد من صحة JSON أو CSV');
    } finally {
      setImporting(false);
    }
  };

  const updateStatus = async (qId: string, status: 'published' | 'archived' | 'rejected') => {
    await apiFetch(`/api/questions/${qId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadBanks();
    await loadQuestions();
  };

  const toggleTimedSuitability = async (q: QuestionRecord) => {
    await apiFetch(`/api/questions/${q.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ unsuitableForTimed: !q.unsuitableForTimed }),
    });
    await loadQuestions();
  };

  const deleteQ = async (qId: string) => {
    await apiFetch(`/api/questions/${qId}`, { method: 'DELETE' });
    await loadBanks();
    await loadQuestions();
  };

  if (!isStaff) {
    return (
      <div className="min-h-screen bg-[#09143A] text-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-[#101E52] border border-amber-400/30 p-8 text-center space-y-4">
          <ShieldCheck className="w-12 h-12 text-amber-400 mx-auto" />
          <h1 className="text-xl font-black text-white">إدارة بنك الأسئلة — صلاحية مقيدة</h1>
          <p className="text-xs text-slate-300">
            لا يُسمح بالوصول إلى استيراد الأسئلة أو اعتماد الأسئلة الدينية إلا لحسابات الإدارة والمعلمين.
          </p>
          <div className="flex justify-center gap-2">
            <button type="button" onClick={onOpenAuth} className="px-5 py-2.5 rounded-xl bg-sky-400 text-slate-950 font-black text-sm">
              تسجيل الدخول
            </button>
            <button type="button" onClick={onBack} className="px-5 py-2.5 rounded-xl bg-white/10 text-white font-bold text-sm">
              رجوع
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09143A] text-slate-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 rounded-xl bg-[#132666] hover:bg-[#1B317A] border border-white/10 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <ArrowRight className="w-4 h-4" />
              <span>عودة خطوة</span>
            </button>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <Database className="w-6 h-6 text-sky-400" />
              <span>إدارة بنوك الأسئلة والاستيراد</span>
            </h1>
          </div>

          <select
            value={selectedBankId}
            onChange={(e) => setSelectedBankId(e.target.value)}
            aria-label="اختيار بنك الأسئلة"
            className="rounded-xl bg-[#101E52] border border-sky-400/30 px-4 py-2.5 text-sm font-bold text-white"
          >
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} (v{b.version} · منشور {b.publishedCount} · مراجعة {b.needsReviewCount})
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/20 border border-rose-400/40 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Importer Panel */}
          <div className="lg:col-span-5 rounded-2xl bg-[#101E52] border border-sky-400/25 p-5 space-y-4">
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-sky-400" />
              <span>استيراد تدريجي (JSON / CSV)</span>
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              يفحص الحقول والمعرّفات الفريدة ويمنع التكرار والتشابه المفرط، ويحجز الأسئلة الدينية الموسومة بـ needsReview حتى اعتمادها.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setImportFormat('json')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  importFormat === 'json' ? 'bg-sky-400 text-slate-950' : 'bg-[#09143A] text-slate-300'
                }`}
              >
                JSON Schema
              </button>
              <button
                type="button"
                onClick={() => setImportFormat('csv')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  importFormat === 'csv' ? 'bg-sky-400 text-slate-950' : 'bg-[#09143A] text-slate-300'
                }`}
              >
                CSV
              </button>
              <label className="mr-auto px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold cursor-pointer">
                اختيار ملف...
                <input type="file" accept=".json,.csv" onChange={handleFilePick} className="hidden" />
              </label>
            </div>

            <textarea
              rows={7}
              value={rawImportText}
              onChange={(e) => setRawImportText(e.target.value)}
              placeholder={
                importFormat === 'json'
                  ? '[{"externalId":"Q1","roundType":"multiple_choice","category":"السيرة النبوية","ageGroup":"youth","difficulty":"easy","prompt":"...","options":["أ","ب","ج","د"],"acceptableAnswers":["أ"],"correctIndex":0}]'
                  : 'externalId,roundType,category,ageGroup,difficulty,prompt,options,acceptableAnswers'
              }
              dir="ltr"
              className="w-full rounded-xl bg-[#09143A] border border-slate-600 p-3 text-xs font-mono text-slate-100 outline-none"
            />

            <button
              type="button"
              disabled={importing || !rawImportText.trim()}
              onClick={handleImport}
              className="w-full py-3 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-sm disabled:opacity-50"
            >
              {importing ? 'جاري الفحص والاستيراد...' : 'فحص واستيراد الدفعة'}
            </button>

            {report && (
              <div className="rounded-xl bg-[#09143A] border border-emerald-400/30 p-4 space-y-2 text-xs">
                <div className="font-black text-emerald-300">
                  تقرير الاستيراد (إصدار البنك v{report.newBankVersion})
                </div>
                <div className="grid grid-cols-2 gap-2 tabular-nums">
                  <div>المستلم: {report.totalReceived}</div>
                  <div className="text-emerald-300">المقبول: {report.validCount}</div>
                  <div>منشور فوراً: {report.publishedCount}</div>
                  <div className="text-amber-300">للمراجعة الدينية: {report.needsReviewCount}</div>
                  <div className="text-slate-400">مكرر مرفوض: {report.duplicateRejectedCount}</div>
                  <div className="text-rose-300">أخطاء بنية: {report.errorCount}</div>
                </div>
                {report.issues.length > 0 && (
                  <div className="pt-2 border-t border-white/10 max-h-28 overflow-y-auto text-rose-200 space-y-0.5">
                    {report.issues.slice(0, 10).map((iss, idx) => (
                      <div key={idx}>
                        سطر {iss.rowIndex}: {iss.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Review Queue & Bank Explorer */}
          <div className="lg:col-span-7 rounded-2xl bg-[#101E52] border border-white/10 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1 p-1 rounded-xl bg-[#09143A]">
                {(
                  [
                    ['needs_review', 'بانتظار الاعتماد'],
                    ['published', 'المنشورة'],
                    ['archived', 'المؤرشفة'],
                    ['all', 'الكل'],
                  ] as const
                ).map(([st, label]) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      statusFilter === st ? 'bg-sky-400 text-slate-950' : 'text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث في الأسئلة..."
                  className="rounded-xl bg-[#09143A] border border-slate-600 px-3 py-1.5 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={loadQuestions}
                  aria-label="بحث"
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </div>

            {questions.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">
                لا توجد أسئلة مطابقة لهذا التبويب حالياً.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[560px] overflow-y-auto">
                {questions.map((q) => (
                  <div key={q.id} className="rounded-xl bg-[#09143A] border border-white/10 p-3.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span>
                        {ROUND_RULES[q.roundType]?.nameAr} · {q.category} · {AGE_GROUP_LABELS[q.ageGroup]} ·{' '}
                        {DIFFICULTY_LABELS[q.difficulty]} (مستوى {q.difficultyLevel || 3}/5)
                      </span>
                      <span className="font-mono">{q.externalId || q.id}</span>
                    </div>
                    <div className="text-sm font-bold text-white">{q.prompt}</div>
                    <div className="text-xs text-emerald-300">الإجابة: {q.acceptableAnswers.join(' · ')}</div>
                    {q.sourceExcerpt && <p className="text-xs text-slate-300 break-all">المرجع: <bdi>{q.sourceExcerpt}</bdi></p>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {q.status !== 'published' && (
                        <button
                          type="button"
                          onClick={() => updateStatus(q.id, 'published')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> اعتماد ونشر
                        </button>
                      )}
                      {q.status !== 'archived' && (
                        <button
                          type="button"
                          onClick={() => updateStatus(q.id, 'archived')}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Archive className="w-3.5 h-3.5" /> أرشفة
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleTimedSuitability(q)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                          q.unsuitableForTimed
                            ? 'bg-amber-500/25 text-amber-200'
                            : 'bg-white/10 hover:bg-white/20 text-slate-300'
                        }`}
                      >
                        {q.unsuitableForTimed ? 'مقيد عن جولات الوقت' : 'مناسب لجولات الوقت'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteQ(q.id)}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
