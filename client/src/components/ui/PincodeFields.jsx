import { useEffect, useId, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MapPin, AlertCircle } from 'lucide-react';
import { getPincode } from '../../api/pincode.api.js';
import { isPincode } from '../../utils/address.js';
import { useT } from '../../i18n/index.jsx';

/**
 * PIN code with area, city, district and state. Typing the 6-digit PIN fills city (taluka),
 * district and state from India Post and offers the villages / localities of that PIN to pick
 * from. Every field stays editable — if the look-up fails they are typed by hand.
 *
 *   <PincodeFields value={{ pincode, area, city, district, state }} onChange={(patch) => …} />
 */
export default function PincodeFields({ value = {}, onChange, required = false, error, pinRef, className = '' }) {
  const t = useT();
  const id = useId();
  const pin = String(value.pincode || '');
  const valid = isPincode(pin);
  const applied = useRef(valid ? pin : ''); // a PIN already on the record is not filled again

  const { data, isFetching, isError, error: lookupError } = useQuery({
    queryKey: ['pincode', pin],
    queryFn: () => getPincode(pin).then((r) => r.data.data),
    enabled: valid,
    staleTime: Infinity,
    retry: false,
  });

  // Fill city, district and state once per newly typed PIN; the area only when there is one choice
  useEffect(() => {
    if (!data || data.pin !== pin || applied.current === pin) return;
    const changedPin = Boolean(applied.current); // typed over another PIN (not the first fill)
    applied.current = pin;
    const keepArea = value.area && (data.areas.includes(value.area) || !changedPin);
    onChange({
      city: data.city,
      district: data.district,
      state: data.state,
      area: data.areas.length === 1 ? data.areas[0] : keepArea ? value.area : '',
    });
  }, [data, pin, onChange, value.area]);

  const notFound = isError && lookupError?.response?.status === 404;
  const set = (key) => (e) => onChange({ [key]: e.target.value });
  const input = 'input';

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('PIN code')}{required && <span className="ml-0.5 text-red-500">*</span>}
          </span>
          <span className="relative block">
            <input
              ref={pinRef}
              value={pin}
              onChange={(e) => onChange({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="425401"
              maxLength={6}
              aria-invalid={Boolean(error) || notFound}
              className={`${input} pr-8 font-mono tracking-wider ${error || notFound ? 'border-red-400' : ''}`}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : data && data.pin === pin ? <MapPin className="h-4 w-4 text-green-600" /> : null}
            </span>
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Village / area')}</span>
          <input value={value.area || ''} onChange={set('area')} list={`${id}-areas`} autoComplete="off" className={input}
            placeholder={data?.areas?.length > 1 ? t('Choose area ({n})', { n: data.areas.length }) : ''} />
          <datalist id={`${id}-areas`}>
            {(data?.pin === pin ? data.areas : []).map((a) => <option key={a} value={a} />)}
          </datalist>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('City / taluka')}</span>
          <input value={value.city || ''} onChange={set('city')} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('District')}</span>
          <input value={value.district || ''} onChange={set('district')} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t('State')}</span>
          <input value={value.state || ''} onChange={set('state')} className={input} />
        </label>
      </div>
      {error ? <p className="text-xs font-medium text-red-600">{error}</p>
        : notFound ? <p className="flex items-center gap-1 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" />{t('PIN code not found — please check it')}</p>
          : isError ? <p className="text-xs text-amber-700">{t('Could not look up the PIN code — fill in the city and state by hand')}</p>
            : pin.length > 0 && pin.length < 6 ? <p className="text-xs text-gray-400">{t('Type all 6 digits to fill city and state')}</p>
              : null}
    </div>
  );
}
