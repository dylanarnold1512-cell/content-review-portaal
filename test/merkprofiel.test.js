const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseProfiel, regelId, splitsHerkomst, bouwWeergave, bouwKennisdocument, KOPJES } = require('../src/services/merkprofiel');

const tekst = fs.readFileSync(path.join(__dirname, 'fixtures', 'basecamp-profiel.txt'), 'utf8');

test('parseProfiel vindt alle tien kopjes in de goede volgorde', () => {
  const secties = parseProfiel(tekst);
  assert.ok(secties);
  assert.strictEqual(secties.length, 10);
  assert.deepStrictEqual(secties.map((s) => s.titel), KOPJES);
  secties.slice(0, 9).forEach((s) => assert.ok(s.feiten.length > 0, `sectie ${s.nr} heeft feiten`));
});

test('parseProfiel geeft null zonder de vaste kopjes', () => {
  assert.strictEqual(parseProfiel('Gewoon een lap tekst zonder kopjes.'), null);
  assert.strictEqual(parseProfiel(''), null);
  assert.strictEqual(parseProfiel('1. Over het bedrijf\nEen feit. (website: /)'), null);
});

test('splitsHerkomst haalt PDF en paden uit de herkomst', () => {
  const r = splitsHerkomst('De ruimte is groot. (PDF, website: /vergaderen/tipi, website: /contact)');
  assert.strictEqual(r.tekst, 'De ruimte is groot.');
  assert.strictEqual(r.herkomst.pdf, true);
  assert.deepStrictEqual(r.herkomst.paginas, ['/vergaderen/tipi', '/contact']);
  const z = splitsHerkomst('Zonder herkomst.');
  assert.strictEqual(z.herkomst.pdf, false);
  assert.strictEqual(z.herkomst.website, false);
});

test('prijzen krijgen het label intern en subkoppen worden herkend', () => {
  const secties = parseProfiel(tekst);
  const s8 = secties[7];
  const prijzen = s8.feiten.filter((f) => f.intern);
  assert.ok(prijzen.length > 5);
  assert.ok(s8.feiten.some((f) => f.subkop === 'Ruimtegegevens'));
  assert.ok(!s8.feiten.some((f) => f.tekst === 'Ruimtegegevens'));
});

test('regelId is stabiel en negeert hoofdletters en witruimte', () => {
  assert.strictEqual(regelId('Een  Feit'), regelId('een feit'));
  assert.notStrictEqual(regelId('een feit'), regelId('een ander feit'));
});

test('bouwWeergave telt bevestigde secties en verzamelt open vragen', () => {
  const secties = parseProfiel(tekst);
  const eerste = secties[0].feiten[0].id;
  const w = bouwWeergave(secties, { 'sectie-1': { status: 'klopt', datum: '2026-10-06' }, [eerste]: { status: 'niet_gebruiken', opmerking: 'x' } }, { bijgewerkt: '2026-10-06', aantalPaginas: 24 });
  assert.strictEqual(w.aantalBevestigd, 1);
  assert.strictEqual(w.secties[0].bevestigd, true);
  assert.strictEqual(w.secties[0].feiten[0].status, 'niet_gebruiken');
  assert.ok(w.openVragen.some((v) => /bevestigd/i.test(v.tekst)));
});

test('bouwKennisdocument laat uitgesloten feiten en open punten weg en past tekst aan', () => {
  const secties = parseProfiel(tekst);
  const uit = secties[1].feiten[0];
  const aan = secties[1].feiten[1];
  const open = secties[2].feiten.find((f) => f.open) || secties.flatMap((x) => x.feiten).find((f) => f.open);
  const regel9 = secties[8].feiten[0];
  const doc = bouwKennisdocument(secties, {
    [uit.id]: { status: 'niet_gebruiken', opmerking: '' },
    [aan.id]: { status: 'aangepast', opmerking: 'Nieuwe tekst van de klant.' },
    [regel9.id]: { status: 'niet_gebruiken', opmerking: '' }
  });
  assert.ok(!doc.includes(uit.tekst));
  assert.ok(doc.includes('Nieuwe tekst van de klant. (klant bevestigd)'));
  assert.ok(!doc.includes(aan.tekst));
  assert.ok(doc.includes(regel9.tekst), 'sectie 9 kan niet worden uitgesloten');
  assert.ok(!doc.includes(open.tekst));
  assert.ok(doc.startsWith('1. Over het bedrijf'));
});

