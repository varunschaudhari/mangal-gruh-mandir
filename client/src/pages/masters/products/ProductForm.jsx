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
import { ScanLine } from 'lucide-react';
import { isNative } from '../../../utils/platform.js';
import { scanQrCode } from '../../../utils/nativeScanner.js';
import { useT } from '../../../i18n/index.jsx';

const ProductForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useT();

  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm({
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
      const payload = {
        ...data,
        aliases: data.aliases ? data.aliases.split(',').map((s) => s.trim()).filter(Boolean) : [],
        barcode: data.barcode?.trim() || null, // null clears it on edit
      };
      return isEdit ? updateProduct(id, payload) : createProduct(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? t('Product updated') : t('Product created'));
      qc.invalidateQueries({ queryKey: ['products'] });
      navigate('/masters/products');
    },
    onError: (err) => toast.error(err.response?.data?.message || t('Operation failed')),
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
        <FormSection title={t('Basic Information')}>
          <FormRow>
            <FormField label={t('Product Name')} required error={errors.name?.message}>
              <input {...register('name', { required: t('Name is required') })} className="input" placeholder={t('e.g. Basmati Rice')} />
            </FormField>
            <FormField label={t('Aliases (Hindi/Marathi names)')} hint={t('Comma separated')}>
              <input {...register('aliases')} className="input" placeholder={t('e.g. चावल, Chawal')} />
            </FormField>
          </FormRow>

          <FormRow>
            <FormField label={t('Category')} required error={errors.category?.message}>
              <Controller
                name="category"
                control={control}
                rules={{ required: t('Category is required') }}
                render={({ field }) => (
                  <SearchableSelect
                    value={field.value || ''}
                    onChange={field.onChange}
                    options={categories.map((c) => ({ value: c._id, label: c.name }))}
                    placeholder={t('Select category…')}
                    error={errors.category?.message}
                  />
                )}
              />
            </FormField>
            <FormField label={t('Unit')} required error={errors.unit?.message}>
              <Controller
                name="unit"
                control={control}
                rules={{ required: t('Unit is required') }}
                render={({ field }) => (
                  <SearchableSelect
                    value={field.value || ''}
                    onChange={field.onChange}
                    options={units.map((u) => ({ value: u._id, label: u.name, sub: u.symbol }))}
                    placeholder={t('Select unit…')}
                    error={errors.unit?.message}
                  />
                )}
              />
            </FormField>
          </FormRow>

          <FormField label={t('Barcode')} hint={t('The shop barcode on the packet (EAN/UPC), so the app can scan it — optional')}>
            <div className="flex gap-2">
              <input {...register('barcode')} className="input font-mono" autoCapitalize="characters" placeholder={t('e.g. {example}', { example: '8901234567890' })} />
              {isNative && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await scanQrCode({ barcodes: true });
                      if (text) setValue('barcode', text, { shouldDirty: true });
                    } catch (err) { toast.error(err?.message || t('Scanner not available')); }
                  }}
                  className="btn-secondary shrink-0 px-3"
                  aria-label={t('Scan barcode')}
                >
                  <ScanLine className="h-5 w-5" />
                </button>
              )}
            </div>
          </FormField>

          <FormField label={t('Description')}>
            <textarea {...register('description')} rows={2} className="input" placeholder={t('Optional description...')} />
          </FormField>
        </FormSection>

        <FormSection title={t('Stock Thresholds')}>
          <FormRow cols={3}>
            <FormField label={t('Min Stock Level')} hint={t('Low stock alert threshold')}>
              <input type="number" {...register('minStockLevel', { min: 0 })} className="input" />
            </FormField>
            <FormField label={t('Reorder Point')}>
              <input type="number" {...register('reorderPoint', { min: 0 })} className="input" />
            </FormField>
            <FormField label={t('Standard Rate (₹)')} hint={t('Expected purchase rate')}>
              <input type="number" step="0.01" {...register('standardRate', { min: 0 })} className="input" />
            </FormField>
          </FormRow>
        </FormSection>

        <FormSection title={t('Properties')}>
          <div className="flex flex-wrap gap-6">
            {[
              { name: 'isPujaItem', label: t('Puja / Ritual Item') },
              { name: 'isPerishable', label: t('Perishable Item') },
              { name: 'isActive', label: t('Active') },
            ].map(({ name, label }) => (
              <label key={name} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" {...register(name)} className="h-4 w-4 rounded text-primary-600" />
                {t(label)}
              </label>
            ))}
          </div>
        </FormSection>

        <FormActions onCancel={() => navigate('/masters/products')} loading={mutation.isPending} submitLabel={isEdit ? t('Update Product') : t('Create Product')} />
      </form>
    </div>
  );
};

export default ProductForm;
