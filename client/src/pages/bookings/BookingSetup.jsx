import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CalendarX2, Clock, Eye, Flower2, Settings2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { getBookingSetup } from '../../api/booking.api.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useT } from '../../i18n/index.jsx';
import { SETUP_KEY } from '../../components/booking/setup/setupUi.jsx';
import SevaTypesTab from '../../components/booking/setup/SevaTypesTab.jsx';
import BatchesTab from '../../components/booking/setup/BatchesTab.jsx';
import ClosuresTab from '../../components/booking/setup/ClosuresTab.jsx';
import SettingsTab from '../../components/booking/setup/SettingsTab.jsx';

// Bookings → Setup: what can be booked, when, for how much, and how receipts go out.
// The temple office (bookings:manage) edits; everyone else with bookings:read can look.

const TABS = [
  { id: 'sevas', label: /*t*/ 'Seva types', icon: Flower2, Panel: SevaTypesTab },
  { id: 'batches', label: /*t*/ 'Batches', icon: Clock, Panel: BatchesTab },
  { id: 'closed', label: /*t*/ 'Closed dates', icon: CalendarX2, Panel: ClosuresTab },
  { id: 'settings', label: /*t*/ 'Settings', icon: Settings2, Panel: SettingsTab },
];

export default function BookingSetup() {
  const t = useT();
  const { can } = usePermissions();
  const canManage = can('bookings:manage');
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((x) => x.id === params.get('tab')) || TABS[0];

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: SETUP_KEY, queryFn: getBookingSetup });
  const setup = data?.data?.data;

  const openTab = (id) => setParams((p) => { const next = new URLSearchParams(p); next.set('tab', id); return next; }, { replace: true });

  return (
    <div>
      <PageHeader
        title="Booking Setup"
        subtitle="Sevas and prices, batches, closed dates and receipts"
        breadcrumbs={[{ label: 'Bookings', to: '/bookings' }, { label: 'Booking Setup' }]}
      />

      {/* Tabs: four equal buttons on phones, an underlined row from `sm` up */}
      <div role="tablist" aria-label={t('Booking Setup')} className="-mx-1 mb-4 grid grid-cols-4 gap-1 sm:mx-0 sm:mb-6 sm:flex sm:gap-1 sm:border-b sm:border-gray-200">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab.id === id;
          return (
            <button
              key={id} type="button" role="tab" aria-selected={active} onClick={() => openTab(id)}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-center text-[11px] font-medium leading-tight transition-colors
                sm:-mb-px sm:min-h-0 sm:flex-row sm:gap-1.5 sm:rounded-none sm:border-b-2 sm:px-4 sm:py-2.5 sm:text-sm
                ${active
                  ? 'bg-primary-50 text-primary-700 sm:border-primary-500 sm:bg-transparent'
                  : 'text-gray-500 hover:text-gray-700 sm:border-transparent sm:hover:border-gray-300'}`}
            >
              <Icon className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" />
              {t(label)}
            </button>
          );
        })}
      </div>

      {!canManage && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-500">
          <Eye className="h-4 w-4 shrink-0" />{t('You can look at these settings. Only the temple office can change them.')}
        </p>
      )}

      {isLoading && <PageLoader />}
      {isError && (
        <div className="card px-4 py-10 text-center text-sm text-gray-500">
          {t('Could not load the booking setup.')}{' '}
          <button type="button" onClick={() => refetch()} className="font-medium text-primary-700 underline">{t('Try again')}</button>
        </div>
      )}
      {setup && <div role="tabpanel"><tab.Panel setup={setup} canManage={canManage} /></div>}
    </div>
  );
}
