const { resolveLanguage, getTranslations, formatDateForLanguage } = require('../src/i18n');

describe('feedback page i18n', () => {
  test('uses the requested supported language, case-insensitively', () => {
    expect(resolveLanguage('fr')).toBe('fr');
    expect(resolveLanguage(' FR ')).toBe('fr');
  });

  test('falls back to English for missing, unsupported or malformed values', () => {
    expect([undefined, '', 'de', '__proto__', ['xx', 'fr'], { a: 1 }].map(resolveLanguage)).toEqual(
      ['en', 'en', 'en', 'en', 'en', 'en'],
    );
  });

  test('every locale has a title, instructions and exactly 5 questions', () => {
    for (const language of ['en', 'fr']) {
      const t = getTranslations(language);
      expect(typeof t.title).toBe('string');
      expect(typeof t.instructions).toBe('string');
      expect(t.questions).toHaveLength(5);
    }
  });

  test('formats a fixed date for the active locale', () => {
    const date = new Date(2026, 10, 23, 12, 0, 0);
    // Exact punctuation differs between ICU versions, so check the localized words.
    expect(formatDateForLanguage('en', date)).toMatch(/Monday.*23 November 2026/);
    expect(formatDateForLanguage('fr', date)).toMatch(/lundi.*23 novembre 2026/);
  });
});
