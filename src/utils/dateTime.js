// Clinic date/time helpers. All times are clinic-local wall-clock times,
// exchanged with MySQL as 'YYYY-MM-DD HH:MM:SS' strings (no time-zone shifts).

const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_HOUR = 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateTime(date) {
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Builds a local Date and rejects impossible values such as 2027-02-30 or 25:00
// (JavaScript would silently roll those over to another date).
function buildLocalDate(year, month, day, hours = 0, minutes = 0, seconds = 0) {
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  const matches =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hours &&
    date.getMinutes() === minutes &&
    date.getSeconds() === seconds;
  return matches ? date : null;
}

// 'YYYY-MM-DD HH:mm[:ss]' (space or T) -> Date, or null if malformed / impossible.
function parseLocalDateTime(text) {
  const match = typeof text === 'string' ? DATE_TIME_PATTERN.exec(text.trim()) : null;
  if (!match) return null;
  const [year, month, day, hours, minutes, seconds = 0] = match.slice(1).map((part) => Number(part || 0));
  return buildLocalDate(year, month, day, hours, minutes, seconds);
}

// 'YYYY-MM-DD' -> Date at local midnight, or null.
function parseLocalDate(text) {
  const match = typeof text === 'string' ? DATE_PATTERN.exec(text.trim()) : null;
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  return buildLocalDate(year, month, day);
}

function hoursBetween(earlier, later) {
  return (later.getTime() - earlier.getTime()) / MS_PER_HOUR;
}

module.exports = {
  DATE_TIME_PATTERN,
  formatDate,
  formatDateTime,
  parseLocalDateTime,
  parseLocalDate,
  hoursBetween,
};
