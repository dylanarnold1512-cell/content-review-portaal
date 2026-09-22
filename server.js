require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const apiRoutes = require('./src/routes/api');
const adminRoutes = require('./src/routes/admin');
const lpRoutes = require('./src/routes/lp');
const shareRoutes = require('./src/routes/share');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  console.warn(
    'WAARSCHUWING: SESSION_SECRET is niet gezet. Zet een lange willekeurige waarde voordat dit live gaat.'
  );
}

app.use(express.json({ limit: '20mb' })); // ruimer i.v.m. foto-uploads via de LP Fabriek mediakiezer
app.use(
  cookieSession({
    name: 'portal_session',
    keys: [SESSION_SECRET || 'dev-only-onveilige-standaardwaarde'],
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dagen
    httpOnly: true,
    sameSite: 'lax'
  })
);

app.use('/api/admin', adminRoutes);
app.use('/api/lp', lpRoutes);
app.use('/api', apiRoutes);
// Publieke deellink voor de klant, zonder inlog (zie src/routes/share.js en src/lp/share.js).
app.use('/voorbeeld', shareRoutes);
// CORS-header specifiek voor zelf-gehoste lettertypen (21-09-2026, zie style.js,
// renderCustomFontFaces): een pagina draait straks op de site van de klant, dus een ANDER domein
// dan waar dit bestand vandaan komt. Browsers passen bij @font-face altijd CORS toe, ongeacht of de
// afbeelding-tags op de pagina dat ook al zouden toestaan — zonder deze header laadt het font-
// bestand niet op de klant-site. Bewust smal gehouden tot alleen /fonts, niet de hele public-map.
app.use('/fonts', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});
// Cache-Control: no-cache op alle statische bestanden (styles.css, lp.js, admin.html, etc.):
// dit dwingt de browser om bij elke laad een conditionele request (If-None-Match) naar de server te
// sturen in plaats van een oude versie uit eigen cache te hertonen. Zonder deze header stuurt
// Express geen Cache-Control mee, en dan passen browsers "heuristische caching" toe (RFC 7234) —
// ze kunnen een bestand dagenlang uit disk-cache serveren zonder ooit de server te vragen of er een
// update is. Dat verklaarde waarom Dylan na de portaal-herontwerp-deploy op sommige tabbladen nog de
// oude, onstyled versie zag terwijl andere tabbladen (met een lege/verlopen cache) de nieuwe versie
// wel meteen goed toonden — dezelfde URL, verschillend resultaat, puur door browser-cache-gedrag.
// 'no-cache' betekent hier NIET "nooit cachen": het bestand wordt nog steeds lokaal bewaard, maar de
// browser moet elke keer eerst bij de server checken of het nog actueel is (via ETag), en krijgt bij
// geen wijziging een snelle 304 terug. Zie systeem-logboek.md, 22-09-2026.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache');
  }
}));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// LP Fabriek: interne zone, zie besluiten.md "Portaal: een app, twee zones".
app.get('/lp', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lp.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Content review portaal draait op poort ${PORT}`);
});
