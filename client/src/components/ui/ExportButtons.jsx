import { FileSpreadsheet, FileText } from 'lucide-react';
import { useT } from '../../i18n/index.jsx';
import { useExcelExport } from '../../utils/temple.js';
import Spinner from './Spinner.jsx';

// Report downloads: PDF always, Excel only when Settings → Reports allows it (off by default).

/** Renders its children only when Excel downloads are allowed. */
export function ExcelOnly({ children }) {
  return useExcelExport() ? children : null;
}

/**
 * A PDF button, and an Excel one when allowed. `onExport('pdf' | 'excel')`; `busy` = the format
 * being prepared (shows a spinner). The buttons take the screen's own `className`.
 */
export default function ExportButtons({ onExport, className = 'btn btn-ghost text-sm flex items-center gap-1.5 border', disabled = false, busy = null }) {
  const t = useT();
  return (
    <>
      <button type="button" onClick={() => onExport('pdf')} disabled={disabled || !!busy} className={className}>
        {busy === 'pdf' ? <Spinner size="sm" /> : <FileText className="h-4 w-4 text-red-500" />} PDF
      </button>
      <ExcelOnly>
        <button type="button" onClick={() => onExport('excel')} disabled={disabled || !!busy} className={className}>
          {busy === 'excel' ? <Spinner size="sm" /> : <FileSpreadsheet className="h-4 w-4 text-green-600" />} {t('Excel')}
        </button>
      </ExcelOnly>
    </>
  );
}
