require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const apiRoutes = require('./src/routes/api');
const adminRoutes = require('./src/routes/admin');
const lpRoutes = require('./src/routes/lp');

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
app.use(express.static(path.join(__dirname, 'public')));

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
