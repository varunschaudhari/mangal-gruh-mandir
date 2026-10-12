import { Banknote, CreditCard, Smartphone } from 'lucide-react';
import { useT } from '../../../i18n/index.jsx';
import { Kbd, rovingKeyDown } from './bits.jsx';

export const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash', Icon: Banknote, key: 'C' },
  { value: 'upi', label: 'UPI', Icon: Smartphone, key: 'U' },
  { value: 'card', label: 'Card', Icon: CreditCard, key: 'K' },
];

/** Cash / UPI / Card segmented buttons. Alt+C / Alt+U / Alt+K work from anywhere (handled by the page). */
export function PaymentModes({ mode, onMode, compact = false }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t('Payment Mode')} onKeyDown={rovingKeyDown} className="grid grid-cols-3 gap-1.5">
      {PAYMENT_MODES.map(({ value, label, Icon, key }) => {
        const on = mode === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-enter-books
            title={`${t(label)} (Alt+${key})`}
            onClick={() => onMode(value)}
            className={`relative flex items-center justify-center gap-1.5 rounded-xl border-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
              compact ? 'min-h-[44px] px-3' : 'min-h-[48px] px-2'
            } ${on ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}
          >
            <Icon className="h-4 w-4 shrink-0" /> {t(label)}
            {!compact && <Kbd className="absolute right-1 top-0.5 border-0 bg-transparent px-0">Alt+{key}</Kbd>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * UPI reference (UTR) / card last 4 digits — needed for UPI and card, so the cashier can match
 * the payment with the bank or card-machine statement. `error` = message to show under it.
 */
export function PaymentRefInput({ mode, value, onChange, className = '', error }) {
  const t = useT();
  if (mode === 'cash') return null;
  const label = mode === 'upi' ? t('UPI reference (UTR)') : t('Card last 4 digits / approval code');
  return (
    <div>
      <input
        id="bk-payref"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={40}
        autoComplete="off"
        inputMode={mode === 'card' ? 'numeric' : 'text'}
        placeholder={`${label} *`}
        aria-label={label}
        aria-required="true"
        aria-invalid={Boolean(error)}
        className={`input ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''} ${className}`}
      />
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

/** Phone layout: the modes and the reference stacked in the form. */
export default function PaymentPicker({ mode, onMode, paymentRef, onRef, error }) {
  return (
    <div className="space-y-2">
      <PaymentModes mode={mode} onMode={onMode} />
      <PaymentRefInput mode={mode} value={paymentRef} onChange={onRef} className="h-12" error={error} />
    </div>
  );
}
