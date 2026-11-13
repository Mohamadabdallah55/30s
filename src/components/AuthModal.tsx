import React, { useState } from 'react';
import { LogIn, ShieldCheck, UserPlus, X } from 'lucide-react';
import { AGE_GROUP_LABELS, CANONICAL_AGE_GROUPS } from '../shared/gameRules';
import type { AgeGroup, ProfilePublic } from '../shared/types';
import { apiFetch, setAuthToken } from '../utils/api';
import { AVATAR_OPTIONS, PlayerAvatar } from './BrandEmblem';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (profile: ProfilePublic) => void;
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('teen_14_17');
  const [avatarId, setAvatarId] = useState('crescent');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; profile: ProfilePublic }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      setAuthToken(res.token);
      onSuccess(res.profile);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; profile: ProfilePublic }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, displayName, password, ageGroup, avatarId }),
      });
      setAuthToken(res.token);
      onSuccess(res.profile);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الحساب');
    } finally {
      setLoading(false);
    }
  };

  const quickFillDemo = (id: string, pin: string) => {
    setTab('login');
    setIdentifier(id);
    setPassword(pin);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#101E52] border border-sky-400/30 p-6 shadow-2xl text-slate-50 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2 id="auth-modal-title" className="text-xl font-extrabold text-white">
              حسابات منصة مسجد ابن تيمية
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              الحساب الدائم يحفظ تقدمك ويمنع تكرار الأسئلة عبر الأجهزة دون طلب رقم هاتف أو تاريخ ميلاد.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة تسجيل الدخول"
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#09143A] mb-5">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setError(null);
            }}
            className={`py-2.5 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
              tab === 'login' ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>دخول</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setError(null);
            }}
            className={`py-2.5 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
              tab === 'register' ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>حساب طالب جديد</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-rose-500/20 border border-rose-400/40 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-identifier" className="block text-sm font-bold text-slate-200 mb-1.5">
                اسم المستخدم المستعار أو البريد (للمعلمين)
              </label>
              <input
                id="login-identifier"
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="مثال: omar_shibl أو teacher@ibntaymiyyah.org"
                className="w-full rounded-xl bg-[#09143A] border border-slate-600 focus:border-sky-400 px-4 py-3 text-white outline-none"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-bold text-slate-200 mb-1.5">
                رمز الدخول السري
              </label>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••"
                className="w-full rounded-xl bg-[#09143A] border border-slate-600 focus:border-sky-400 px-4 py-3 text-white outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-extrabold text-base transition-colors disabled:opacity-60"
            >
              {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
            </button>

            <div className="pt-3 border-t border-white/10">
              <p className="text-xs text-slate-300 mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>حسابات جاهزة للتجربة السريعة:</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => quickFillDemo('omar_shibl', '1234')}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-sky-200"
                >
                  طالب: omar_shibl
                </button>
                <button
                  type="button"
                  onClick={() => quickFillDemo('sara_quran', '1234')}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-sky-200"
                >
                  طالبة: sara_quran
                </button>
                <button
                  type="button"
                  onClick={() => quickFillDemo('teacher@ibntaymiyyah.org', '1447')}
                  className="px-3 py-1.5 rounded-lg bg-violet-500/25 hover:bg-violet-500/40 text-xs font-medium text-violet-100"
                >
                  معلم: teacher
                </button>
                <button
                  type="button"
                  onClick={() => quickFillDemo('admin@ibntaymiyyah.org', '2026')}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/25 hover:bg-amber-500/40 text-xs font-medium text-amber-100"
                >
                  مشرف إدارة: admin
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-username" className="block text-sm font-bold text-slate-200 mb-1.5">
                  معرف الدخول (بالإنجليزي)
                </label>
                <input
                  id="reg-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ahmad_2026"
                  dir="ltr"
                  className="w-full rounded-xl bg-[#09143A] border border-slate-600 focus:border-sky-400 px-3 py-2.5 text-white outline-none text-left"
                />
              </div>
              <div>
                <label htmlFor="reg-display" className="block text-sm font-bold text-slate-200 mb-1.5">
                  الاسم المستعار بالمسابقة
                </label>
                <input
                  id="reg-display"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="أحمد البطل"
                  className="w-full rounded-xl bg-[#09143A] border border-slate-600 focus:border-sky-400 px-3 py-2.5 text-white outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-age" className="block text-sm font-bold text-slate-200 mb-1.5">
                  الفئة العمرية (دون تاريخ ميلاد)
                </label>
                <select
                  id="reg-age"
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
                  className="w-full rounded-xl bg-[#09143A] border border-slate-600 focus:border-sky-400 px-3 py-2.5 text-white outline-none"
                >
                  {CANONICAL_AGE_GROUPS.map((ag) => (
                    <option key={ag} value={ag}>
                      {AGE_GROUP_LABELS[ag]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="reg-pass" className="block text-sm font-bold text-slate-200 mb-1.5">
                  رمز الدخول (4 خانات فأكثر)
                </label>
                <input
                  id="reg-pass"
                  type="password"
                  required
                  minLength={4}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••"
                  className="w-full rounded-xl bg-[#09143A] border border-slate-600 focus:border-sky-400 px-3 py-2.5 text-white outline-none"
                />
              </div>
            </div>

            <div>
              <span className="block text-sm font-bold text-slate-200 mb-2">اختر الرمز الشخصي</span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {AVATAR_OPTIONS.map((av) => (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => setAvatarId(av.id)}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-colors ${
                      avatarId === av.id
                        ? 'border-sky-400 bg-sky-500/20'
                        : 'border-white/10 bg-[#09143A] hover:border-white/30'
                    }`}
                  >
                    <PlayerAvatar avatarId={av.id} size="sm" />
                    <span className="text-[11px] text-slate-200">{av.labelAr}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-extrabold text-base transition-colors disabled:opacity-60"
            >
              {loading ? 'جاري الإنشاء...' : 'إنشاء الحساب والبدء'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
