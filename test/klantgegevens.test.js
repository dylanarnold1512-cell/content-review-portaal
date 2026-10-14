const test = require('node:test');
const assert = require('node:assert');

// Nep Notion client, zodat bewaar() zonder netwerk getest kan worden. Moet voor het laden van de service staan.
const aanroepen = [];
const blokken = {};
class NepClient {
  constructor() {
    this.pages = {
      create: async (a) => { aanroepen.push(['create', a]); return { id: 'pagina-1' }; },
      update: async (a) => { aanroepen.push(['update', a]); return {}; }
    };
    this.blocks = {
      delete: async (a) => { aanroepen.push(['delete', a.block_id]); },
      children: {
        list: async ({ block_id }) => ({ results: blokken[block_id] || [], has_more: false }),
        append: async (a) => { aanroepen.push(['append', a]); return {}; }
      }
    };
    this.databases = { query: async () => ({ results: [], has_more: false }) };
  }
}
require.cache[require.resolve('@notionhq/client')] = { id: 'x', filename: 'x', loaded: true, exports: { Client: NepClient } };
process.env.NOTION_TOKEN_ADMIN = 'test';

const kg = require('../src/lp/klantgegevens');
const { clients } = require('../src/lp/clients');

test.beforeEach(() => { aanroepen.length = 0; kg._zetNotionData(new Map()); kg.pasToe(); });

test('zonder Notion geldt de code', () => {
  assert.ok(clients.macbouw.feiten.length > 5);
  assert.strictEqual(clients.macbouw.profile.naam, 'MAC Bouw');
});

test('een feit zonder bron wordt geweigerd', () => {
  assert.throws(() => kg.schoonFeiten([{ label: 'Adres', waarde: 'Straat 1' }]), /bron/);
});

test('een feit zonder naam of waarde wordt geweigerd, een lege regel wordt genegeerd', () => {
  assert.throws(() => kg.schoonFeiten([{ label: '', waarde: 'x', bron: 'y' }]), /naam en een waarde/);
  assert.deepStrictEqual(kg.schoonFeiten([{ label: '', waarde: '', bron: '' }]), []);
});

test('feiten krijgen unieke id\'s en behouden standaard', () => {
  const f = kg.schoonFeiten([
    { label: 'Adres', waarde: 'a', bron: 'b', standaard: true },
    { label: 'Adres', waarde: 'c', bron: 'd' }
  ]);
  assert.deepStrictEqual(f.map((x) => x.id), ['adres', 'adres-2']);
  assert.strictEqual(f[0].standaard, true);
  assert.strictEqual(f[1].standaard, undefined);
});

test('Notion vult de bewerkbare velden van een klant uit code, het technische deel blijft', () => {
  kg._zetNotionData(new Map([['macbouw', {
    pageId: 'p',
    profiel: { naam: 'MAC Bouw BV', toonNotitie: 'Nieuw', bedrijf: { telefoon: '+31 1', url: '', adres: { plaats: 'Lisse', straat: '', postcode: '', land: '' } } },
    feiten: [{ id: 'enkel', label: 'Enkel', waarde: 'w', bron: 'b' }]
  }]]));
  kg.pasToe();
  const c = clients.macbouw;
  assert.strictEqual(c.profile.naam, 'MAC Bouw BV');
  assert.strictEqual(c.profile.toonNotitie, 'Nieuw');
  assert.strictEqual(c.profile.bedrijf.telefoon, '+31 1');
  assert.strictEqual(c.profile.bedrijf.url, 'https://mac-bouw.nl', 'een leeg veld in Notion maakt de code niet leeg');
  assert.strictEqual(c.profile.bedrijf.adres.plaats, 'Lisse');
  assert.strictEqual(c.profile.bedrijf.adres.straat, 'Marconistraat 31A');
  assert.strictEqual(c.profile.wordpress.urlEnv, 'WP_URL_MACBOUW');
  assert.ok(c.profile.formulier.shortcode);
  assert.strictEqual(c.profile.tokensId, 'macbouw');
  assert.deepStrictEqual(c.feiten.map((f) => f.id), ['enkel']);
});

test('het gedeelde clients object blijft dezelfde verwijzing', () => {
  const voor = clients;
  kg._zetNotionData(new Map([['nieuwebv', { pageId: 'p', profiel: { naam: 'Nieuwe BV' }, feiten: [] }]]));
  kg.pasToe();
  assert.strictEqual(require('../src/lp/clients').clients, voor);
  assert.strictEqual(voor.nieuwebv.profile.naam, 'Nieuwe BV');
});

