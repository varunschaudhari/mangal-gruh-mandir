import { X } from 'lucide-react';
import { useEffect } from 'react';

const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative w-full ${widths[size]} bg-white rounded-xl shadow-xl`}>
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1 rounded-md">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmModal = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', confirmClass = 'btn-danger', loading }) => (
  <Modal open={open} onClose={onClose} title={title} size="sm">
    <p className="text-sm text-gray-600 mb-6">{message}</p>
    <div className="flex justify-end gap-3">
      <button onClick={onClose} className="btn-secondary">Cancel</button>
      <button onClick={onConfirm} disabled={loading} className={confirmClass}>
        {loading ? 'Processing...' : confirmLabel}
      </button>
    </div>
  </Modal>
);

export default Modal;
