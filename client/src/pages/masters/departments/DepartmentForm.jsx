import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDepartment, createDepartment, updateDepartment } from '../../../api/department.api.js';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection, FormActions } from '../../../components/ui/FormField.jsx';
import { PageLoader } from '../../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';

const TYPES = ['store','kitchen','puja','flower','distribution','office','other'];

const DepartmentForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: { isActive: true, sortOrder: 0 } });

  const { data: deptRes, isLoading } = useQuery({ queryKey: ['department', id], queryFn: () => getDepartment(id), enabled: isEdit });
  useEffect(() => { if (deptRes?.data?.data) reset(deptRes.data.data); }, [deptRes]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? updateDepartment(id, data) : createDepartment(data),
    onSuccess: () => { toast.success(isEdit ? 'Department updated' : 'Department created'); qc.invalidateQueries({ queryKey: ['departments'] }); navigate('/masters/departments'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Operation failed'),
  });

  if (isEdit && isLoading) return <PageLoader />;

  return (
    <div className="max-w-xl">
      <PageHeader
        title={isEdit ? 'Edit Department' : 'New Department'}
        breadcrumbs={[{ label: 'Masters' }, { label: 'Departments', to: '/masters/departments' }, { label: isEdit ? 'Edit' : 'New' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card p-6 space-y-4">
        <FormRow>
          <FormField label="Department Name" required error={errors.name?.message}>
            <input {...register('name', { required: 'Name is required' })} className="input" placeholder="e.g. Main Store" />
          </FormField>
          <FormField label="Code" required error={errors.code?.message} hint="Short uppercase code">
            <input {...register('code', { required: 'Code is required' })} className="input uppercase" placeholder="e.g. MS" maxLength={5} />
          </FormField>
        </FormRow>
        <FormField label="Type" required error={errors.type?.message}>
          <select {...register('type', { required: 'Type is required' })} className="input">
            <option value="">Select type...</option>
            {TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </FormField>
        <FormField label="Description">
          <textarea {...register('description')} rows={2} className="input" placeholder="Optional description..." />
        </FormField>
        <FormRow>
          <FormField label="Sort Order" hint="Lower = shown first">
            <input type="number" {...register('sortOrder')} className="input" />
          </FormField>
          <FormField label=" ">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-2">
              <input type="checkbox" {...register('isActive')} className="h-4 w-4 rounded" /> Active
            </label>
          </FormField>
        </FormRow>
        <FormActions onCancel={() => navigate('/masters/departments')} loading={mutation.isPending} submitLabel={isEdit ? 'Update' : 'Create'} />
      </form>
    </div>
  );
};

export default DepartmentForm;
