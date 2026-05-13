import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { updateProfile } from '../../api/auth.api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection, FormActions } from '../../components/ui/FormField.jsx';
import { ROLE_LABELS } from '../../utils/permissions.js';
import toast from 'react-hot-toast';

const Profile = () => {
  const { user, setUser } = useAuth();

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm();

  useEffect(() => {
    if (user) reset({ name: user.name, phone: user.phone || '' });
  }, [user]);

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (res) => {
      const updated = res.data.data;
      const merged = { ...user, name: updated.name, phone: updated.phone };
      localStorage.setItem('user', JSON.stringify(merged));
      setUser(merged);
      toast.success('Profile updated');
      reset({ name: updated.name, phone: updated.phone || '' });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Update failed'),
  });

  return (
    <div className="max-w-lg">
      <PageHeader
        title="My Profile"
        breadcrumbs={[{ label: 'Profile' }]}
      />

      <div className="card p-6 space-y-6">
        {/* Read-only info */}
        <FormSection title="Account Information">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="label">Email</p>
              <p className="font-medium text-gray-700">{user?.email}</p>
            </div>
            <div>
              <p className="label">Role</p>
              <p className="font-medium text-gray-700">{ROLE_LABELS[user?.role]}</p>
            </div>
          </div>
        </FormSection>

        {/* Editable fields */}
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          <FormSection title="Personal Details">
            <FormRow>
              <FormField label="Full Name" required error={errors.name?.message}>
                <input
                  {...register('name', { required: 'Name is required' })}
                  className="input"
                />
              </FormField>
              <FormField label="Phone">
                <input {...register('phone')} className="input" type="tel" />
              </FormField>
            </FormRow>
          </FormSection>

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="submit"
              disabled={mutation.isPending || !isDirty}
              className="btn btn-primary disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Profile;
