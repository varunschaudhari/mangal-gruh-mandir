import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { changePassword } from '../../api/auth.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { FormField, FormSection } from '../../components/ui/FormField.jsx';
import toast from 'react-hot-toast';
import { useT } from '../../i18n/index.jsx';

const ChangePassword = () => {
  const t = useT();
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm();
  const newPassword = watch('newPassword');
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const mustChange = Boolean(user?.mustChangePassword);

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      toast.success(t('Password changed successfully'));
      reset();
      if (mustChange) {
        const next = { ...user, mustChangePassword: false };
        try { localStorage.setItem('user', JSON.stringify(next)); } catch { /* ignore */ }
        setUser(next);
        navigate('/dashboard', { replace: true });
      }
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Failed to change password')),
  });

  return (
    <div className="max-w-md">
      <PageHeader
        title="Change Password"
        breadcrumbs={[{ label: 'Change Password' }]}
      />

      {mustChange && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('You signed in with a temporary password. Choose your own password to continue.')}
        </p>
      )}
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card p-6 space-y-6">
        <FormSection title={t('Update Your Password')}>
          <FormField label={t('Current Password')} required error={errors.currentPassword?.message}>
            <input
              {...register('currentPassword', { required: 'Current password is required' })}
              type="password"
              className="input"
              autoComplete="current-password"
            />
          </FormField>

          <FormField label={t('New Password')} required error={errors.newPassword?.message} hint={t('At least 6 characters')}>
            <input
              {...register('newPassword', {
                required: 'New password is required',
                minLength: { value: 6, message: t('Minimum 6 characters') },
              })}
              type="password"
              className="input"
              autoComplete="new-password"
            />
          </FormField>

          <FormField label={t('Confirm New Password')} required error={errors.confirmPassword?.message}>
            <input
              {...register('confirmPassword', {
                required: 'Please confirm your new password',
                validate: (v) => v === newPassword || 'Passwords do not match',
              })}
              type="password"
              className="input"
              autoComplete="new-password"
            />
          </FormField>
        </FormSection>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn btn-primary disabled:opacity-50"
          >
            {mutation.isPending ? t('Updating…') : t('Change Password')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChangePassword;
