import { ChevronDown, X } from 'lucide-react';
import SearchableSelect from '../../ui/SearchableSelect.jsx';
import { useLanguage, useT } from '../../../i18n/index.jsx';
import { NAKSHATRAS, RASHIS, addFamilyNames, sankalpOptions, toKey } from './counterUtils.js';

const Label = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">{children}</label>
);

/** Family names as chips: Enter or comma adds a name, Backspace on an empty box removes the last. */
export function FamilyNamesInput({ names, onChange, draft, onDraft }) {
  const t = useT();
  const commit = () => {
    if (!draft.trim()) return false;
    onChange(addFamilyNames(names, draft));
    onDraft('');
    return true;
  };
  return (
    <div className="input flex min-h-[44px] flex-wrap items-center gap-1.5 py-1.5 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
      {names.map((n, i) => (
        <span key={`${n}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-primary-50 py-0.5 pl-2.5 pr-1 text-sm font-medium text-primary-800">
          {n}
          <button type="button" onClick={() => onChange(names.filter((_, j) => j !== i))} aria-label={t('Remove {name}', { name: n })}
            className="flex h-6 w-6 items-center justify-center rounded-full text-primary-500 hover:bg-primary-100 hover:text-primary-800">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <input
        id="bk-family"
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(',')) { onChange(addFamilyNames(names, v)); onDraft(''); } else onDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && draft.trim()) { e.preventDefault(); commit(); }
          else if (e.key === 'Backspace' && !draft && names.length) onChange(names.slice(0, -1));
        }}
        onBlur={commit}
        enterKeyHint="enter"
        autoCapitalize="words"
        placeholder={names.length ? '' : t('Type a name, press Enter')}
        className="min-w-[8rem] flex-1 border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0"
      />
    </div>
  );
}

/** Optional details the priest reads out in the sankalp. Collapsed by default; shows a summary. */
export default function SankalpPanel({ open, onToggle, devotee, setField, familyDraft, onFamilyDraft, notes, onNotes }) {
  const t = useT();
  const { lang } = useLanguage();
  const rashi = RASHIS.find((r) => r.value === devotee.rashi);
  const nak = NAKSHATRAS.find((r) => r.value === devotee.nakshatra);
  const show = (x, raw) => (x ? (lang === 'mr' ? x.mr : x.value) : raw);

  const summary = [
    devotee.gotra && t('Gotra: {gotra}', { gotra: devotee.gotra }),
    devotee.familyNames.length > 0 && t(devotee.familyNames.length === 1 ? '{n} family name' : '{n} family names', { n: devotee.familyNames.length }),
    show(rashi, devotee.rashi),
    show(nak, devotee.nakshatra),
    notes.trim() && t('Notes'),
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-gray-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-sm font-semibold text-gray-700">{t('Sankalp details')}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
          {summary.length ? summary.join(' · ') : t('Gotra, family names, rashi, nakshatra (optional)')}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid gap-3 border-t border-gray-100 px-3 pb-3 pt-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="bk-gotra">{t('Gotra')}</Label>
            <input id="bk-gotra" value={devotee.gotra} onChange={(e) => setField('gotra', e.target.value)} maxLength={80}
              autoCapitalize="words" className="input" placeholder={t('e.g. {example}', { example: 'Kashyap' })} />
          </div>
          <div>
            <Label>{t('Married?')}</Label>
            <div role="radiogroup" aria-label={t('Married?')} className="grid grid-cols-2 gap-2">
              {[['married', 'Married'], ['unmarried', 'Unmarried']].map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={devotee.maritalStatus === v}
                  onClick={() => setField('maritalStatus', devotee.maritalStatus === v ? '' : v)}
                  className={`min-h-[44px] rounded-lg border-2 text-sm font-medium transition-colors ${
                    devotee.maritalStatus === v ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {t(label)}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="bk-family">{t('Family names')}</Label>
            <FamilyNamesInput names={devotee.familyNames} onChange={(v) => setField('familyNames', v)} draft={familyDraft} onDraft={onFamilyDraft} />
          </div>
          <div data-enter-skip data-keep-esc>
            <Label>{t('Rashi')}</Label>
            <SearchableSelect value={devotee.rashi} onChange={(v) => setField('rashi', v)}
              options={sankalpOptions(RASHIS, lang, devotee.rashi)} placeholder={t('Choose rashi')} />
          </div>
          <div data-enter-skip data-keep-esc>
            <Label>{t('Nakshatra')}</Label>
            <SearchableSelect value={devotee.nakshatra} onChange={(v) => setField('nakshatra', v)}
              options={sankalpOptions(NAKSHATRAS, lang, devotee.nakshatra)} placeholder={t('Choose nakshatra')} />
          </div>
          <div>
            <Label htmlFor="bk-dob">{t('Date of birth')}</Label>
            <input id="bk-dob" type="date" value={devotee.dob} max={toKey()} onChange={(e) => setField('dob', e.target.value)} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="bk-btime">{t('Birth time')}</Label>
              <input id="bk-btime" type="time" value={devotee.birthTime} onChange={(e) => setField('birthTime', e.target.value)} className="input" />
            </div>
            <div>
              <Label htmlFor="bk-bplace">{t('Birth place')}</Label>
              <input id="bk-bplace" value={devotee.birthPlace} onChange={(e) => setField('birthPlace', e.target.value)} maxLength={80} autoCapitalize="words" className="input" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="bk-notes">{t('Notes')}</Label>
            <textarea id="bk-notes" rows={2} value={notes} onChange={(e) => onNotes(e.target.value)} maxLength={500}
              className="input resize-y" placeholder={t('Anything the priest or office should know')} />
          </div>
        </div>
      )}
    </div>
  );
}
