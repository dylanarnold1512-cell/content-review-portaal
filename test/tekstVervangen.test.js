const test = require('node:test');
const assert = require('node:assert/strict');
const { vindTekst, vervangTekst } = require('../src/lp/tekstVervangen');
const { vindVulzinnenInIntro } = require('../src/lp/validator');
const { buildContentSystemPrompt } = require('../src/lp/ai');
const { pushDraft, haalPaginaStatussen } = require('../src/lp/wordpress');
const { getLpClient } = require('../src/lp/clients');

const VULZIN = 'MAC Bouw toont uiteenlopende projecten, van verbouw en timmerwerk tot werkzaamheden buiten de woning.';

test('vindTekst: toont per veld waar de tekst staat, ook in lijsten, en beperkt tot een veld als dat is opgegeven', () => {
  const slotData = { projectsIntro: VULZIN, faqItems: [{ question: 'V', answer: `Antwoord. ${VULZIN}` }], heroTitle: 'Aannemer' };
  const alles = vindTekst(slotData, { zoek: 'toont uiteenlopende projecten' });
  assert.equal(alles.aantal, 2);
  assert.deepEqual(alles.slotKeys.sort(), ['faqItems', 'projectsIntro']);
  const een = vindTekst(slotData, { zoek: 'toont uiteenlopende projecten', slotKey: 'projectsIntro' });
  assert.equal(een.aantal, 1);
});

test('vindTekst en vervangTekst: te korte of lege zoektekst wordt geweigerd', () => {
  assert.throws(() => vindTekst({ a: 'tekst' }, { zoek: '' }), /minstens 4/);
  assert.throws(() => vervangTekst({ a: 'tekst' }, { zoek: 'ab', vervang: '' }), /minstens 4/);
});

test('vervangTekst: heleVeld maakt een veld leeg, ook als de zin per pagina een beetje verschilt', () => {
  const r = vervangTekst({ projectsIntro: VULZIN, offerIntro: 'Andere tekst.' }, { zoek: 'toont uiteenlopende', vervang: '', slotKey: 'projectsIntro', heleVeld: true });
  assert.equal(r.aantal, 1);
  assert.equal(r.slotData.projectsIntro, '');
  assert.equal(r.slotData.offerIntro, 'Andere tekst.');
});

test('vervangTekst: een deel van een tekst vervangen laat de rest staan en laat geen dubbele spaties achter', () => {
  const r = vervangTekst({ introText: `Eerste zin. ${VULZIN} Laatste zin.` }, { zoek: VULZIN, vervang: '' });
  assert.equal(r.slotData.introText, 'Eerste zin. Laatste zin.');
  const r2 = vervangTekst({ introText: 'Wij bouwen in Hillegom.' }, { zoek: 'in Hillegom', vervang: 'in Lisse' });
  assert.equal(r2.slotData.introText, 'Wij bouwen in Lisse.');
});

test('vervangTekst: verandert het originele object niet', () => {
  const orgineel = { projectsIntro: VULZIN, lijst: [{ a: VULZIN }] };
  vervangTekst(orgineel, { zoek: VULZIN, vervang: 'x' });
  assert.equal(orgineel.projectsIntro, VULZIN);
  assert.equal(orgineel.lijst[0].a, VULZIN);
});

const slots = [
  { key: 'heroIntro', label: 'Hero introductie', type: 'text' },
  { key: 'projectsIntro', label: 'Projecten introductie', type: 'text' },
  { key: 'offerIntro', label: 'Aanbod introductie', type: 'text' }
];

test('validatie: waarschuwt voor een vulzin onder een sectiekop, ook bij een andere klant en een andere formulering', () => {
  const melding = vindVulzinnenInIntro({ projectsIntro: VULZIN }, slots);
  assert.equal(melding.length, 1);
  assert.match(melding[0], /Projecten introductie/);
  assert.equal(vindVulzinnenInIntro({ offerIntro: 'Hostel Roots presenteert diverse kamers voor groepen.' }, slots).length, 1);
  assert.equal(vindVulzinnenInIntro({ offerIntro: 'De camping laat zien wat er te doen is.' }, slots).length, 0, 'geen herkenbaar bedrijf als onderwerp, geen gok');
});

