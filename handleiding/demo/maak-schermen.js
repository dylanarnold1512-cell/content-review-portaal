// Maakt de demoschermen voor de handleiding. Gebruik:
//   NODE_PATH=$(npm root -g) node handleiding/demo/maak-schermen.js [uitmap]
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..', '..');
const uit = path.resolve(process.argv[2] || path.join(root, 'handleiding', 'schermen-demo'));
fs.mkdirSync(uit, { recursive: true });
const SLUG = require('./demo-data').SLUG;
const PORT = 3999;

const SCHERMEN = [
  ['overzicht', 'overzicht', 1280, 800],
  ['google', 'google', 1280, 1000],
  ['ai', 'ai', 1280, 1000],
  ['rapporten', 'maandrapporten', 1280, 800],
  ['blogs', 'blogs', 1280, 860]
];

(async () => {
  const srv = spawn('node', ['-r', path.join(__dirname, 'voorlaad.js'), 'server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (b) => { const t = String(b); if (!t.includes('portaalinstellingen')) process.stderr.write(b); });
  await new Promise((r) => setTimeout(r, 2500));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2, locale: 'nl-NL' });
  const logo = '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="60" viewBox="0 0 260 60"><text x="4" y="44" font-family="Geist, Arial, sans-serif" font-weight="700" font-size="42" fill="#13172b">Advertisr<tspan fill="#ff3a55">.</tspan></text></svg>';
  await ctx.route('**/Logo_Advertisr_new_2025.svg', (r) => r.fulfill({ contentType: 'image/svg+xml', body: logo }));
  const p = await ctx.newPage();
  const login = await ctx.request.post(`http://127.0.0.1:${PORT}/api/login`, { data: { clientId: SLUG, password: 'demo' } });
  console.log('login', login.status());
  for (const [naam, hash, w, h] of SCHERMEN) {
    await p.setViewportSize({ width: w, height: h });
    await p.goto(`http://127.0.0.1:${PORT}/${SLUG}#${hash}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(uit, naam + '.png'), ...(naam === 'overzicht' ? {} : { clip: { x: 252, y: 0, width: w - 252, height: h } }) });
    console.log('schermpje', naam);
  }
  await b.close();
  srv.kill();
})().catch((e) => { console.error(e); process.exit(1); });
