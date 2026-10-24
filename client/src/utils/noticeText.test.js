import { describe, it, expect } from 'vitest';
import { inLanguage, isNew, noticeFor } from './noticeText.js';

describe('notice text in the reader\'s language', () => {
  const notice = { title: { mr: 'मंदिर बंद', hi: '', en: 'Temple closed' }, body: { mr: 'ग्रहणामुळे', hi: '', en: '' } };

  it('uses the reader\'s language when it was typed', () => {
    expect(noticeFor(notice, 'en').title).toBe('Temple closed');
    expect(noticeFor(notice, 'mr').title).toBe('मंदिर बंद');
  });

  it('falls back field by field: Hindi readers get English before Marathi', () => {
    expect(noticeFor(notice, 'hi')).toEqual({ title: 'Temple closed', body: 'ग्रहणामुळे' });
    expect(inLanguage({ mr: 'फक्त मराठी' }, 'en')).toBe('फक्त मराठी');
    expect(inLanguage({ hi: 'केवल हिंदी' }, 'mr')).toBe('केवल हिंदी');
  });

  it('ignores blank text and missing fields', () => {
    expect(inLanguage({ mr: '   ', en: 'Hello' }, 'mr')).toBe('Hello');
    expect(inLanguage(undefined, 'mr')).toBe('');
    expect(inLanguage({}, 'xx')).toBe('');
  });

  it('marks notices posted since the board was last opened as new', () => {
    const seen = new Date('2026-10-23T10:00:00Z').getTime();
    expect(isNew({ createdAt: '2026-10-23T10:05:00Z' }, seen)).toBe(true);
    expect(isNew({ createdAt: '2026-10-23T09:55:00Z' }, seen)).toBe(false);
  });
});
