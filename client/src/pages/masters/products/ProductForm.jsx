import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProduct, createProduct, updateProduct } from '../../../api/product.api.js';
import { getCategories } from '../../../api/category.api.js';
import { getUnits } from '../../../api/unit.api.js';
import SearchableSelect from '../../../components/ui/SearchableSelect.jsx';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { FormField, FormRow, FormSection, FormActions } from '../../../components/ui/FormField.jsx';
import { PageLoader } from '../../../components/ui/Spinner.jsx';
import toast from 'react-hot-toast';

const ProductForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { isActive: true, isPujaItem: false, isPerishable: false, minStockLevel: 0, reorderPoint: 0, standardRate: 0 },
  });

  const { data: productRes, isLoading: loadingProduct } = useQuery({
    queryKey: ['product', id],
    queryFn: () => getProduct(id),
    enabled: isEdit,
  });
  const { data: categoriesRes } = useQuery({ queryKey: ['categories'], queryFn: () => getCategories() });
  const { data: unitsRes } = useQuery({ queryKey: ['units'], queryFn: () => getUnits() });

  useEffect(() => {
    if (productRes?.data?.data) {
      const p = productRes.data.data;
      reset({ ...p, category: p.category?._id, unit: p.unit?._id, aliases: p.aliases?.join(', ') });
    }
  }, [productRes]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, aliases: data.aliases ? data.aliases.split(',').map((s) => s.trim()).filter(Boolean) : [] };
      return isEdit ? updateProduct(id, payload) : createProduct(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Product updated' : 'Product created');
      qc.invalidateQueries({ queryKey: ['products'] });
      navigate('/masters/products');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Operation failed'),
  });

  if (isEdit && loadingProduct) return <PageLoader />;

  const categories = categoriesRes?.data?.data || [];
  const units = unitsRes?.data?.data || [];

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={isEdit ? 'Edit Product' : 'New Product'}
        breadcrumbs={[{ label: 'Masters' }, { label: 'Products', to: '/masters/products' }, { label: isEdit ? 'Edit' : 'New' }]}
      />

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="card p-6 space-y-6">
        <FormSection title="Basic Information">
          <FormRow>
            <FormField label="Product Name" required error={errors.name?.message}>
              <input {...register('name', { required: 'Name is required' })} className="input" placeholder="e.g. Basmati Rice" />
            </FormField>
            <FormField label="Aliases (Hindi/Marathi names)" hint="Comma separated">
              <input {...register('aliases')} className="input" placeholder="e.g. चावल, Chawal" />
            </FormField>
          </FormRow>

          <FormRow>
            <FormField label="Category" required error={errors.category?.message}>
              <Controller
                name="category"
                control={control}
                rules={{ required: 'Category is required' }}
                render={({ field }) => (
                  <SearchableSelect
                    value={field.value || ''}
                    onChange={field.onChange}
                    options={categories.map((c) => ({ value: c._id, label: c.name }))}
                    placeholder="Select category…"
                    error={errors.category?.message}
                  />
                )}
              />
            </FormField>
            <FormField label="Unit" required error={errors.unit?.message}>
              <Controller
                name="unit"
                control={control}
                rules={{ required: 'Unit is required' }}
                render={({ field }) => (
                  <SearchableSelect
                    value={field.value || ''}
                    onChange={field.onChange}
                    options={units.map((u) => ({ value: u._id, label: u.name, sub: u.symbol }))}
                    placeholder="Select unit…"
                    error={errors.unit?.message}
                  />
                )}
              />
            </FormField>
          </FormRow>

          <FormField label="Description">
            <textarea {...register('description')} rows={2} className="input" placeholder="Optional description..." />
          </FormField>
        </FormSection>

        <FormSection title="Stock Thresholds">
          <FormRow cols={3}>
            <FormField label="Min Stock Level" hint="Low stock alert threshold">
              <input type="number" {...register('minStockLevel', { min: 0 })} className="input" />
            </FormField>
            <FormField label="Reorder Point">
              <input type="number" {...register('reorderPoint', { min: 0 })} className="input" />
            </FormField>
            <FormField label="Standard Rate (₹)" hint="Expected purchase rate">
              <input type="number" step="0.01" {...register('standardRate', { min: 0 })} className="input" />
            </FormField>
          </FormRow>
        </FormSection>

        <FormSection title="Properties">
          <div className="flex flex-wrap gap-6">
            {[
              { name: 'isPujaItem', label: 'Puja / Ritual Item' },
              { name: 'isPerishable', label: 'Perishable Item' },
              { name: 'isActive', label: 'Active' },
            ].map(({ name, label }) => (
              <label key={name} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" {...register(name)} className="h-4 w-4 rounded text-primary-600" />
                {label}
              </label>
            ))}
          </div>
        </FormSection>

        <FormActions onCancel={() => navigate('/masters/products')} loading={mutation.isPending} submitLabel={isEdit ? 'Update Product' : 'Create Product'} />
      </form>
    </div>
  );
};

export default ProductForm;
