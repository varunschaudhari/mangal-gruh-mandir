import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageLoader } from './Spinner.jsx';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import MobileCard from './MobileCard.jsx';
import { useT } from '../../i18n/index.jsx';

// ── Phone layout: each row becomes a card ────────────────────────────────────
// Columns can steer placement with `meta: { mobile: 'title' | 'subtitle' | 'aside' | 'hidden' }`.
// Without hints: a name/title/number column is the title, a status column sits top-right,
// an `actions` column becomes the card footer and the rest are label/value pairs.
const headerText = (column) => {
  const h = column.columnDef.header;
  return typeof h === 'string' ? h : '';
};

const mobileRole = (column, titleId) => {
  const hint = column.columnDef.meta?.mobile;
  if (hint) return hint;
  if (column.id === 'actions') return 'actions';
  if (column.id === titleId) return 'title';
  if (/(^|[._])(status|isActive)$/i.test(column.id)) return 'aside';
  return 'field';
};

const pickTitleId = (columns) => {
  const hinted = columns.find((c) => c.columnDef.meta?.mobile === 'title');
  if (hinted) return hinted.id;
  const named = columns.find((c) => /(^|[._])(name|title|.*Number)$/i.test(c.id) && c.columnDef.meta?.mobile !== 'hidden');
  return (named || columns.find((c) => c.id !== 'actions'))?.id;
};

const MOBILE_PAGE = 20;

const MobileCards = ({ table, onRowClick }) => {
  const t = useT();
  const [visible, setVisible] = useState(MOBILE_PAGE);
  const rows = table.getPrePaginationRowModel().rows;
  const titleId = pickTitleId(table.getVisibleLeafColumns());

  if (rows.length === 0) {
    return <div className="card px-4 py-12 text-center text-sm text-gray-400">{t('No records found')}</div>;
  }

  return (
    <div className="space-y-2.5">
      {rows.slice(0, visible).map((row) => {
        const cells = row.getVisibleCells();
        const by = (role) => cells.filter((c) => mobileRole(c.column, titleId) === role);
        const render = (cell) => flexRender(cell.column.columnDef.cell, cell.getContext());
        const [title] = by('title');
        const actions = by('actions');
        return (
          <MobileCard
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            title={title && render(title)}
            subtitle={by('subtitle').length > 0 && by('subtitle').map((c) => <div key={c.id}>{render(c)}</div>)}
            aside={by('aside').length > 0 && by('aside').map((c) => <div key={c.id}>{render(c)}</div>)}
            fields={by('field').map((c) => ({ label: t(headerText(c.column)) || c.id, value: render(c) ?? '—' }))}
            footer={actions.length > 0 && actions.map((c) => <div key={c.id}>{render(c)}</div>)}
          />
        );
      })}
      {rows.length > visible && (
        <button onClick={() => setVisible((v) => v + MOBILE_PAGE)} className="btn-secondary w-full">
          {t('Show more ({n} remaining)', { n: rows.length - visible })}
        </button>
      )}
    </div>
  );
};

const DataTable = ({ columns, data, loading, globalFilter, onGlobalFilterChange, pageSize = 15, onRowClick }) => {
  const [sorting, setSorting] = useState([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });
  const t = useT();
  const isMobile = useIsMobile();

  const table = useReactTable({
    data: data || [],
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (loading) return <PageLoader />;
  if (isMobile) return <MobileCards table={table} onRowClick={onRowClick} />;

  const SortIcon = ({ column }) => {
    if (!column.getCanSort()) return null;
    return column.getIsSorted() === 'asc' ? <ChevronUp className="h-3 w-3" />
         : column.getIsSorted() === 'desc' ? <ChevronDown className="h-3 w-3" />
         : <ChevronsUpDown className="h-3 w-3 text-gray-400" />;
  };

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="table-th" style={{ width: h.getSize() !== 150 ? h.getSize() : undefined }}>
                    {h.isPlaceholder ? null : (
                      <div
                        className={`flex items-center gap-1 ${h.column.getCanSort() ? 'cursor-pointer select-none' : ''}`}
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {typeof h.column.columnDef.header === 'string'
                          ? t(h.column.columnDef.header)
                          : flexRender(h.column.columnDef.header, h.getContext())}
                        <SortIcon column={h.column} />
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-gray-400">
                  {t('No records found')}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`hover:bg-gray-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="table-td">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-gray-600">
          <span>
            {t('Page {page} of {pages} · {n} records', {
              page: table.getState().pagination.pageIndex + 1,
              pages: table.getPageCount(),
              n: table.getFilteredRowModel().rows.length,
            })}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="btn-ghost p-1 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="btn-ghost p-1 disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
