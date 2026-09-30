const test = require('node:test');
const assert = require('node:assert');
const {
  labelVelden, schoneSlug, bouwKloonVerzoek, roepWebhook, normaliseerAntwoord, haalVelden, maakKloon,
  controleerHtmlStructuur, stelInhoudVoor, webhookConfig
} = require('../src/lp/wpKloon');

const ENV = { LP_KLOON_WEBHOOK_URL: 'https://n8n.test/webhook/lp-wp-kloon', LP_KLOON_WEBHOOK_KEY: 'geheim' };

const RUW = [
  { node: 'a1', module: 'heading', pad: 'heading', soort: 'tekst', waarde: 'Op zoek naar een hostel in Breda?' },
  { node: 'a2', module: 'rich-text', pad: 'text', soort: 'tekst', waarde: '<p style="text-align: center;">Hostel Roots ligt in Tilburg.</p>' },
  { node: 'b1', module: 'info-box', pad: 'title', soort: 'tekst', waarde: 'Economy Private Rooms' },
  { node: 'b1', module: 'info-box', pad: 'photo', soort: 'afbeelding', waarde: '3527' },
  { node: 'b1', module: 'info-box', pad: 'btn_link', soort: 'link', waarde: 'https://x.nl/kamers/' },
  { node: 'c1', module: 'info-list', pad: 'add_list_item.2.list_item_title', soort: 'tekst', waarde: 'Gratis WiFi' },
  { node: 'b2', module: 'info-box', pad: 'title', soort: 'tekst', waarde: 'Standaard gedeelde kamer' }
];

test('labelVelden: groepen, labels en volgorde', () => {
  const v = labelVelden(RUW);
  assert.strictEqual(v.length, 7);
  assert.strictEqual(v[0].id, 'a1|heading');
  assert.strictEqual(v[0].groep, 'Kop 1: Op zoek naar een hostel in Breda?');
  assert.strictEqual(v[0].label, 'Kop');
  assert.strictEqual(v[2].groep, 'Kaart 1: Economy Private Rooms');
  assert.strictEqual(v[3].groep, v[2].groep);
  assert.strictEqual(v[4].label, 'Knoplink');
  assert.strictEqual(v[5].label, 'Item 3: Titel');
  assert.strictEqual(v[6].groep, 'Kaart 2: Standaard gedeelde kamer');
});

test('labelVelden: alleen koppen en lopende tekst staan standaard aan voor de AI', () => {
  const v = labelVelden(RUW);
  assert.strictEqual(v[0].standaardAi, true);
  assert.strictEqual(v[1].standaardAi, true);
  assert.strictEqual(v[2].standaardAi, false); // kaarttitel (kamernaam)
  assert.strictEqual(v[3].standaardAi, false); // foto
  assert.strictEqual(v[4].standaardAi, false); // link
});

test('labelVelden: onbekende of lege invoer breekt niet', () => {
  assert.deepStrictEqual(labelVelden(null), []);
  assert.deepStrictEqual(labelVelden([null, {}, { node: 'x' }]), []);
});

test('schoneSlug', () => {
  assert.strictEqual(schoneSlug('Hostel bij Eindhoven!'), 'hostel-bij-eindhoven');
  assert.strictEqual(schoneSlug('Café Zoë'), 'cafe-zoe');
  assert.strictEqual(schoneSlug('  --Test--  '), 'test');
});

