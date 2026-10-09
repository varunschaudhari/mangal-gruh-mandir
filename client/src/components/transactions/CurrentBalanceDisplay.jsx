import { useQuery } from '@tanstack/react-query';
import { getProductBalance } from '../../api/stockBalance.api.js';
import { Package } from 'lucide-react';

// Phones: a prominent row with the quantity large on the right, so it can be checked
// at a glance before typing the quantity. From `sm` up: the compact inline pill.
const CurrentBalanceDisplay = ({ productId, departmentId, label = 'Current Balance' }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['balance', productId, departmentId],
    queryFn: () => getProductBalance(productId, departmentId),
    enabled: Boolean(productId && departmentId),
    staleTime: 0,
  });

  if (!productId || !departmentId) return null;

  const qty = data?.data?.data?.quantity ?? 0;
  const unit = data?.data?.data?.balance?.product?.unit?.symbol || '';
  const min = data?.data?.data?.balance?.product?.minStockLevel || 0;
  const isLow = qty <= min && min > 0;

  return (
    <div
      aria-live="polite"
      className={`flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm sm:gap-2 sm:rounded-md sm:px-3 sm:py-2 ${isLow ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-50 text-gray-700 border border-gray-200'}`}
    >
      <Package className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" />
      <span className="flex-1 font-medium sm:flex-none">
        {label}<span className="hidden sm:inline">:</span>
        {isLow && <span className="block text-xs font-normal sm:hidden">Low stock</span>}
      </span>
      {isLoading ? (
        <span className="text-gray-400">Loading…</span>
      ) : (
        <span className={`font-bold ${isLow ? 'text-red-700' : 'text-gray-900'}`}>
          <span className="text-xl sm:text-sm">{qty}</span> {unit}
          {isLow && <span className="ml-1 hidden text-xs font-normal sm:inline">(Low stock)</span>}
        </span>
      )}
    </div>
  );
};

export default CurrentBalanceDisplay;
