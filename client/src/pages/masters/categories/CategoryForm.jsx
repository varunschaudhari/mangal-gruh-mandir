import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCategory, createCategory, updateCategory, getCategories } from '../../../api/category.api.js';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection, FormActions } from '../../../components/ui/FormField.jsx';
import { PageLoader } from '../../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';

const CategoryForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: { isActive: true, sortOrder: 0 } });

  const { data: res, isLoading } = useQuery({ queryKey: ['category', id], queryFn: () => getCategory(id), enabled: isEdit });
  const { data: allCats } = useQuery({ queryKey: ['categories'], queryFn: getCategories });

  useEffect(() => {
    if (res?.data?.data) {
      const c = res.data.data;
      reset({ ...c, parentCategory: c.parentCategory?._id || '' });
    }
  }, [res]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, parentCategory: data.parentCategory || null };
      return isEdit ? updateCategory(id, payload) : createCategory(payload);
    },
    onSuccess: () => { toast.success(isEdit ? 'Category updated' : 'Category created'); qc.invalidateQueries({ queryKey: ['categories'] }); navigate('/masters/categories'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  if (isEdit && isLoading) return <PageLoader />;

  const categories = (allCats?.data?.data || []).filter((c) => c._id !== id);

  return (
    <div className="max-w-xl">
      <PageHeader
        title={isEdit ? 'Edit Category' : 'New Category'}
        breadcrumbs={[{ label: 'Masters' }, { label: 'Categories', to: '/masters/categories' }, { label: isEdit ? 'Edit' : 'New' }]}
      />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card p-6 space-y-4">
        <FormRow>
          <FormField label="Category Name" required error={errors.name?.message}>
            <input {...register('name', { required: 'Name is required' })} className="input" />
          </FormField>
          <FormField label="Code" required error={errors.code?.message}>
            <input {...register('code', { required: 'Code is required' })} className="input uppercase" placeholder="e.g. GR" maxLength={5} />
          </FormField>
        </FormRow>
        <FormField label="Parent Category" hint="Leave empty for root category">
          <select {...register('parentCategory')} className="input">
            <option value="">— Root Category —</option>
            {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </FormField>
        <FormField label="Description">
          <textarea {...register('description')} rows={2} className="input" />
        </FormField>
        <FormRow>
          <FormField label="Sort Order"><input type="number" {...register('sortOrder')} className="input" /></FormField>
          <FormField label=" ">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-2">
              <input type="checkbox" {...register('isActive')} className="h-4 w-4 rounded" /> Active
            </label>
          </FormField>
        </FormRow>
        <FormActions onCancel={() => navigate('/masters/categories')} loading={mutation.isPending} submitLabel={isEdit ? 'Update' : 'Create'} />
      </form>
    </div>
  );
};

export default CategoryForm;
