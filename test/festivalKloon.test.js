const test = require('node:test');
const assert = require('node:assert');
const f = require('../src/lp/festivalKloon');

test('veiligeUrl: alleen openbare http(s) links', () => {
  assert.strictEqual(f.veiligeUrl('https://www.festival.nl/info').hostname, 'www.festival.nl');
  for (const slecht of ['ftp://x.nl', 'http://localhost/x', 'http://127.0.0.1/', 'http://192.168.1.5/', 'http://10.0.0.1/', 'geen link']) {
    assert.throws(() => f.veiligeUrl(slecht));
  }
});

test('paginaTekst: haalt scripts, stijl en tags weg', () => {
  const t = f.paginaTekst('<html><script>x()</script><style>a{}</style><nav>menu</nav><h1>Testival</h1><p>12 t/m 14 oktober &amp; meer</p></html>');
  assert.strictEqual(t, 'Testival 12 t/m 14 oktober & meer');
});

test('haalFestivalFeiten: leest feiten uit de pagina en combineert met wat Dylan invulde', async () => {
  const fetchFn = async () => ({ ok: true, text: async () => `<p>${'Testival Tilburg is van 12 t/m 14 oktober 2026 op het Spoorpark. '.repeat(3)}</p>` });
  const callAi = async () => ({ naam: 'Testival', plaats: 'Tilburg', datum: '12 t/m 14 oktober 2026', tijden: '', locatie: 'Spoorpark', bijzonderheden: '' });
  const r = await f.haalFestivalFeiten({ naam: 'Testival Tilburg', url: 'https://testival.nl', wensen: 'vroeg inchecken' }, { callAi, fetchFn });
  assert.strictEqual(r.festival.naam, 'Testival Tilburg');
  assert.strictEqual(r.festival.plaats, 'Tilburg');
  assert.strictEqual(r.festival.datum, '12 t/m 14 oktober 2026');
  assert.ok(r.feiten.some((x) => x.label === 'Locatie van het festival' && x.waarde === 'Spoorpark'));
  assert.ok(r.feiten.some((x) => x.label.startsWith('Extra wensen')));
  assert.deepStrictEqual(r.waarschuwingen, []);
});

test('haalFestivalFeiten: een mislukte pagina geeft een waarschuwing, geen fout', async () => {
  const fetchFn = async () => ({ ok: false, status: 403, text: async () => '' });
  const r = await f.haalFestivalFeiten({ naam: 'Testival', url: 'https://testival.nl' }, { callAi: async () => ({}), fetchFn });
  assert.strictEqual(r.festival.naam, 'Testival');
  assert.strictEqual(r.waarschuwingen.length, 1);
  assert.match(r.waarschuwingen[0], /niet worden gelezen/);
});

test('haalFestivalFeiten: zonder naam een duidelijke fout', async () => {
  await assert.rejects(() => f.haalFestivalFeiten({ naam: '' }, { callAi: async () => ({}) }), /naam van het festival/);
});

test('kiesAiVelden: koppen en tekst, plus velden met de plaats van de bron', () => {
  const velden = [
    { id: 'a', soort: 'tekst', waarde: 'Kop', standaardAi: true },
    { id: 'b', soort: 'tekst', waarde: 'Kamer in Breda', standaardAi: false },
    { id: 'c', soort: 'tekst', waarde: 'Gratis WiFi', standaardAi: false },
    { id: 'd', soort: 'link', waarde: 'https://x.nl/breda', standaardAi: false }
  ];
  assert.deepStrictEqual(f.kiesAiVelden(velden, 'Breda').map((v) => v.id), ['a', 'b']);
});

test('reviseerTeksten: geeft alleen echte wijzigingen terug', async () => {
  const callAi = async () => ({ velden: [{ id: 'a', waarde: '<p>Nieuw</p>' }, { id: 'b', waarde: 'zelfde' }, { id: 'x', waarde: 'onbekend' }] });
  const r = await f.reviseerTeksten({
    instructie: 'haal de vinkjes weg',
    velden: [{ id: 'a', groep: 'Tekst 1', label: 'Tekst', huidig: '<p>Oud</p><p>✓ Vinkje</p>' }, { id: 'b', groep: 'Kop 1', label: 'Kop', huidig: 'zelfde' }],
    callAi
  });
  assert.deepStrictEqual(r.voorstellen, [{ id: 'a', waarde: '<p>Nieuw</p>' }]);
  assert.deepStrictEqual(r.waarschuwingen, []);
  await assert.rejects(() => f.reviseerTeksten({ instructie: '', velden: [], callAi }), /wat er anders moet/);
});

