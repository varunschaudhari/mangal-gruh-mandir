import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, ChevronDown, Package } from 'lucide-react';
import { getProducts } from '../../api/product.api.js';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import Sheet from '../ui/Sheet.jsx';
import haptics from '../../utils/haptics.js';

const ProductSearchSelect = ({ value, onChange, onSelect, error, disabled }) => {
  const [search,          setSearch]          = useState('');
  const [open,            setOpen]            = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const containerRef = useRef(null);
  const sheetInputRef = useRef(null);
  const isMobile = useIsMobile();

  // Clear display when form resets value to ''
  useEffect(() => {
    if (!value) setSelectedProduct(null);
  }, [value]);

  const { data } = useQuery({
    queryKey: ['products', 'search', search],
    queryFn:  () => getProducts({ search, limit: 20, isActive: true }),
    staleTime: 10000,
  });

  const products = data?.data?.data || [];

  useEffect(() => {
    if (isMobile) return undefined;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isMobile]);

  // Phones: focus the sheet's search box once the sheet has mounted.
  useEffect(() => {
    if (!isMobile || !open) return undefined;
    const t = setTimeout(() => sheetInputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [isMobile, open]);

  const handleSelect = (product) => {
    if (isMobile) haptics.select();
    setSelectedProduct(product);
    onChange(product._id);
    onSelect?.(product);
    setSearch('');
    setOpen(false);
  };

  const handleClear = () => {
    setSelectedProduct(null);
    onChange('');
    onSelect?.(null);
    setSearch('');
  };

  const closeSheet = () => { setOpen(false); setSearch(''); };

  // ── Phones: a tappable field that opens a full-height picker sheet ─────────
  if (isMobile) {
    return (
      <div>
        <div className={`input flex items-center gap-2 p-0 pl-3 ${error ? 'border-red-300' : ''} ${disabled ? 'opacity-50' : ''}`}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="flex min-h-[42px] min-w-0 flex-1 items-center gap-2 text-left"
          >
            {selectedProduct ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-gray-900">{selectedProduct.name}</span>
                <span className="block truncate text-xs text-gray-400">
                  {selectedProduct.code}{selectedProduct.unit?.symbol ? ` · ${selectedProduct.unit.symbol}` : ''}
                </span>
              </span>
            ) : (
              <>
                <Search className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="flex-1 truncate text-gray-400">Search by name or code…</span>
              </>
            )}
            {!selectedProduct && <ChevronDown className="mr-2 h-4 w-4 shrink-0 text-gray-400" />}
          </button>
          {selectedProduct && !disabled && (
            <button type="button" onClick={handleClear} className="shrink-0 p-2.5 text-gray-400 active:text-gray-600" aria-label="Clear product">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Sheet open={open} onClose={closeSheet} title="Select product" full bodyClassName="!px-0 !pt-0">
          <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={sheetInputRef}
                type="search"
                enterKeyHint="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or code…"
                className="input pl-9"
              />
            </div>
          </div>
          {products.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">No products found</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {products.map((p) => {
                const active = selectedProduct?._id === p._id;
                return (
                  <li key={p._id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(p)}
                      className={`flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-100 ${active ? 'bg-orange-50' : ''}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                        <Package className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[15px] font-medium break-words ${active ? 'text-orange-700' : 'text-gray-900'}`}>{p.name}</span>
                        <span className="block text-xs text-gray-400">
                          <span className="font-mono">{p.code}</span>
                          {p.category?.name ? ` · ${p.category.name}` : ''}
                        </span>
                      </span>
                      {p.unit?.symbol && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{p.unit.symbol}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Sheet>

        {error && <p className="mt-1 text-xs text-red-600">{typeof error === 'string' ? error : 'Required'}</p>}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {selectedProduct && !open ? (
        <div className={`input flex items-center justify-between ${error ? 'border-red-300' : ''}`}>
          <span className="text-sm truncate">
            <span className="font-medium">{selectedProduct.name}</span>
            {selectedProduct.code && <span className="ml-2 text-gray-400 text-xs">{selectedProduct.code}</span>}
          </span>
          {!disabled && (
            <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600 ml-2 shrink-0">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search by name or code…"
            className={`input pl-9 text-sm ${error ? 'border-red-300' : ''}`}
            disabled={disabled}
          />
        </div>
      )}

      {open && (
        <div className="absolute z-30 w-full mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {products.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">No products found</div>
          ) : (
            products.map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => handleSelect(p)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between gap-2"
              >
                <span className="font-medium text-gray-800 truncate">{p.name}</span>
                <span className="text-xs text-gray-400 shrink-0">{p.code}{p.unit?.symbol ? ` · ${p.unit.symbol}` : ''}</span>
              </button>
            ))
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{typeof error === 'string' ? error : 'Required'}</p>}
    </div>
  );
};

export default ProductSearchSelect;