test('aangepast open punt verdwijnt uit de open vragen', () => {
  const secties = parseProfiel(tekst);
  const open = secties.flatMap((x) => x.feiten).find((f) => f.open);
  const w = bouwWeergave(secties, { [open.id]: { status: 'aangepast', opmerking: 'Het zijn acht ruimtes.' } }, { bijgewerkt: '', aantalPaginas: 0 });
  assert.ok(!w.openVragen.some((v) => v.tekst === open.tekst));
});

test('parseMerktermen splitst op puntkomma, trimt en ontdubbelt', () => {
  const { parseMerktermen } = require('../src/services/merkprofiel');
  assert.deepEqual(parseMerktermen(' the base; Red Room ;;the base '), ['the base', 'Red Room']);
  assert.deepEqual(parseMerktermen(''), []);
  assert.deepEqual(parseMerktermen(null), []);
});

test('bouwKlantTermen leest beide kolommen en koppelt de reden als die er is', () => {
  const { bouwKlantTermen } = require('../src/services/merkprofiel');
  const r = bouwKlantTermen(
    { verboden_termen: 'goedkoop; Gratis ;goedkoop', vaste_termen: 'Basecamp Utrecht' },
    [{ soort: 'verboden', term: 'Goedkoop', reden: 'Past niet bij het merk' }, { soort: 'vast', term: 'basecamp utrecht', reden: ' Eigen schrijfwijze ' }]
  );
  assert.deepEqual(r.verboden, [{ term: 'goedkoop', reden: 'Past niet bij het merk' }, { term: 'Gratis', reden: '' }]);
  assert.deepEqual(r.vast, [{ term: 'Basecamp Utrecht', reden: 'Eigen schrijfwijze' }]);
});

test('bouwKlantTermen geeft lege lijsten bij lege of ontbrekende kolommen', () => {
  const { bouwKlantTermen } = require('../src/services/merkprofiel');
  assert.deepEqual(bouwKlantTermen({ verboden_termen: '', vaste_termen: null }, []), { verboden: [], vast: [] });
  assert.deepEqual(bouwKlantTermen({}, undefined), { verboden: [], vast: [] });
  assert.deepEqual(bouwKlantTermen(null), { verboden: [], vast: [] });
});

test('getKlantTermen gebruikt de redentabel alleen als die is ingesteld en crasht niet bij een fout', async () => {
  const { getKlantTermen } = require('../src/services/merkprofiel');
  const oudeFetch = global.fetch;
  const oudeKey = process.env.N8N_API_KEY;
  const oudeTabel = process.env.N8N_TERMEN_TABLE_ID;
  process.env.N8N_API_KEY = 'test';
  const urls = [];
  const antwoord = (data, ok = true) => ({ ok, status: ok ? 200 : 500, statusText: 'x', text: async () => JSON.stringify(data) });
  try {
    delete process.env.N8N_TERMEN_TABLE_ID;
    global.fetch = async (url) => { urls.push(url); return antwoord({ data: [{ verboden_termen: 'goedkoop', vaste_termen: 'Kamer A' }] }); };
    assert.deepEqual(await getKlantTermen('Klant'), { verboden: [{ term: 'goedkoop', reden: '' }], vast: [{ term: 'Kamer A', reden: '' }] });
    assert.strictEqual(urls.length, 1);

    process.env.N8N_TERMEN_TABLE_ID = 'TERMEN123';
    urls.length = 0;
    global.fetch = async (url) => {
      urls.push(url);
      if (url.includes('TERMEN123')) return antwoord({ data: [{ soort: 'verboden', term: 'goedkoop', reden: 'Klant wil dit niet' }] });
      return antwoord({ data: [{ verboden_termen: 'goedkoop', vaste_termen: '' }] });
    };
    const metReden = await getKlantTermen('Klant');
    assert.strictEqual(metReden.verboden[0].reden, 'Klant wil dit niet');
    assert.ok(urls.some((u) => u.includes('TERMEN123') && u.includes('limit=250')));

    global.fetch = async (url) => (url.includes('TERMEN123') ? antwoord({}, false) : antwoord({ data: [{ verboden_termen: 'goedkoop' }] }));
    assert.deepEqual((await getKlantTermen('Klant')).verboden, [{ term: 'goedkoop', reden: '' }]);

    global.fetch = async () => { throw new Error('netwerk'); };
    assert.deepEqual(await getKlantTermen('Klant'), { verboden: [], vast: [] });
  } finally {
    global.fetch = oudeFetch;
    if (oudeKey === undefined) delete process.env.N8N_API_KEY; else process.env.N8N_API_KEY = oudeKey;
    if (oudeTabel === undefined) delete process.env.N8N_TERMEN_TABLE_ID; else process.env.N8N_TERMEN_TABLE_ID = oudeTabel;
  }
});