test('validatie: een concrete intro, een lege intro en de hero introductie geven geen waarschuwing', () => {
  assert.deepEqual(vindVulzinnenInIntro({ projectsIntro: 'Dakterrassen, tuinhuizen en zolderverbouwingen in Hillegom en omgeving.' }, slots), []);
  assert.deepEqual(vindVulzinnenInIntro({ projectsIntro: '' }, slots), []);
  assert.deepEqual(vindVulzinnenInIntro({ heroIntro: 'Aannemersbedrijf MAC Bouw presenteert zich in Hillegom.' }, slots), []);
});

test('AI instructie voor content bevat de regel over intro onder een sectiekop', () => {
  const prompt = buildContentSystemPrompt({ slots });
  assert.match(prompt, /INTRO ONDER EEN SECTIEKOP/);
  assert.match(prompt, /laat het veld dan leeg/);
});

// Nep WordPress
function nepWordPress(antwoord) {
  const oud = global.fetch;
  const aanroepen = [];
  global.fetch = async (url, opts = {}) => {
    aanroepen.push({ url, opts });
    const json = (o, ok = true, status = 200) => ({ ok, status, statusText: 'x', headers: { get: () => null }, json: async () => o });
    if (opts.method === 'POST') return json({ id: 7, link: 'https://klant.nl/?p=7', status: antwoord || 'draft' });
    return json(antwoord && Array.isArray(antwoord) ? antwoord : { id: 7, slug: 's', meta: {} });
  };
  return { aanroepen, herstel: () => { global.fetch = oud; } };
}
function zetWpEnv() {
  process.env.WP_URL_MACBOUW = 'https://klant.nl';
  process.env.WP_USERNAME_MACBOUW = 'u';
  process.env.WP_APP_PASSWORD_MACBOUW = 'p';
}

test('pushDraft: een bestaande pagina met behoudStatus krijgt geen status mee, dus een live pagina blijft live', async () => {
  zetWpEnv();
  const nep = nepWordPress('publish');
  try {
    const res = await pushDraft({ profile: getLpClient('macbouw').profile, wpPaginaId: 7, titel: 'T', html: '<p>x</p>', slug: 's', behoudStatus: true });
    const post = nep.aanroepen.find((a) => a.opts.method === 'POST');
    assert.ok(!('status' in JSON.parse(post.opts.body)), 'er mag geen status worden meegestuurd');
    assert.equal(res.status, 'publish');
  } finally { nep.herstel(); }
});

test('pushDraft: zonder behoudStatus blijft het altijd een concept, ook bij een bestaande pagina en een nieuwe pagina', async () => {
  zetWpEnv();
  const nep = nepWordPress();
  try {
    await pushDraft({ profile: getLpClient('macbouw').profile, wpPaginaId: 7, titel: 'T', html: '<p>x</p>', slug: 's' });
    await pushDraft({ profile: getLpClient('macbouw').profile, titel: 'T', html: '<p>x</p>', slug: 's', behoudStatus: true });
    const posts = nep.aanroepen.filter((a) => a.opts.method === 'POST').map((a) => JSON.parse(a.opts.body));
    assert.equal(posts.length, 2);
    posts.forEach((b) => assert.equal(b.status, 'draft'));
  } finally { nep.herstel(); }
});

test('haalPaginaStatussen: geeft per pagina de echte WordPress status terug', async () => {
  zetWpEnv();
  const nep = nepWordPress([{ id: 7, status: 'publish' }, { id: 8, status: 'draft' }]);
  try {
    const s = await haalPaginaStatussen({ profile: getLpClient('macbouw').profile, ids: [7, 8, 8, null] });
    assert.deepEqual(s, { 7: 'publish', 8: 'draft' });
    assert.deepEqual(await haalPaginaStatussen({ profile: getLpClient('macbouw').profile, ids: [] }), {});
  } finally { nep.herstel(); }
});

test('plaatshouders worden per pagina ingevuld', () => {
  const { vulPlaatshouders } = require('../src/lp/tekstVervangen');
  assert.equal(vulPlaatshouders('Plannen om je woning in {plaats} te verbouwen met {bedrijf}?', { plaats: 'Hoofddorp', bedrijf: 'MAC Bouw' }), 'Plannen om je woning in Hoofddorp te verbouwen met MAC Bouw?');
  assert.throws(() => vulPlaatshouders('in {plaats}', { plaats: '' }), /plaatsnaam/);
  assert.equal(vulPlaatshouders('zonder houder', {}), 'zonder houder');
});