test('bouwKloonVerzoek: status is altijd draft en lege of ongeldige velden vallen weg', () => {
  const v = bouwKloonVerzoek({
    bron: '14894', titel: ' Hostel bij Eindhoven ', slug: '', seoPlugin: 'yoast', metaTitel: 'Titel', metaBeschrijving: '',
    velden: [
      { node: 'a1', pad: 'heading', waarde: 'Nieuw' },
      { node: 'b1', pad: 'photo', attachment: '99' },
      { node: 'x', pad: 'y' },
      null
    ],
    zoekvervang: [{ zoek: 'Breda', vervang: 'Eindhoven' }, { zoek: ' ', vervang: 'x' }],
    dryRun: false,
    status: 'publish'
  });
  assert.strictEqual(v.modus, 'kloon');
  assert.strictEqual(v.bron, 14894);
  assert.strictEqual(v.status, 'draft');
  assert.strictEqual(v.slug, 'hostel-bij-eindhoven');
  assert.deepStrictEqual(v.velden, [
    { node: 'a1', pad: 'heading', waarde: 'Nieuw' },
    { node: 'b1', pad: 'photo', attachment: 99 }
  ]);
  assert.deepStrictEqual(v.zoekvervang, [{ zoek: 'Breda', vervang: 'Eindhoven' }]);
  assert.deepStrictEqual(v.seo, { plugin: 'yoast', titel: 'Titel', beschrijving: '' });
  assert.strictEqual(v.dry_run, false);
});

test('bouwKloonVerzoek: zonder SEO plugin geen seo blok, en verplichte velden worden gecontroleerd', () => {
  const v = bouwKloonVerzoek({ bron: 1, titel: 'X', metaTitel: 'Titel' });
  assert.strictEqual(v.seo, undefined);
  assert.throws(() => bouwKloonVerzoek({ bron: 0, titel: 'X' }), /Bronpagina/);
  assert.throws(() => bouwKloonVerzoek({ bron: 1, titel: '  ' }), /Titel/);
  assert.throws(() => bouwKloonVerzoek({ bron: 1, titel: 'X', velden: [{ node: 'a', pad: 'photo', attachment: 'abc' }] }), /mediabestand/);
});

test('webhookConfig: melding als de environment variables ontbreken, standaard headernaam', () => {
  assert.throws(() => webhookConfig({}), /LP_KLOON_WEBHOOK_URL/);
  assert.strictEqual(webhookConfig(ENV).header, 'X-LP-Key');
  assert.strictEqual(webhookConfig({ ...ENV, LP_KLOON_WEBHOOK_HEADER: 'X-Sleutel' }).header, 'X-Sleutel');
});

function nepFetch(antwoord, { ok = true, status = 200 } = {}) {
  const aanroepen = [];
  const fn = async (url, opties) => {
    aanroepen.push({ url, opties });
    return { ok, status, statusText: 'x', json: async () => antwoord };
  };
  fn.aanroepen = aanroepen;
  return fn;
}

test('roepWebhook: stuurt de sleutel mee in de header en het verzoek als JSON', async () => {
  const f = nepFetch({ ok: true });
  await roepWebhook({ modus: 'velden', bron: 1 }, { fetchFn: f, env: ENV });
  assert.strictEqual(f.aanroepen[0].url, ENV.LP_KLOON_WEBHOOK_URL);
  assert.strictEqual(f.aanroepen[0].opties.headers['X-LP-Key'], 'geheim');
  assert.deepStrictEqual(JSON.parse(f.aanroepen[0].opties.body), { modus: 'velden', bron: 1 });
});

test('roepWebhook: een WordPress fout in het antwoord wordt een echte fout', async () => {
  const f = nepFetch({ code: 'lpk_bron', message: 'Bronpagina niet gevonden.', data: { status: 404 } });
  await assert.rejects(roepWebhook({}, { fetchFn: f, env: ENV }), /WordPress: Bronpagina niet gevonden/);
});

test('roepWebhook: een dry run antwoord telt niet als fout', async () => {
  const f = nepFetch({ dry_run: true, wijzigingen: 2, waarschuwingen: [] });
  const data = await roepWebhook({}, { fetchFn: f, env: ENV });
  assert.strictEqual(data.dry_run, true);
});

test('roepWebhook: HTTP fout van n8n geeft een duidelijke melding', async () => {
  const f = nepFetch({ message: 'Forbidden' }, { ok: false, status: 403 });
  await assert.rejects(roepWebhook({}, { fetchFn: f, env: ENV }), /n8n webhook gaf een fout \(403\): Forbidden/);
});

