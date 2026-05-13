import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { getProducts } from '../../api/product.api.js';

const ProductSearchSelect = ({ value, onChange, error, disabled }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const { data } = useQuery({
    queryKey: ['products', 'search', search],
    queryFn: () => getProducts({ search, limit: 20, isActive: true }),
    staleTime: 10000,
  });

  const products = data?.data?.data?.products || data?.data?.data || [];

  const selected = value ? products.find((p) => p._id === value._id || p._id === value) : null;

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (product) => {
    onChange(product);
    setSearch('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      {selected && !open ? (
        <div className="input flex items-center justify-between">
          <span className="text-sm">
            <span className="font-medium">{selected.name}</span>
            <span className="ml-2 text-gray-400 text-xs">{selected.code}</span>
          </span>
          {!disabled && (
            <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600">
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
            placeholder="Search product by name or code..."
            className={`input pl-9 ${error ? 'border-red-300' : ''}`}
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
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-gray-400">{p.code} · {p.unit?.symbol}</span>
              </button>
            ))
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export default ProductSearchSelect;
