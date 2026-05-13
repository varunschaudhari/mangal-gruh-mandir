import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { changePassword } from '../../api/auth.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { FormField, FormSection } from '../../components/ui/FormField.jsx';
import toast from 'react-hot-toast';

const ChangePassword = () => {
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm();
  const newPassword = watch('newPassword');

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      toast.success('Password changed successfully');
      reset();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to change password'),
  });

  return (
    <div className="max-w-md">
      <PageHeader
        title="Change Password"
        breadcrumbs={[{ label: 'Change Password' }]}
      />

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card p-6 space-y-6">
        <FormSection title="Update Your Password">
          <FormField label="Current Password" required error={errors.currentPassword?.message}>
            <input
              {...register('currentPassword', { required: 'Current password is required' })}
              type="password"
              className="input"
              autoComplete="current-password"
            />
          </FormField>

          <FormField label="New Password" required error={errors.newPassword?.message} hint="At least 6 characters">
            <input
              {...register('newPassword', {
                required: 'New password is required',
                minLength: { value: 6, message: 'Minimum 6 characters' },
              })}
              type="password"
              className="input"
              autoComplete="new-password"
            />
          </FormField>

          <FormField label="Confirm New Password" required error={errors.confirmPassword?.message}>
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
            {mutation.isPending ? 'Updating…' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChangePassword;
