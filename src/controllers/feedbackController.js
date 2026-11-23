const { resolveLanguage, getTranslations, formatDateForLanguage, SUPPORTED_LANGUAGES } = require('../i18n');
const { renderFeedbackPage, renderThankYouPage } = require('../views/feedbackPage');

const LANGUAGE_LINKS = SUPPORTED_LANGUAGES.map((code) => ({ code, name: getTranslations(code).languageName }));

function pageContext(req) {
  const language = resolveLanguage(req.query.lang);
  return { language, t: getTranslations(language), today: formatDateForLanguage(language) };
}

// GET /feedback?lang=fr
function showForm(req, res) {
  res.type('html').send(renderFeedbackPage({ ...pageContext(req), languages: LANGUAGE_LINKS }));
}

// POST /feedback - answers are not stored; the page only confirms receipt.
function submit(req, res) {
  res.type('html').send(renderThankYouPage(pageContext(req)));
}

module.exports = { showForm, submit };
