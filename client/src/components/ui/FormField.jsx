// Reusable form field wrapper — used inside react-hook-form forms
export const FormField = ({ label, error, required, children, hint }) => (
  <div>
    {label && (
      <label className="label">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
    )}
    {children}
    {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

export const FormRow = ({ children, cols = 2 }) => (
  <div className={`grid gap-4 ${cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : cols === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}>
    {children}
  </div>
);

export const FormSection = ({ title, children }) => (
  <div className="space-y-4">
    {title && <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">{title}</h3>}
    {children}
  </div>
);

export const FormActions = ({ onCancel, submitLabel = 'Save', loading }) => (
  <div className="flex items-center gap-3 pt-2">
    <button type="submit" disabled={loading} className="btn-primary">
      {loading ? 'Saving...' : submitLabel}
    </button>
    {onCancel && (
      <button type="button" onClick={onCancel} className="btn-secondary">
        Cancel
      </button>
    )}
  </div>
);
