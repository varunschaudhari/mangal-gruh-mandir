import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, CheckSquare, Square } from 'lucide-react';
import { getAssetUnits } from '../../api/assetUnit.api.js';
import { printUnitLabels } from '../../utils/assetLabel.js';
import Modal from '../ui/Modal.jsx';
import { PageLoader } from '../ui/Spinner.jsx';
import toast from 'react-hot-toast';

const COND_COLORS = { good: 'text-green-700 bg-green-50', fair: 'text-amber-700 bg-amber-50', damaged: 'text-red-700 bg-red-50', lost: 'text-gray-500 bg-gray-100' };

const AssetLabelModal = ({ asset, onClose }) => {
  const [selected, setSelected]   = useState(new Set());
  const [fromNum,  setFromNum]    = useState('');
  const [toNum,    setToNum]      = useState('');
  const [printing, setPrinting]   = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['asset-units', asset._id],
    queryFn:  () => getAssetUnits(asset._id),
  });

  const units = useMemo(() => data?.data?.data || [], [data]);

  // Pre-select all units once loaded
  useEffect(() => {
    if (units.length > 0 && selected.size === 0) {
      setSelected(new Set(units.map((u) => u._id)));
    }
  }, [units]);

  // Select all / none
  const allSelected  = units.length > 0 && selected.size === units.length;
  const noneSelected = selected.size === 0;

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const applyRange = () => {
    const from = parseInt(fromNum, 10);
    const to   = parseInt(toNum,   10);
    if (!from || !to || from > to) { toast.error('Invalid range'); return; }
    const inRange = new Set(units.filter((u) => u.unitNumber >= from && u.unitNumber <= to).map((u) => u._id));
    setSelected(inRange);
  };

  const handlePrint = async () => {
    const toPrint = units.filter((u) => selected.has(u._id));
    if (!toPrint.length) { toast.error('No units selected'); return; }
    setPrinting(true);
    try {
      await printUnitLabels(asset, toPrint);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Print Labels — ${asset.name}`} size="lg">
      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setSelected(new Set(units.map((u) => u._id)))}
              className="text-xs text-primary-600 hover:underline">Select All</button>
            <button onClick={() => setSelected(new Set())}
              className="text-xs text-gray-400 hover:underline">Deselect All</button>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs text-gray-400">Range:</span>
              <input type="number" min={1} max={units.length} value={fromNum} onChange={(e) => setFromNum(e.target.value)}
                placeholder="From" className="input w-16 text-xs py-1 px-2" />
              <span className="text-xs text-gray-400">to</span>
              <input type="number" min={1} max={units.length} value={toNum} onChange={(e) => setToNum(e.target.value)}
                placeholder="To" className="input w-16 text-xs py-1 px-2" />
              <button onClick={applyRange} className="btn-secondary text-xs py-1 px-2">Apply</button>
            </div>
          </div>

          {/* Unit list */}
          <div className="border border-gray-100 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <button onClick={() => allSelected
                      ? setSelected(new Set())
                      : setSelected(new Set(units.map((u) => u._id)))}>
                      {allSelected
                        ? <CheckSquare className="h-4 w-4 text-primary-600" />
                        : <Square className="h-4 w-4 text-gray-300" />}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Unit Code</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Condition</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u._id}
                    onClick={() => toggle(u._id)}
                    className={`cursor-pointer border-t border-gray-50 hover:bg-gray-50 transition-colors ${selected.has(u._id) ? 'bg-orange-50' : ''}`}>
                    <td className="px-3 py-2 text-center">
                      {selected.has(u._id)
                        ? <CheckSquare className="h-4 w-4 text-primary-600" />
                        : <Square className="h-4 w-4 text-gray-300" />}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{u.unitNumber}</td>
                    <td className="px-3 py-2 font-mono text-xs font-bold text-orange-600">{u.unitCode}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${COND_COLORS[u.condition] || ''}`}>
                        {u.condition}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs truncate max-w-[120px]">{u.conditionNotes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{selected.size}</span> of {units.length} units selected
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handlePrint} disabled={printing || noneSelected}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
                <Printer className="h-4 w-4" />
                {printing ? 'Generating…' : `Print ${selected.size} Label${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default AssetLabelModal;
