const test = require('node:test');
const assert = require('node:assert/strict');
const faq = require('../src/services/aiFaq');

const LANG = 'Een badkamer renoveren duurt bij Hirs gemiddeld zeven werkdagen tot vier weken, afhankelijk van de grootte en de wensen.';

test('valideerFaq: leeg, te kort en te lang worden geweigerd, HTML en witruimte verdwijnen', () => {
  assert.throws(() => faq.valideerFaq({ vraag: '', antwoord: LANG }), /leeg/);
  assert.throws(() => faq.valideerFaq({ vraag: 'Hoe lang duurt het?', antwoord: 'Te kort.' }), /te kort/);
  assert.throws(() => faq.valideerFaq({ vraag: 'x'.repeat(250), antwoord: LANG }), /te lang/);
  assert.throws(() => faq.valideerFaq({ vraag: 'Vraag?', antwoord: 'a'.repeat(800) }), /te lang/);
  const ok = faq.valideerFaq({ vraag: '  Hoe <b>lang</b> duurt het?  ', antwoord: `<p>${LANG}</p>` });
  assert.equal(ok.vraag, 'Hoe lang duurt het?');
  assert.equal(ok.antwoord, LANG);
});

test('bouwFaqHtml: tekst is veilig, markers staan erin, een eigen sjabloon krijgt de vragen', () => {
  const items = [{ vraag: 'Is <script>x</script> veilig?', antwoord: 'Ja & nee "zo"' }, { vraag: '', antwoord: 'leeg' }];
  const standaard = faq.bouwFaqHtml(items, '', 'abc');
  assert.match(standaard, /^<!-- ai-faq:abc -->/);
  assert.match(standaard, /<!-- \/ai-faq -->$/);
  assert.doesNotMatch(standaard, /<script>/);
  assert.match(standaard, /&lt;script&gt;/);
  assert.match(standaard, /Ja &amp; nee &quot;zo&quot;/);
  assert.equal((standaard.match(/<details/g) || []).length, 1);
  const eigen = faq.bouwFaqHtml(items, '<div class="x">{{vragen}}</div>', 'abc');
  assert.match(eigen, /<div class="x"><details/);
  const zonderPlek = faq.bouwFaqHtml(items, '<div>geen plek</div>', 'abc');
  assert.match(zonderPlek, /Veelgestelde vragen/);
});

test('groepeerPerPagina, zelfdeUrl en statusPerVraag', () => {
  const g = faq.groepeerPerPagina([
    { klant: 'A', pagina_url: 'https://a.nl/x/', pagina_titel: 'X', pagina_type: 'page', id: 1 },
    { klant: 'A', pagina_url: 'https://a.nl/x/', pagina_titel: 'X', pagina_type: 'page', id: 2 },
    { klant: 'A', pagina_url: 'https://a.nl/y/', pagina_titel: 'Y', pagina_type: 'post', id: 3 }
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].rijen.length, 2);
  assert.ok(faq.zelfdeUrl('https://www.a.nl/x/#top', 'http://a.nl/x'));
  assert.ok(!faq.zelfdeUrl('https://a.nl/x/', 'https://a.nl/y/'));
  assert.ok(!faq.zelfdeUrl('', ''));
  const st = faq.statusPerVraag([
    { prompt_id: 'k01', status: 'voorstel' }, { prompt_id: 'k01', status: 'toegepast', toegepast: '2026-11-03' },
    { prompt_id: 'k02', status: 'afgewezen' }, { prompt_id: 'k03', status: 'goedgekeurd' }
  ]);
  assert.deepEqual(Object.keys(st).sort(), ['k01', 'k03']);
  assert.equal(st.k01.status, 'toegepast');
});

// Een nagebootste n8n data table met een rij.
function nepTabel(rij) {
  const aanroepen = [];
  const oud = global.fetch;
  process.env.N8N_API_KEY = 'test';
  global.fetch = async (url, opties = {}) => {
    aanroepen.push({ url: String(url), opties });
    if (String(url).includes('/rows/update')) {
      Object.assign(rij, JSON.parse(opties.body).data);
      return { ok: true, status: 200, text: async () => '{}' };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: [rij] }) };
  };
  return { aanroepen, herstel: () => { global.fetch = oud; } };
}

test('keurGoed: een blog of gewone pagina wordt goedgekeurd voor de n8n workflow', async () => {
  const rij = { id: 7, klant: 'Hirs Installaties', status: 'voorstel', pagina_type: 'page', pagina_url: 'https://h.nl/a/', vraag: 'Hoe lang duurt het?', antwoord: LANG };
  const t = nepTabel(rij);
  try {
    const uit = await faq.keurGoed({ id: 7, voegToe: async () => { throw new Error('mag niet'); } });
    assert.equal(uit.status, 'goedgekeurd');
    assert.equal(rij.status, 'goedgekeurd');
  } finally { t.herstel(); }
});

