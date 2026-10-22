import { describe, it, expect } from 'vitest';
import { hallHeading, hallName, hallTitle } from './halls.js';
import { translate } from '../i18n/index.jsx';

const names = { H1: { name: 'Shri Mangal Sabhagruh', nameMr: 'श्री मंगल सभागृह' }, H2: { name: 'Annex', nameMr: '' }, H3: { name: '', nameMr: '' } };

describe('hall names', () => {
  it('shows the name with the code, in the chosen language', () => {
    expect(hallTitle('H1', names, 'en')).toBe('Shri Mangal Sabhagruh (H1)');
    expect(hallTitle('H1', names, 'mr')).toBe('श्री मंगल सभागृह (H1)');
    expect(hallTitle('H1', names, 'hi')).toBe('श्री मंगल सभागृह (H1)');   // Hindi screens: the Marathi name
  });

  it('falls back to the English name, then to the bare code', () => {
    expect(hallTitle('H2', names, 'mr')).toBe('Annex (H2)');
    expect(hallTitle('H3', names, 'en')).toBe('H3');
    expect(hallTitle('H9', names, 'en')).toBe('H9');   // a code not in the list (old booking)
    expect(hallTitle('H1', undefined, 'en')).toBe('H1');
    expect(hallTitle('', names, 'en')).toBe('');
    expect(hallName('H3', names, 'en')).toBe('');
  });

  it('keeps "Hall H3" in headings for a hall with no name', () => {
    const t = (text, vars) => translate('en', text, vars);
    const tMr = (text, vars) => translate('mr', text, vars);
    expect(hallHeading(t, 'H3', names, 'en')).toBe('Hall H3');
    expect(hallHeading(tMr, 'H3', names, 'mr')).toBe('हॉल H3');
    expect(hallHeading(t, 'H1', names, 'en')).toBe('Shri Mangal Sabhagruh (H1)');
  });
});