test('bouwVerbodenEindlijst telt automatische en handmatige termen, zonder uitgezonderde', () => {
  const { bouwVerbodenEindlijst, termSleutel } = require('../src/services/merkprofiel');
  assert.strictEqual(termSleutel('  Groß-handel! '), 'grosshandel'.replace('grosshandel', 'gross handel'));
  assert.deepEqual(
    bouwVerbodenEindlijst(['neu', 'aktuell', 'Nummer 1'], ['Gratis', 'NEU'], ['aktuell']),
    ['neu', 'Nummer 1', 'Gratis']
  );
  assert.deepEqual(bouwVerbodenEindlijst([], [], []), []);
});

test('wijzigVerbodenTerm voegt toe, zondert uit, zet terug en schrijft de eindlijst mee', async () => {
  const { wijzigVerbodenTerm } = require('../src/services/merkprofiel');
  const oudeFetch = global.fetch;
  const oudeKey = process.env.N8N_API_KEY;
  process.env.N8N_API_KEY = 'test';
  let rij = { client_name: 'Klant', verboden_auto: 'neu; aktuell', verboden_handmatig: null, verboden_uitgezonderd: null, verboden_termen: 'neu; aktuell' };
  const schrijfacties = [];
  const antwoord = (data) => ({ ok: true, status: 200, statusText: 'ok', text: async () => JSON.stringify(data) });
  global.fetch = async (url, opties = {}) => {
    if (String(url).includes('/rows/upsert')) {
      const body = JSON.parse(opties.body);
      schrijfacties.push(body);
      rij = { ...rij, ...body.data };
      return antwoord({});
    }
    return antwoord({ data: [rij] });
  };
  try {
    let r = await wijzigVerbodenTerm('Klant', { actie: 'voeg', term: ' Gratis ' });
    assert.deepEqual(r.verboden, ['neu', 'aktuell', 'Gratis']);
    assert.strictEqual(schrijfacties[0].data.verboden_handmatig, 'Gratis');

    r = await wijzigVerbodenTerm('Klant', { actie: 'verwijder', term: 'aktuell' });
    assert.deepEqual(r.verboden, ['neu', 'Gratis']);
    assert.strictEqual(rij.verboden_uitgezonderd, 'aktuell');

    r = await wijzigVerbodenTerm('Klant', { actie: 'voeg', term: 'Aktuell' });
    assert.deepEqual(r.verboden, ['neu', 'aktuell', 'Gratis']);
    assert.strictEqual(rij.verboden_uitgezonderd, '');
    assert.strictEqual(rij.verboden_handmatig, 'Gratis');

    r = await wijzigVerbodenTerm('Klant', { actie: 'verwijder', term: 'gratis' });
    assert.deepEqual(r.verboden, ['neu', 'aktuell']);
    assert.strictEqual(rij.verboden_handmatig, '');

    await assert.rejects(() => wijzigVerbodenTerm('Klant', { actie: 'voeg', term: 'ab' }), /3 en 40/);
    await assert.rejects(() => wijzigVerbodenTerm('Klant', { actie: 'voeg', term: 'a;b;c' }), /puntkomma/);
    await assert.rejects(() => wijzigVerbodenTerm('Klant', { actie: 'raar', term: 'neu' }), /actie/);
  } finally {
    global.fetch = oudeFetch;
    if (oudeKey === undefined) delete process.env.N8N_API_KEY; else process.env.N8N_API_KEY = oudeKey;
  }
});
