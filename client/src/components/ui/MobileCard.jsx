import { ChevronRight } from 'lucide-react';

// One row of a list, rendered as a card on phones. DataTable uses this for its phone
// layout; pages with hand-built <table>s use it inside a `md:hidden` block.
//   title / subtitle  – main line and a muted line under it
//   aside             – top-right slot (status badge, amount…)
//   fields            – [{ label, value }] shown as a two-column grid
//   footer            – actions row (clicks here don't trigger onClick)
const MobileCard = ({ title, subtitle, aside, fields = [], footer, onClick, className = '' }) => {
  const shown = fields.filter((f) => f && f.value !== undefined && f.value !== null && f.value !== '');
  return (
    <div
      onClick={onClick}
      className={`card p-3.5 ${onClick ? 'cursor-pointer active:bg-gray-50' : ''} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-[15px] font-medium text-gray-900 break-words">
          {title}
          {subtitle && <div className="mt-0.5 text-xs font-normal text-gray-500">{subtitle}</div>}
        </div>
        {(aside || onClick) && (
          <div className="flex shrink-0 items-center gap-1.5">
            {aside}
            {onClick && <ChevronRight className="h-4 w-4 text-gray-300" />}
          </div>
        )}
      </div>
      {shown.length > 0 && (
        <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
          {shown.map((f, i) => (
            <div key={f.label ?? i} className={`min-w-0 ${f.full ? 'col-span-2' : ''}`}>
              <dt className="text-[11px] uppercase tracking-wide text-gray-400">{f.label}</dt>
              <dd className="text-sm text-gray-700 break-words">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {footer && (
        <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-gray-100 pt-2" onClick={(e) => e.stopPropagation()}>
          {footer}
        </div>
      )}
    </div>
  );
};

export default MobileCard;