test('haalVelden en maakKloon: hele keten met een nep webhook', async () => {
  const oud = { ...process.env };
  Object.assign(process.env, ENV);
  const echteFetch = global.fetch;
  try {
    global.fetch = nepFetch({ bron: 14894, titel: 'Hostel bij Breda', slug: 'hostel-breda', url: 'https://x/', modules: { heading: 1 }, velden: RUW });
    const velden = await haalVelden({ bron: 14894 });
    assert.strictEqual(velden.velden.length, 7);
    assert.strictEqual(velden.velden[0].groep.startsWith('Kop 1'), true);

    global.fetch = nepFetch({ ok: true, id: 15295, url: 'https://x/?page_id=15295', bewerk_url: 'https://x/wp-admin', builder_url: 'https://x/?fl_builder', slug: 'test', status: 'draft', wijzigingen: 5, seo: 'niet_van_toepassing', waarschuwingen: ['let op'] });
    const r = await maakKloon({ bron: 14894, titel: 'Test' });
    assert.strictEqual(r.id, 15295);
    assert.strictEqual(r.status, 'draft');
    assert.strictEqual(r.builderUrl, 'https://x/?fl_builder');
    assert.deepStrictEqual(r.waarschuwingen, ['let op']);
  } finally {
    global.fetch = echteFetch;
    for (const k of Object.keys(ENV)) { if (oud[k] === undefined) delete process.env[k]; else process.env[k] = oud[k]; }
  }
});

test('normaliseerAntwoord: ontbrekende velden krijgen veilige standaardwaarden', () => {
  const r = normaliseerAntwoord({});
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.waarschuwingen, []);
  assert.strictEqual(r.wijzigingen, 0);
});

test('controleerHtmlStructuur: zelfde tags is goed, andere tags is niet goed', () => {
  assert.strictEqual(controleerHtmlStructuur('<p style="a">Hallo <strong>x</strong></p>', '<p style="a">Hoi <strong>y</strong></p>'), true);
  assert.strictEqual(controleerHtmlStructuur('<p>Hallo</p>', '<p>Hallo</p><p>Meer</p>'), false);
  assert.strictEqual(controleerHtmlStructuur('Kale tekst', 'Andere kale tekst'), true);
  assert.strictEqual(controleerHtmlStructuur('Kale tekst', '<b>tekst</b>'), false);
});

test('stelInhoudVoor: alleen bekende velden komen terug, opmaakwijziging geeft een waarschuwing', async () => {
  const velden = [
    { id: 'a1|heading', groep: 'Kop 1', label: 'Kop', huidig: 'Hostel bij Breda' },
    { id: 'a2|text', groep: 'Tekst 1', label: 'Tekst', huidig: '<p>Oud</p>' },
    { id: 'a3|text', groep: 'Tekst 2', label: 'Tekst', huidig: 'Nog een' }
  ];
  let gezien = null;
  const callAi = async (p) => {
    gezien = p;
    return { velden: [
      { id: 'a1|heading', waarde: 'Hostel bij Eindhoven' },
      { id: 'a2|text', waarde: '<p>Nieuw</p><p>Extra</p>' },
      { id: 'onbekend|x', waarde: 'negeer mij' }
    ] };
  };
  const r = await stelInhoudVoor({ opdracht: 'Eindhoven', feiten: [{ label: 'Adres', waarde: 'Stationsstraat 41' }], velden, callAi });
  assert.deepStrictEqual(r.voorstellen.map((v) => v.id), ['a1|heading', 'a2|text']);
  assert.ok(r.waarschuwingen.some((w) => /opmaak/.test(w)));
  assert.ok(r.waarschuwingen.some((w) => /1 veld/.test(w)));
  assert.ok(gezien.userPrompt.includes('Stationsstraat 41'));
  assert.ok(/Verzin geen feiten/.test(gezien.systemPrompt));
});

test('stelInhoudVoor: zonder opdracht of zonder velden een duidelijke fout', async () => {
  await assert.rejects(stelInhoudVoor({ opdracht: '', velden: [{ id: 'a', huidig: 'x' }], callAi: async () => ({}) }), /waar de nieuwe pagina over gaat/);
  await assert.rejects(stelInhoudVoor({ opdracht: 'x', velden: [], callAi: async () => ({}) }), /Geen tekstvelden/);
});
