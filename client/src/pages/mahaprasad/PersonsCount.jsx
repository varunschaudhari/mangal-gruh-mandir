import { useT } from '../../i18n/index.jsx';

// How many people a coupon is for, big enough to read across the prasad counter — on every coupon,
// single ones too, like the thermal slip (utils/thermalPrint.js personsBytes).
export default function PersonsCount({ n, className = '' }) {
  const t = useT();
  return (
    <p className={`flex items-baseline justify-center gap-2 text-purple-700 ${className}`}>
      <span className="text-5xl font-black leading-none tabular-nums">{n}</span>
      <span className="text-xl font-extrabold uppercase tracking-wide">{t(n === 1 ? 'person|count' : 'persons|count')}</span>
    </p>
  );
}
