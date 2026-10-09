import Sheet from './Sheet.jsx';

// Bottom sheet on phones, centred dialog on larger screens (see Sheet.jsx).
const Modal = ({ open, onClose, title, children, size = 'md' }) => (
  <Sheet open={open} onClose={onClose} title={title} size={size}>
    {children}
  </Sheet>
);

export const ConfirmModal = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', confirmClass = 'btn-danger', loading }) => (
  <Modal open={open} onClose={onClose} title={title} size="sm">
    <p className="text-sm text-gray-600 mb-6">{message}</p>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
      <button onClick={onClose} className="btn-secondary">Cancel</button>
      <button onClick={onConfirm} disabled={loading} className={confirmClass}>
        {loading ? 'Processing...' : confirmLabel}
      </button>
    </div>
  </Modal>
);

export default Modal;
