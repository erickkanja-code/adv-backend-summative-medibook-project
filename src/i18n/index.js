// Locale files are loaded once at startup with require() - no file I/O per request.
const en = require('../../locales/en.json');
const fr = require('../../locales/fr.json');

const LOCALES = Object.freeze({ en, fr });
const DEFAULT_LANGUAGE = 'en';
const SUPPORTED_LANGUAGES = Object.freeze(Object.keys(LOCALES));

// Any missing, repeated, unknown or malformed ?lang value falls back to English.
function resolveLanguage(requested) {
  const candidate = Array.isArray(requested) ? requested[0] : requested;
  if (typeof candidate !== 'string') return DEFAULT_LANGUAGE;
  const code = candidate.trim().toLowerCase();
  return Object.hasOwn(LOCALES, code) ? code : DEFAULT_LANGUAGE;
}

function getTranslations(language) {
  return LOCALES[language] || LOCALES[DEFAULT_LANGUAGE];
}

// Today's date written the way the active locale writes dates.
function formatDateForLanguage(language, date = new Date()) {
  return new Intl.DateTimeFormat(getTranslations(language).locale, { dateStyle: 'full' }).format(date);
}

module.exports = { resolveLanguage, getTranslations, formatDateForLanguage, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE };
