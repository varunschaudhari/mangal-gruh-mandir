import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import toast from 'react-hot-toast';
import { useT, LanguageSwitch } from '../../i18n/index.jsx';

const Login = () => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPwd, setShowPwd] = useState(false);
  const t = useT();

  const onSubmit = async ({ email, password }) => {
    try {
      await login(email, password);
      // replace: the Android back button shouldn't return to the login screen
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.response
        ? err.response.data?.message || t('Login failed')
        : t('Cannot reach the server — check your internet connection'));
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-orange-50 to-amber-100 p-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))]">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-end">
          <LanguageSwitch />
        </div>
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2 shadow-lg">
            <img src="/logo.png" alt="" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('Mangal Grah Mandir')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('Amalner — Stock Management')}</p>
        </div>

        {/* Form */}
        <div className="card p-6 sm:p-8">
          <h2 className="mb-6 text-lg font-semibold text-gray-800">{t('Sign in to your account')}</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">{t('Email')}</label>
              <input
                type="email"
                {...register('email', { required: t('Email is required') })}
                className="input"
                placeholder="admin@mandir.com"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                enterKeyHint="next"
              />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">{t('Password')}</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  {...register('password', { required: t('Password is required') })}
                  className="input pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  enterKeyHint="go"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600"
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3 text-base sm:py-2.5 sm:text-sm">
              {isSubmitting ? t('Signing in...') : t('Sign In')}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          {t('Mangal Grah Mandir · Stock Management System')}
        </p>
      </div>
    </div>
  );
};

export default Login;
