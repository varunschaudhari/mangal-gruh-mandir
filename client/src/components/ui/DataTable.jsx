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

const DataTable = ({ columns, data, loading, globalFilter, onGlobalFilterChange, pageSize = 15 }) => {
  const [sorting, setSorting] = useState([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

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
                        {flexRender(h.column.columnDef.header, h.getContext())}
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
                  No records found
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
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
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            {' · '}{table.getFilteredRowModel().rows.length} records
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
