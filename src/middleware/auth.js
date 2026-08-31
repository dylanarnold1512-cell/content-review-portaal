const { getClient } = require('../config/clients');

function checkPassword(clientId, password) {
  const config = getClient(clientId);
  const expected = process.env[config.loginPasswordEnv];
  if (!expected) {
    throw new Error(
      `Geen wachtwoord ingesteld voor klant "${clientId}". Zet ${config.loginPasswordEnv} in de environment variables.`
    );
  }
  return password === expected;
}

// Simpele sessie-gate: één gedeeld wachtwoord per klant. Prima voor één of een
// handvol reviewers per klant; bij individuele accounts per persoon is dit het
// eerste stuk dat je zou vervangen (zie README, "later uitbreiden").
function requireLogin(req, res, next) {
  const clientId = req.params.clientId || req.body.clientId;
  if (req.session && req.session.clientId === clientId) {
    return next();
  }
  return res.status(401).json({ error: 'Niet ingelogd voor deze klant.' });
}

// Eén los admin-wachtwoord voor het instellingenpaneel (/admin), volledig
// gescheiden van de klantwachtwoorden.
function checkAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error('ADMIN_PASSWORD is niet gezet in de environment variables.');
  }
  return password === expected;
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: 'Niet ingelogd als admin.' });
}

// LP Fabriek (/lp): weer een eigen, los wachtwoord — bewust GEEN hergebruik
// van ADMIN_PASSWORD. Alleen Dylan en Marc, klanten kunnen hier nooit bij.
// Zie besluiten.md "Aanvulling 30-08-2026 — Portaal: een app, twee zones".
function checkLpPassword(password) {
  const expected = process.env.LP_PASSWORD;
  if (!expected) {
    throw new Error('LP_PASSWORD is niet gezet in de environment variables.');
  }
  return password === expected;
}

function requireLpInternal(req, res, next) {
  if (req.session && req.session.isLpInternal) {
    return next();
  }
  return res.status(401).json({ error: 'Niet ingelogd bij LP Fabriek.' });
}

module.exports = {
  checkPassword,
  requireLogin,
  checkAdminPassword,
  requireAdmin,
  checkLpPassword,
  requireLpInternal
};
