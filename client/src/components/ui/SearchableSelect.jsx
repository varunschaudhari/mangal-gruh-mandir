import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import Sheet from './Sheet.jsx';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import { useT } from '../../i18n/index.jsx';

/**
 * SearchableSelect — drop-in replacement for native <select> on large lists.
 *
 * Props:
 *   value       — current selected value (string / number)
 *   onChange    — (value: string) => void
 *   options     — [{ value, label, sub? }]  sub = small subtitle line
 *   placeholder — shown when nothing selected (default "Select…")
 *   nullable    — if true, first option is "— placeholder —" allowing clear (default true)
 *   error       — truthy to show red border
 *   disabled
 *   className
 *
 * On phones the list opens as a bottom sheet with large rows instead of a dropdown,
 * so it isn't squeezed between the field and the on-screen keyboard.
 */
export default function SearchableSelect({
  value = '',
  onChange,
  options = [],
  placeholder = 'Select…',
  nullable = true,
  error,
  disabled,
  className = '',
}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const inputRef     = useRef(null);
  const isMobile     = useIsMobile();
  const t            = useT();

  const selected = options.find((o) => String(o.value) === String(value));

  const list = nullable
    ? [{ value: '', label: t(placeholder), _null: true }, ...options]
    : options;

  const filtered = search.trim()
    ? list.filter((o) =>
        !o._null &&
        (o.label.toLowerCase().includes(search.toLowerCase()) ||
         o.sub?.toLowerCase().includes(search.toLowerCase()))
      )
    : list;

  // Close on outside click (desktop dropdown only — the phone sheet closes itself)
  useEffect(() => {
    if (isMobile) return undefined;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isMobile]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && open) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Focus search when opened. On phones only for long lists — focusing pops the keyboard
  // over half the screen, which is in the way when there are only a few options to tap.
  useEffect(() => {
    if (open && (!isMobile || options.length > 8)) setTimeout(() => inputRef.current?.focus(), 40);
  }, [open, isMobile, options.length]);

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    setSearch('');
  };

  const close = () => { setOpen(false); setSearch(''); };

  const borderCls = error ? 'border-red-400 focus:border-red-400' : '';
  const disabledCls = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`input w-full text-left flex items-center justify-between gap-2 ${borderCls} ${disabledCls}`}
      >
        <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected ? selected.label : t(placeholder)}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Phone: bottom sheet */}
      {isMobile && (
        <Sheet open={open} onClose={close} title={t(placeholder).replace(/^[\s—–-]+|[\s—–-]+$/g, '')} full={options.length > 8} bodyClassName="!px-0 !pt-0">
          <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search…')}
                className="input pl-9"
                enterKeyHint="search"
              />
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">{t('No results')}</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((opt) => {
                const isActive = String(opt.value) === String(value);
                return (
                  <button
                    key={String(opt.value) || '__null__'}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left active:bg-orange-50 ${isActive ? 'bg-orange-50' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[15px] ${opt._null ? 'italic text-gray-400' : isActive ? 'font-medium text-orange-700' : 'text-gray-800'}`}>
                        {opt.label}
                      </span>
                      {opt.sub && <span className="block truncate text-xs text-gray-400">{opt.sub}</span>}
                    </span>
                    {isActive && <Check className="h-5 w-5 shrink-0 text-orange-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </Sheet>
      )}

      {/* Desktop: dropdown */}
      {open && !isMobile && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search…')}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-primary-400 bg-gray-50"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">{t('No results')}</p>
            ) : (
              filtered.map((opt) => {
                const isActive = String(opt.value) === String(value);
                return (
                  <button
                    key={String(opt.value) || '__null__'}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      opt._null
                        ? 'text-gray-400 hover:bg-gray-50 italic'
                        : isActive
                          ? 'bg-orange-50 text-orange-700 font-medium'
                          : 'text-gray-700 hover:bg-orange-50'
                    }`}
                  >
                    <span className="block truncate">{opt.label}</span>
                    {opt.sub && (
                      <span className="block text-xs text-gray-400 truncate">{opt.sub}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
