import { useQuery } from '@tanstack/react-query';
import { getProductBalance } from '../../api/stockBalance.api.js';
import { Package } from 'lucide-react';

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
    <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isLow ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-50 text-gray-700 border border-gray-200'}`}>
      <Package className="h-4 w-4 shrink-0" />
      <span className="font-medium">{label}:</span>
      {isLoading ? (
        <span className="text-gray-400">Loading…</span>
      ) : (
        <span className={`font-bold ${isLow ? 'text-red-700' : 'text-gray-900'}`}>
          {qty} {unit}
          {isLow && <span className="ml-1 text-xs font-normal">(Low stock)</span>}
        </span>
      )}
    </div>
  );
};

export default CurrentBalanceDisplay;