test('bouwVoorbeeldHtml: vervangt tekst ook bij gekrulde aanhalingstekens en streepjes', () => {
  const html = '<html><head></head><body><h2>Op zoek naar een hostel in Breda?</h2><div><p>Het is er ’s avonds gezellig &#8211; echt waar.</p></div></body></html>';
  const r = f.bouwVoorbeeldHtml({
    html,
    baseUrl: 'https://www.site.nl/',
    wijzigingen: [
      { oud: 'Op zoek naar een hostel in Breda?', nieuw: 'Slapen bij Testival & meer', soort: 'tekst' },
      { oud: "Het is er 's avonds gezellig - echt waar.", nieuw: 'Nieuw', soort: 'tekst' }
    ]
  });
  assert.match(r.html, /Slapen bij Testival &amp; meer/);
  assert.match(r.html, /<p>Nieuw<\/p>/);
  assert.match(r.html, /<base href="https:\/\/www\.site\.nl\/"/);
  assert.strictEqual(r.nietGevonden, 0);
});

test('bouwVoorbeeldHtml: haalt scripts weg en telt teksten die niet gevonden zijn', () => {
  const r = f.bouwVoorbeeldHtml({
    html: '<html><head><script>x()</script></head><body><p>Hoi</p></body></html>',
    baseUrl: 'https://s.nl/',
    wijzigingen: [{ oud: 'Bestaat niet', nieuw: 'X', soort: 'tekst' }]
  });
  assert.doesNotMatch(r.html, /<script/);
  assert.strictEqual(r.nietGevonden, 1);
});

test('bouwVoorbeeldHtml: rich text met HTML wordt als HTML ingezet', () => {
  const r = f.bouwVoorbeeldHtml({
    html: '<body><div><p style="text-align: center;">Oud</p></div></body>',
    baseUrl: 'https://s.nl/',
    wijzigingen: [{ oud: '<p style="text-align: center;">Oud</p>', nieuw: '<p style="text-align: center;"><strong>Nieuw</strong></p>', soort: 'tekst' }]
  });
  assert.match(r.html, /<strong>Nieuw<\/strong>/);
});

test('bouwVoorbeedHtml via module id: rich text en kop, ook als wpautop de tekst anders heeft gemaakt', () => {
  const html = '<html><head></head><body>' +
    '<div class="fl-module fl-module-heading fl-node-abc123" data-node="abc123"><div class="fl-module-content fl-node-content"><h2 class="fl-heading"><span class="fl-heading-text">Op zoek naar een hostel in Breda?</span></h2></div></div>' +
    '<div class="fl-module fl-module-rich-text fl-node-def456"><div class="fl-module-content fl-node-content"><div class="fl-rich-text"><p style="text-align: center;">Oude tekst.</p>\n<p>&nbsp;</p>\n<p style="text-align: center;">✓ Vinkje</p></div></div></div>' +
    '</body></html>';
  const r = f.bouwVoorbeeldHtml({
    html,
    baseUrl: 'https://s.nl/',
    wijzigingen: [
      { node: 'abc123', pad: 'heading', module: 'heading', oud: 'Op zoek naar een hostel in Breda?', nieuw: 'Slapen bij Testival & meer', soort: 'tekst' },
      { node: 'def456', pad: 'text', module: 'rich-text', oud: '<p style="text-align: center;">Oude tekst.</p>\n&nbsp;\n<p style="text-align: center;">✓ Vinkje</p>', nieuw: '<p>Nieuwe tekst zonder vinkjes</p>', soort: 'tekst' }
    ]
  });
  assert.match(r.html, /<span class="fl-heading-text">Slapen bij Testival &amp; meer<\/span>/);
  assert.match(r.html, /<div class="fl-rich-text"><p>Nieuwe tekst zonder vinkjes<\/p><\/div>/);
  assert.doesNotMatch(r.html, /Vinkje/);
  assert.strictEqual(r.nietGevonden, 0);
});
