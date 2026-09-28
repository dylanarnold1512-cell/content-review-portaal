// Tests voor screenshots van een referentiepagina bij het sjabloon-voorstel (src/lp/screenshots.js en ai.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { schoonScreenshots, screenshotUitleg, MAX_STUKKEN } = require('../src/lp/screenshots');

const KLEIN = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';

test('geen screenshots geeft een lege lijst', () => {
  assert.deepEqual(schoonScreenshots(undefined), []);
  assert.deepEqual(schoonScreenshots([]), []);
});

test('geldige data-URL\'s komen ongewijzigd terug', () => {
  assert.deepEqual(schoonScreenshots([KLEIN, KLEIN.replace('jpeg', 'png')]), [KLEIN, KLEIN.replace('jpeg', 'png')]);
});

test('ongeldige invoer wordt geweigerd met een Nederlandse melding', () => {
  assert.throws(() => schoonScreenshots('nee'), /als lijst/);
  assert.throws(() => schoonScreenshots(['https://x.nl/a.png']), /geen geldige afbeelding/);
  assert.throws(() => schoonScreenshots(['data:text/html;base64,AAAA']), /geen geldige afbeelding/);
  assert.throws(() => schoonScreenshots(Array(MAX_STUKKEN + 1).fill(KLEIN)), /Te veel/);
  assert.throws(() => schoonScreenshots(['data:image/png;base64,' + 'A'.repeat(6 * 1024 * 1024)]), /te groot/);
});

test('de uitleg voor de AI vraagt om de opzet, niet om de teksten', () => {
  const t = screenshotUitleg(3);
  assert.ok(/3 opeenvolgende stukken/.test(t));
  assert.ok(/NIET de teksten en NIET de foto/.test(t));
});

test('het sjabloon-voorstel stuurt de screenshots als afbeeldingen mee naar de AI', async () => {
  process.env.OPENAI_API_KEY = 'test';
  const ai = require('../src/lp/ai');
  const echteFetch = global.fetch;
  let verzonden = null;
  global.fetch = async (url, opts) => {
    if (String(url).includes('api.openai.com')) {
      verzonden = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ blueprint: { slots: [] }, voorbeeldSlotData: {} }) } }] }) };
    }
    return { ok: false, status: 404, text: async () => '' };
  };
  try {
    const r = await ai.generateTemplateProposal({ klant: 'roots', naam: 'Test', screenshots: [KLEIN, KLEIN] });
    assert.equal(r.blueprint.templateFormat, 'slots');
    const inhoud = verzonden.messages[1].content;
    assert.ok(Array.isArray(inhoud));
    assert.equal(inhoud.filter((p) => p.type === 'image_url').length, 2);
    assert.ok(inhoud[0].text.includes('BIJGEVOEGDE SCREENSHOT'));
    // zonder screenshots blijft de prompt gewone tekst
    await ai.generateTemplateProposal({ klant: 'roots', naam: 'Test' });
    assert.equal(typeof verzonden.messages[1].content, 'string');
  } finally {
    global.fetch = echteFetch;
  }
});

test('portaal: het formulier heeft een screenshot-veld en de knip-functie', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'lp.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'lp.js'), 'utf8');
  assert.ok(html.includes('id="lpTplNewScreenshot"'));
  assert.ok(js.includes('async function screenshotStukken'));
  assert.ok(js.includes('body.screenshots = stukken'));
});
