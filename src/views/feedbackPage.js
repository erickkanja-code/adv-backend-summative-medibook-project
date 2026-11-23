// Server-rendered HTML for the feedback page. Every translated string is
// HTML-escaped before it is inserted.

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLES = `
  :root { --bg: #f3f6f8; --surface: #ffffff; --text: #18323f; --muted: #52707e; --accent: #0f6e78; --line: #c9d7de; color-scheme: light; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0f1d24; --surface: #16272f; --text: #e3eef2; --muted: #9db6c0; --accent: #5cc3cc; --line: #2d4651; color-scheme: dark; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.6 Georgia, "Times New Roman", serif; }
  main { max-width: 44rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  header { border-left: 4px solid var(--accent); padding-left: 1rem; margin-bottom: 2rem; }
  h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 .5rem; }
  .meta { color: var(--muted); font-family: system-ui, sans-serif; font-size: .95rem; margin: .25rem 0; }
  nav a { color: var(--accent); margin-right: .75rem; }
  nav a[aria-current="page"] { font-weight: 700; text-decoration: none; }
  form { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 1.5rem; }
  label { display: block; font-weight: 700; margin: 1.5rem 0 .5rem; }
  label:first-of-type { margin-top: 0; }
  textarea { width: 100%; min-height: 7rem; padding: .75rem; font: 16px/1.5 system-ui, sans-serif; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 4px; resize: vertical; }
  textarea:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  button { margin-top: 1.75rem; padding: .75rem 1.5rem; font: 600 16px system-ui, sans-serif; color: #ffffff; background: var(--accent); border: 0; border-radius: 4px; cursor: pointer; }
`;

function renderLayout({ language, title, body }) {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <main>
${body}
  </main>
</body>
</html>`;
}

function renderLanguageLinks({ language, t, languages }) {
  const links = languages
    .map(({ code, name }) => {
      const current = code === language ? ' aria-current="page"' : '';
      return `<a href="/feedback?lang=${escapeHtml(code)}" hreflang="${escapeHtml(code)}"${current}>${escapeHtml(name)}</a>`;
    })
    .join('');
  return `<nav class="meta" aria-label="${escapeHtml(t.languageLabel)}">${escapeHtml(t.languageLabel)}: ${links}</nav>`;
}

function renderFeedbackPage({ language, t, today, languages }) {
  const questions = t.questions
    .map(
      (question, index) => `
      <label for="q${index + 1}">${index + 1}. ${escapeHtml(question)}</label>
      <textarea id="q${index + 1}" name="q${index + 1}" rows="5" placeholder="${escapeHtml(t.answerPlaceholder)}"></textarea>`,
    )
    .join('');

  return renderLayout({
    language,
    title: t.title,
    body: `
    <header>
      <h1>${escapeHtml(t.title)}</h1>
      <p class="meta">${escapeHtml(t.dateLabel)}: <time>${escapeHtml(today)}</time></p>
      ${renderLanguageLinks({ language, t, languages })}
    </header>
    <p>${escapeHtml(t.instructions)}</p>
    <form method="post" action="/feedback?lang=${escapeHtml(language)}">${questions}
      <button type="submit">${escapeHtml(t.submit)}</button>
    </form>`,
  });
}

function renderThankYouPage({ language, t, today }) {
  return renderLayout({
    language,
    title: t.thankYouTitle,
    body: `
    <header>
      <h1>${escapeHtml(t.thankYouTitle)}</h1>
      <p class="meta">${escapeHtml(t.dateLabel)}: <time>${escapeHtml(today)}</time></p>
    </header>
    <p>${escapeHtml(t.thankYou)}</p>
    <p><a href="/feedback?lang=${escapeHtml(language)}">${escapeHtml(t.backToForm)}</a></p>`,
  });
}

module.exports = { renderFeedbackPage, renderThankYouPage, escapeHtml };
