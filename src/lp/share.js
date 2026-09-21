// Deelbare voorbeeldlink voor de klant (LP Fabriek).
//
// Idee: bij een pagina maak je met een klik een unieke link (/voorbeeld/<token>) die de pagina
// toont zoals hij nu is, zonder inlog, zodat je die direct naar de klant kunt sturen. De link toont
// altijd de laatste versie, heeft een vervaldatum en kan worden ingetrokken.
//
// Opslag: het token staat als tekst in de Notion property "Deellink" van de pagina, als
// "<token>|<vervaldatum ISO>". Eén actieve link per pagina: een nieuwe link vervangt de oude,
// intrekken maakt het veld leeg. Er is dus geen aparte database of geheim nodig.
//
// Veiligheid: het token is 32 willekeurige bytes (256 bit), dus niet te raden. De publieke route
// geeft nooit iets anders terug dan de gerenderde pagina zelf.

const crypto = require('node:crypto');

const DEFAULT_DAYS = 14;
const MIN_DAYS = 1;
const MAX_DAYS = 90;
const TOKEN_LENGTH = 43; // 32 bytes als base64url

function createToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function isValidTokenShape(token) {
  return typeof token === 'string' && token.length === TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(token);
}

function clampDays(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, n));
}

function computeExpiry(days, now = new Date()) {
  return new Date(now.getTime() + clampDays(days) * 24 * 60 * 60 * 1000).toISOString();
}

function buildShareValue(token, expiresAtIso) {
  return `${token}|${expiresAtIso}`;
}

// Geeft { token, expiresAt } of null als de waarde leeg of beschadigd is.
function parseShareValue(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const [token, expiresAt] = raw.split('|');
  if (!isValidTokenShape(token)) return null;
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time)) return null;
  return { token, expiresAt: new Date(time).toISOString() };
}

function isExpired(expiresAtIso, now = new Date()) {
  return Date.parse(expiresAtIso) <= now.getTime();
}

function tokensMatch(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// De link die de klant krijgt. LP_SHARE_BASE_URL laat je een eigen domein instellen, anders
// gebruiken we het adres van Render zelf, en als laatste redmiddel het adres van het verzoek.
function getPublicBaseUrl(req, env = process.env) {
  const fromEnv = env.LP_SHARE_BASE_URL || env.RENDER_EXTERNAL_URL || env.LP_ASSETS_BASE_URL;
  if (fromEnv) return String(fromEnv).replace(/\/+$/, '');
  const host = req.get('host') || 'localhost';
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${isLocal ? 'http' : 'https'}://${host}`;
}

function buildShareUrl(baseUrl, token) {
  return `${String(baseUrl).replace(/\/+$/, '')}/voorbeeld/${token}`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDutchDate(iso) {
  return new Date(iso).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam'
  });
}

// Volledig HTML document voor de klant. De banner bovenaan legt uit dat header en menu ontbreken
// (die komen pas mee zodra de pagina echt op de site van de klant staat) en houdt zoekmachines
// buiten.
function wrapSharedDoc({ title, html, expiresAt }) {
  const safeTitle = escapeHtml(title || 'Voorbeeld');
  const validUntil = expiresAt ? ` Deze link is geldig tot ${escapeHtml(formatDutchDate(expiresAt))}.` : '';
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<title>Voorbeeld: ${safeTitle}</title>
<style>
html, body { margin: 0; padding: 0; }
.lp-share-banner { background: #111; color: #fff; font: 14px/1.4 system-ui, sans-serif; padding: 10px 16px; text-align: center; }
</style>
</head>
<body>
<div class="lp-share-banner">Dit is een voorbeeld van de pagina. Header, menu en footer komen van jullie eigen site zodra de pagina live staat.${validUntil}</div>
${html}
</body>
</html>`;
}

function messagePage(text) {
  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Voorbeeld</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;color:#222;"><p>${escapeHtml(text)}</p></body></html>`;
}

module.exports = {
  DEFAULT_DAYS,
  MIN_DAYS,
  MAX_DAYS,
  createToken,
  isValidTokenShape,
  clampDays,
  computeExpiry,
  buildShareValue,
  parseShareValue,
  isExpired,
  tokensMatch,
  getPublicBaseUrl,
  buildShareUrl,
  escapeHtml,
  wrapSharedDoc,
  messagePage
};