test('keurGoed: een Pagr. pagina wordt direct in Pagr. gezet, met de aangepaste tekst', async () => {
  const rij = { id: 8, klant: 'Hirs Installaties', status: 'voorstel', pagina_type: 'pagr', pagina_url: 'https://h.nl/b/', vraag: 'Oud?', antwoord: LANG };
  const t = nepTabel(rij);
  const gekregen = [];
  try {
    const uit = await faq.keurGoed({ id: 8, vraag: 'Hoe lang duurt een badkamer?', antwoord: LANG, voegToe: async (x) => { gekregen.push(x); }, nu: () => '2026-10-29T10:00:00Z' });
    assert.equal(uit.status, 'toegepast');
    assert.equal(rij.status, 'toegepast');
    assert.equal(rij.toegepast, '2026-10-29T10:00:00Z');
    assert.equal(gekregen[0].vragen[0].question, 'Hoe lang duurt een badkamer?');
    assert.equal(gekregen[0].url, 'https://h.nl/b/');
  } finally { t.herstel(); }
});

test('keurGoed: mislukt Pagr. toepassen laat het voorstel staan met de reden', async () => {
  const rij = { id: 9, klant: 'Hirs Installaties', status: 'voorstel', pagina_type: 'pagr', pagina_url: 'https://h.nl/b/', vraag: 'Vraag?', antwoord: LANG };
  const t = nepTabel(rij);
  try {
    await assert.rejects(faq.keurGoed({ id: 9, voegToe: async () => { throw new Error('Pagina niet geldig'); } }), /Pagina niet geldig/);
    assert.equal(rij.status, 'voorstel');
    assert.match(rij.reden, /Pagina niet geldig/);
  } finally { t.herstel(); }
});

test('keurGoed en wijsAf: alleen voorstellen, geen tweede keer', async () => {
  const rij = { id: 10, klant: 'K', status: 'toegepast', pagina_type: 'page', vraag: 'Vraag?', antwoord: LANG };
  const t = nepTabel(rij);
  try {
    await assert.rejects(faq.keurGoed({ id: 10 }), /staat al op/);
    await assert.rejects(faq.wijsAf({ id: 10 }), /staat al op/);
    rij.status = 'voorstel';
    const uit = await faq.wijsAf({ id: 10, reden: 'Past niet' });
    assert.equal(uit.status, 'afgewezen');
    assert.equal(rij.reden, 'Past niet');
  } finally { t.herstel(); }
});

test('voegFaqItemsToe: bestaande vragen blijven, dubbele en lege vragen niet, rest van de inhoud ongemoeid', () => {
  const content = { slotData: { heroTitle: 'Titel', faqItems: [{ question: 'Hoe lang duurt een badkamer renoveren?', answer: 'x' }] }, ander: 1 };
  const uit = faq.voegFaqItemsToe(content, [
    { question: 'Hoe lang duurt een badkamer renoveren', answer: 'dubbel' },
    { question: 'Wat kost een nieuwe badkamer?', answer: 'Dat hangt af.' },
    { question: 'Wat kost een nieuwe badkamer?', answer: 'weer dubbel' },
    { question: '', answer: 'leeg' }
  ]);
  assert.equal(uit.toegevoegd, 1);
  assert.equal(uit.content.slotData.faqItems.length, 2);
  assert.equal(uit.content.slotData.heroTitle, 'Titel');
  assert.equal(uit.content.ander, 1);
  assert.equal(content.slotData.faqItems.length, 1, 'het origineel is niet aangepast');
  assert.equal(faq.voegFaqItemsToe({}, [{ question: 'V?', answer: 'A' }]).content.slotData.faqItems.length, 1);
});

test('voegFaqItemsToe: een vraag met vervang neemt de plek van de oude vraag in, zonder vervang komt hij achteraan', () => {
  const content = { slotData: { faqItems: [
    { question: 'Wat kost een badkamer?', answer: 'Oud antwoord 1' },
    { question: 'Hoe lang duurt het?', answer: 'Oud antwoord 2' }
  ] } };
  const uit = faq.voegFaqItemsToe(content, [
    { question: 'Welke installateur in Haarlem regelt alles?', answer: LANG, vervang: 'hoe lang duurt het' },
    { question: 'Nog een vraag?', answer: LANG, vervang: 'Bestaat niet' }
  ]);
  const vragen = uit.content.slotData.faqItems.map((i) => i.question);
  assert.deepEqual(vragen, ['Wat kost een badkamer?', 'Welke installateur in Haarlem regelt alles?', 'Nog een vraag?']);
  assert.equal(uit.toegevoegd, 1);
  assert.deepEqual(uit.vervangen, [{ vraag: 'Hoe lang duurt het?', antwoord: 'Oud antwoord 2' }]);
  assert.equal(content.slotData.faqItems.length, 2);
});
