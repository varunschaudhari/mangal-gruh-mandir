import { useQuery } from '@tanstack/react-query';
import { usePermissions } from './usePermissions.js';
import { getAssetCounts } from '../api/assetTransaction.api.js';
import { getPaymentCounts } from '../api/supplierPayment.api.js';

// Counts shown as red badges next to nav entries, keyed by route.
export const useNavBadges = () => {
  const { can } = usePermissions();

  const { data: countsRes } = useQuery({
    queryKey: ['asset-counts'],
    queryFn: getAssetCounts,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: can('assets:read'),
  });

  const { data: payCountsRes } = useQuery({
    queryKey: ['payment-counts'],
    queryFn: getPaymentCounts,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: can('payments:read'),
  });

  const overdue         = countsRes?.data?.data?.overdue     || 0;
  const pendingPayments = payCountsRes?.data?.data?.pending || 0;
  return {
    '/assets/borrows': overdue          || null,
    '/payments':       pendingPayments  || null,
  };
};