test('een klant alleen in Notion krijgt standaard WordPress variabelen en tokens', () => {
  kg._zetNotionData(new Map([['jansen', { pageId: 'p', profiel: { naam: 'Jansen' }, feiten: [] }]]));
  kg.pasToe();
  const c = require('../src/lp/clients').getLpClient('jansen');
  assert.strictEqual(c.profile.wordpress.urlEnv, 'WP_URL_JANSEN');
  assert.strictEqual(c.profile.wordpress.appPasswordEnv, 'WP_APP_PASSWORD_JANSEN');
  assert.strictEqual(c.profile.tokensId, 'jansen');
  assert.strictEqual(c.profile.taal, 'nl');
});

test('verdwijnt de rij uit Notion, dan gaat de klant terug naar de code of weg', () => {
  kg._zetNotionData(new Map([['jansen', { pageId: 'p', profiel: { naam: 'Jansen' }, feiten: [] }], ['roots', { pageId: 'r', profiel: { naam: 'Anders' }, feiten: [] }]]));
  kg.pasToe();
  assert.ok(clients.jansen);
  assert.strictEqual(clients.roots.profile.naam, 'Anders');
  kg._zetNotionData(new Map());
  kg.pasToe();
  assert.strictEqual(clients.jansen, undefined);
  assert.strictEqual(clients.roots.profile.naam, 'Hostel Roots');
});

test('bewaar maakt een nieuwe rij met twee JSON blokken en past direct toe', async () => {
  const k = await kg.bewaar('Jansen Dak', {
    nieuw: true,
    profiel: { naam: 'Jansen Dakwerken', bedrijf: { url: 'jansendak.nl', werkgebied: ['Utrecht'] } },
    feiten: [{ label: 'Telefoon', waarde: '030', bron: 'website', standaard: true }]
  });
  assert.strictEqual(k.id, 'jansendak');
  assert.strictEqual(k.profiel.bedrijf.url, 'https://jansendak.nl');
  const create = aanroepen.find((a) => a[0] === 'create')[1];
  assert.strictEqual(create.properties['Klant ID'].title[0].text.content, 'jansendak');
  assert.strictEqual(create.properties['Aantal feiten'].number, 1);
  const append = aanroepen.find((a) => a[0] === 'append')[1];
  assert.deepStrictEqual(append.children.map((b) => b.type), ['heading_2', 'code', 'heading_2', 'code']);
  assert.ok(clients.jansendak);
  assert.strictEqual(clients.jansendak.feiten[0].id, 'telefoon');
});

test('bewaar bij een bestaande klant werkt de rij bij en vervangt de inhoud', async () => {
  await kg.bewaar('macbouw', { profiel: { naam: 'MAC Bouw' }, feiten: [{ label: 'Een', waarde: 'w', bron: 'b' }] });
  assert.ok(aanroepen.some((a) => a[0] === 'create'), 'eerste keer maakt de rij');
  aanroepen.length = 0;
  blokken['pagina-1'] = [{ id: 'oud1' }, { id: 'oud2' }];
  await kg.bewaar('macbouw', { profiel: { naam: 'MAC Bouw' }, feiten: [{ label: 'Twee', waarde: 'w', bron: 'b' }] });
  assert.ok(aanroepen.some((a) => a[0] === 'update'));
  assert.deepStrictEqual(aanroepen.filter((a) => a[0] === 'delete').map((a) => a[1]), ['oud1', 'oud2']);
  assert.deepStrictEqual(clients.macbouw.feiten.map((f) => f.id), ['twee']);
});

test('bewaar weigert een bestaande klant als nieuw, een onbekende klant en een lege naam', async () => {
  await assert.rejects(() => kg.bewaar('macbouw', { nieuw: true, profiel: { naam: 'x' }, feiten: [] }), /bestaat al/);
  await assert.rejects(() => kg.bewaar('bestaatniet', { profiel: { naam: 'x' }, feiten: [] }), /Onbekende klant/);
  await assert.rejects(() => kg.bewaar('nieuwx', { nieuw: true, profiel: { naam: '' }, feiten: [] }), /naam/);
  assert.strictEqual(aanroepen.length, 0, 'bij een fout wordt er niets in Notion geschreven');
});
