import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBackHandler } from '../../hooks/useBackHandler.js';
import { useT } from '../../i18n/index.jsx';

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

// Bottom sheet on phones, centred dialog from `sm` up.
// Closes on backdrop tap, Escape, and the Android back button.
const Sheet = ({ open, onClose, title, children, size = 'md', footer, full = false, bodyClassName = '' }) => {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useBackHandler(open, onClose);
  const t = useT();

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex w-full flex-col bg-white shadow-xl rounded-t-2xl sm:rounded-xl
          ${full ? 'h-[92dvh] sm:h-auto' : ''} max-h-[92dvh] sm:max-h-[90dvh]
          animate-sheet-up sm:animate-pop-in ${widths[size]}`}
      >
        {/* Grab handle (phones) */}
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-gray-300" />
        </div>
        {title !== undefined && (
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-6 sm:py-4">
            <h2 className="text-base font-semibold text-gray-800">{t(title)}</h2>
            <button onClick={onClose} className="btn-ghost -mr-2 rounded-md p-2" aria-label={t('Close')}>
              <X className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
          </div>
        )}
        <div className={`flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 ${footer ? '' : 'pb-[calc(1rem+var(--safe-bottom))] sm:pb-4'} ${bodyClassName}`}>
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t bg-white px-4 py-3 pb-[calc(0.75rem+var(--safe-bottom))] sm:px-6 sm:pb-3 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default Sheet;
