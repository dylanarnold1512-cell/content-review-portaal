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

test('pasPagrToe: Pagr. rijen worden per pagina in een keer toegepast, andere rijen blijven staan', async () => {
  const rijen = [
    { id: 1, klant: 'Hirs', status: 'goedgekeurd', pagina_type: 'pagr', pagina_url: 'https://h.nl/b/', pagina_titel: 'B', vraag: 'Welke installateur regelt alles?', antwoord: LANG, vervangt_vraag: 'Hoe lang duurt het?', aangemaakt: '1' },
    { id: 2, klant: 'Hirs', status: 'goedgekeurd', pagina_type: 'pagr', pagina_url: 'https://h.nl/b/', pagina_titel: 'B', vraag: 'Wie verbouwt in Haarlem?', antwoord: LANG, vervangt_vraag: '', aangemaakt: '2' },
    { id: 3, klant: 'BCU', status: 'goedgekeurd', pagina_type: 'post', pagina_url: 'https://b.nl/a/', vraag: 'Blog vraag?', antwoord: LANG }
  ];
  const oud = global.fetch;
  process.env.N8N_API_KEY = 'test';
  global.fetch = async (url, opties = {}) => {
    if (String(url).includes('/rows/update')) {
      const body = JSON.parse(opties.body);
      const id = body.filter.filters[0].value;
      Object.assign(rijen.find((r) => r.id === id), body.data);
      return { ok: true, status: 200, text: async () => '{}' };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: rijen }) };
  };
  const gekregen = [];
  try {
    const uit = await faq.pasPagrToe({ voegToe: async (x) => { gekregen.push(x); }, nu: () => 'NU' });
    assert.equal(gekregen.length, 1, 'een pagina is een keer aangepast');
    assert.equal(gekregen[0].vragen.length, 2);
    assert.equal(gekregen[0].vragen[0].vervang, 'Hoe lang duurt het?');
    assert.equal(rijen[0].status, 'toegepast');
    assert.equal(rijen[0].toegepast, 'NU');
    assert.equal(rijen[2].status, 'goedgekeurd', 'blogs zijn voor de n8n workflow');
    assert.deepEqual(uit.toegepast[0].wijzigingen[0], { oud: 'Hoe lang duurt het?', nieuw: 'Welke installateur regelt alles?' });
    assert.equal(uit.mislukt.length, 0);
  } finally { global.fetch = oud; }
});

test('pasPagrToe: een fout bij het toepassen zet de rijen op mislukt met de reden', async () => {
  const rijen = [{ id: 5, klant: 'Hirs', status: 'goedgekeurd', pagina_type: 'pagr', pagina_url: 'https://h.nl/b/', vraag: 'Vraag?', antwoord: LANG }];
  const oud = global.fetch;
  process.env.N8N_API_KEY = 'test';
  global.fetch = async (url, opties = {}) => {
    if (String(url).includes('/rows/update')) { Object.assign(rijen[0], JSON.parse(opties.body).data); return { ok: true, status: 200, text: async () => '{}' }; }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: rijen }) };
  };
  try {
    const uit = await faq.pasPagrToe({ voegToe: async () => { throw new Error('Pagina niet geldig'); } });
    assert.equal(rijen[0].status, 'mislukt');
    assert.match(rijen[0].reden, /Pagina niet geldig/);
    assert.equal(uit.mislukt.length, 1);
  } finally { global.fetch = oud; }
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
