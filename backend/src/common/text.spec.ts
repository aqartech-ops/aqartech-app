import { likePattern, normalizeSearch } from './text.js';

describe('normalizeSearch', () => {
  it('unifies Arabic letter forms', () => {
    expect(normalizeSearch('أحمد')).toBe(normalizeSearch('احمد'));
    expect(normalizeSearch('إبراهيم')).toBe('ابراهيم');
    expect(normalizeSearch('مدرسة')).toBe('مدرسه');
    expect(normalizeSearch('مستشفى')).toBe('مستشفي');
  });

  it('drops diacritics and tatweel', () => {
    expect(normalizeSearch('مُحَمَّد')).toBe('محمد');
    expect(normalizeSearch('عـقـار')).toBe('عقار');
  });

  it('converts Arabic-Indic digits and lower-cases Latin', () => {
    expect(normalizeSearch('٩٩١٢٣')).toBe('99123');
    expect(normalizeSearch('AqarTech')).toBe('aqartech');
  });

  it('escapes LIKE wildcards', () => {
    expect(likePattern('50%')).toBe('%50\\%%');
  });
});
