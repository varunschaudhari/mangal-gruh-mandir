import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUser, createUser, updateUser } from '../../api/user.api.js';
import { getDepartments } from '../../api/department.api.js';
import { getRoles } from '../../api/role.api.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection, FormActions } from '../../components/ui/FormField.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';

const UserForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({ defaultValues: { role: 'staff', isActive: true } });
  const selectedRole = watch('role');

  const { data: userRes, isLoading } = useQuery({ queryKey: ['user', id], queryFn: () => getUser(id), enabled: isEdit });
  const { data: deptsRes } = useQuery({ queryKey: ['departments'], queryFn: getDepartments });
  const { data: rolesRes } = useQuery({ queryKey: ['roles'], queryFn: getRoles });

  useEffect(() => {
    if (userRes?.data?.data) {
      const u = userRes.data.data;
      reset({ ...u, departments: u.departments?.map((d) => d._id || d) });
    }
  }, [userRes]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? updateUser(id, data) : createUser(data),
    onSuccess: () => { toast.success(isEdit ? 'User updated' : 'User created'); qc.invalidateQueries({ queryKey: ['users'] }); navigate('/admin/users'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  if (isEdit && isLoading) return <PageLoader />;

  const depts = deptsRes?.data?.data || [];
  const roles = rolesRes?.data?.data?.filter((r) => r.isActive) || [];
  const showDepts = !['super_admin', 'admin'].includes(selectedRole);

  return (
    <div className="max-w-xl">
      <PageHeader
        title={isEdit ? 'Edit User' : 'New User'}
        breadcrumbs={[{ label: 'Admin' }, { label: 'Users', to: '/admin/users' }, { label: isEdit ? 'Edit' : 'New' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card p-6 space-y-6">
        <FormSection title="Account Details">
          <FormRow>
            <FormField label="Full Name" required error={errors.name?.message}>
              <input {...register('name', { required: 'Name is required' })} className="input" />
            </FormField>
            <FormField label="Phone">
              <input {...register('phone')} className="input" type="tel" />
            </FormField>
          </FormRow>
          <FormField label="Email" required error={errors.email?.message}>
            <input {...register('email', { required: 'Email is required' })} className="input" type="email" />
          </FormField>
          {!isEdit && (
            <FormField label="Password" required error={errors.password?.message} hint="Min 6 characters">
              <input {...register('password', { required: 'Password is required', minLength: { value: 6, message: 'Min 6 characters' } })} className="input" type="password" />
            </FormField>
          )}
        </FormSection>

        <FormSection title="Role & Access">
          <FormField label="Role" required>
            <select {...register('role')} className="input">
              {roles.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
            </select>
          </FormField>

          {showDepts && (
            <FormField label="Department Access" hint="Leave empty for all departments">
              <div className="grid grid-cols-2 gap-2 mt-1">
                {depts.map((d) => (
                  <label key={d._id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" value={d._id} {...register('departments')} className="h-4 w-4 rounded" />
                    <span>{d.name} <span className="text-gray-400">({d.code})</span></span>
                  </label>
                ))}
              </div>
            </FormField>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('isActive')} className="h-4 w-4 rounded" /> Active
          </label>
        </FormSection>

        <FormActions onCancel={() => navigate('/admin/users')} loading={mutation.isPending} submitLabel={isEdit ? 'Update User' : 'Create User'} />
      </form>
    </div>
  );
};

export default UserForm;
