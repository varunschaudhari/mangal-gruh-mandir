import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowLeft, Package, QrCode, ShieldAlert, CheckCircle2, AlertTriangle, HelpCircle, Layers } from 'lucide-react';
import { getAsset } from '../../api/asset.api.js';
import { getAssetUnits, updateAssetUnit, generateUnits } from '../../api/assetUnit.api.js';
import DataTable from '../../components/ui/DataTable.jsx';
import AssetLabelModal from '../../components/assets/AssetLabelModal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import toast from 'react-hot-toast';
import { useSetAppBarTitle } from '../../components/Layout/AppBarContext.jsx';
import { useT } from '../../i18n/index.jsx';

const COND_STYLES = {
  good:    { cls: 'bg-green-100 text-green-700',  label: 'Good',    Icon: CheckCircle2 },
  fair:    { cls: 'bg-amber-100 text-amber-700',  label: 'Fair',    Icon: AlertTriangle },
  damaged: { cls: 'bg-red-100 text-red-700',      label: 'Damaged', Icon: ShieldAlert },
  lost:    { cls: 'bg-gray-100 text-gray-500',    label: 'Lost',    Icon: HelpCircle },
};
const CONDITIONS = ['good', 'fair', 'damaged', 'lost'];
const col = createColumnHelper();
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const AssetUnitList = () => {
  const t = useT();
  useSetAppBarTitle('Asset Units');
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { can }    = usePermissions();
  const qc         = useQueryClient();
  const [editUnit, setEditUnit]       = useState(null);  // unit being edited
  const [condition, setCondition]     = useState('good');
  const [notes, setNotes]             = useState('');
  const [showLabels, setShowLabels]   = useState(false);

  const { data: assetRes, isLoading: assetLoading } = useQuery({
    queryKey: ['asset', id], queryFn: () => getAsset(id),
  });

  const { data: unitsRes, isLoading: unitsLoading } = useQuery({
    queryKey: ['asset-units', id], queryFn: () => getAssetUnits(id),
  });

  const asset = assetRes?.data?.data;
  const units = unitsRes?.data?.data || [];

  const updateMut = useMutation({
    mutationFn: ({ unitId, data }) => updateAssetUnit(unitId, data),
    onSuccess: () => {
      toast.success(t('Unit updated'));
      qc.invalidateQueries({ queryKey: ['asset-units', id] });
      setEditUnit(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Update failed')),
  });

  const generateMut = useMutation({
    mutationFn: () => generateUnits({ assetId: id }),
    onSuccess: (res) => {
      const count = res?.data?.data?.created ?? 0;
      toast.success(t(count !== 1 ? '{n} unit codes generated' : '{n} unit code generated', { n: count }));
      qc.invalidateQueries({ queryKey: ['asset-units', id] });
    },
    onError: (e) => toast.error(e.response?.data?.message || t('Generation failed')),
  });

  const openEdit = (unit) => {
    setEditUnit(unit);
    setCondition(unit.condition);
    setNotes(unit.conditionNotes || '');
  };

  const handleSave = () => updateMut.mutate({ unitId: editUnit._id, data: { condition, conditionNotes: notes } });

  if (assetLoading) return <PageLoader />;

  const counts = CONDITIONS.reduce((acc, c) => {
    acc[c] = units.filter((u) => u.condition === c).length;
    return acc;
  }, {});

  const columns = [
    col.accessor('unitNumber', {
      header: '#', size: 55,
      cell: (i) => <span className="text-gray-500 text-sm">{i.getValue()}</span>,
    }),
    col.accessor('unitCode', {
      header: 'Unit Code', size: 165,
      cell: (i) => <span className="font-mono text-xs font-bold text-orange-600">{i.getValue()}</span>,
    }),
    col.accessor('condition', {
      header: 'Condition', size: 110,
      cell: (i) => {
        const s = COND_STYLES[i.getValue()] || COND_STYLES.good;
        return (
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
            <s.Icon className="h-3 w-3" />{t(s.label)}
          </span>
        );
      },
    }),
    col.accessor('conditionNotes', {
      header: 'Notes',
      cell: (i) => <span className="text-gray-500 text-sm">{i.getValue() || '—'}</span>,
    }),
    col.accessor('updatedAt', {
      header: 'Last Updated', size: 120,
      cell: (i) => <span className="text-gray-400 text-xs">{fmt(i.getValue())}</span>,
    }),
    ...(can('assets:write') ? [col.display({
      id: 'actions', header: '', size: 80,
      cell: ({ row }) => (
        <button onClick={() => openEdit(row.original)}
          className="text-xs text-primary-600 hover:underline font-medium">
          {t('Update')}
        </button>
      ),
    })] : []),
  ];

  return (
    <div className="space-y-5 max-w-4xl">
      <button onClick={() => navigate(`/assets/${id}/history`)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
        <ArrowLeft className="h-4 w-4" /> {t('Asset History')}
      </button>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
          <Package className="h-6 w-6 text-orange-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{asset?.name}</h1>
            {asset?.assetCode && (
              <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
                {asset.assetCode}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">{asset?.category} · {asset?.totalQuantity} {t('unit')}{asset?.totalQuantity > 1 ? 's' : ''} {t('total')}</p>
        </div>
        <button onClick={() => setShowLabels(true)}
          className="btn-secondary flex items-center gap-2 text-sm shrink-0">
          <QrCode className="h-4 w-4" /> {t('Print Labels')}
        </button>
      </div>

      {/* Condition summary strip */}
      <div className="bg-white rounded-xl border border-gray-100 grid grid-cols-4 divide-x divide-gray-100 overflow-hidden">
        {CONDITIONS.map((c) => {
          const s = COND_STYLES[c];
          return (
            <div key={c} className="px-4 py-3 text-center">
              <p className={`text-2xl font-black ${s.cls.split(' ')[1]}`}>{counts[c]}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t(s.label)}</p>
            </div>
          );
        })}
      </div>

      {!unitsLoading && units.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-4">
          <Layers className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">{t('No unit codes generated yet')}</p>
            <p className="text-sm text-amber-600 mt-0.5">
              {t('This asset has')} {asset.totalQuantity} {t('unit')}{asset.totalQuantity > 1 ? 's' : ''} {t('but no individual unit codes. Generate them to enable QR label printing and per-unit condition tracking.')}
            </p>
          </div>
          {can('assets:write') && (
            <button
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending}
              className="btn-primary text-sm shrink-0 disabled:opacity-50"
            >
              {generateMut.isPending ? t('Generating…') : `Generate ${asset.totalQuantity} Codes`}
            </button>
          )}
        </div>
      )}

      <DataTable columns={columns} data={units} loading={unitsLoading} />

      {/* Edit condition modal */}
      {editUnit && (
        <Modal open onClose={() => setEditUnit(null)} title={`Update — ${editUnit.unitCode}`}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{t('Condition')}</label>
              <div className="grid grid-cols-2 gap-2">
                {CONDITIONS.map((c) => {
                  const s = COND_STYLES[c];
                  return (
                    <button key={c} type="button" onClick={() => setCondition(c)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                        condition === c ? `border-current ${s.cls}` : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      <s.Icon className="h-4 w-4" /> {t(s.label)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{t('Notes')}</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                className="input" rows={3} placeholder={t('e.g. Cracked handle, missing lid…')} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={updateMut.isPending} className="btn-primary flex-1">
                {updateMut.isPending ? t('Saving…') : t('Save')}
              </button>
              <button onClick={() => setEditUnit(null)} className="btn-secondary">{t('Cancel')}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Label print modal */}
      {showLabels && asset && (
        <AssetLabelModal asset={asset} onClose={() => setShowLabels(false)} />
      )}
    </div>
  );
};

export default AssetUnitList;
