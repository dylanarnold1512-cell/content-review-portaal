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

// ---- Huisstijl (stap 11) ----
const { clientTokens, defaultTokens, getTokens } = require('../src/lp/tokens');

test('huisstijl: geldige waarden worden opgeschoond, ongeldige geweigerd', () => {
  const h = kg.schoonHuisstijl({ primary: '#0f5257', radius: '8PX', headingTransform: 'Uppercase', headingWeight: '600', fontHeading: "'Poppins', sans-serif", googleFonts: 'Poppins, Open Sans' });
  assert.deepStrictEqual(h, { primary: '#0F5257', radius: '8px', headingTransform: 'uppercase', headingWeight: '600', fontHeading: "'Poppins', sans-serif", googleFonts: ['Poppins', 'Open Sans'] });
  assert.throws(() => kg.schoonHuisstijl({ primary: 'rood' }), /kleurcode/);
  assert.throws(() => kg.schoonHuisstijl({ radius: 'veel' }), /maat/);
  assert.throws(() => kg.schoonHuisstijl({ fontBody: 'a;}body{display:none' }), /lettertype/);
  assert.throws(() => kg.schoonHuisstijl({ googleFonts: ['x"><script>'] }), /Google Font/);
  assert.deepStrictEqual(kg.schoonHuisstijl({ primary: '', fontHeading: '' }), {}, 'leeg betekent geen eigen keuze');
});

test('huisstijl: velden buiten de lijst (eigen lettertypen, extra CSS) komen nooit uit Notion', () => {
  const h = kg.schoonHuisstijl({ themeOverrideCss: 'body{display:none}', customFonts: [{ family: 'X' }], googleFontGewichten: { a: 1 }, sfeer: 'x', primary: '#111111' });
  assert.deepStrictEqual(h, { primary: '#111111' });
});

test('huisstijl: een AI voorstel laat ongeldige waarden weg in plaats van te falen', () => {
  const h = kg.huisstijlUitVoorstel({ primary: 'rgb(1,2,3)', secondary: '#abcdef', radius: '10px', onbekend: 'x', themeOverrideCss: 'x' });
  assert.deepStrictEqual(h, { secondary: '#ABCDEF', radius: '10px' });
});

test('huisstijl: alleen het verschil met code of standaard wordt bewaard', () => {
  assert.deepStrictEqual(kg.alleenVerschil({ primary: defaultTokens.primary, secondary: '#123456' }, 'nieuweklant'), { secondary: '#123456' });
  assert.deepStrictEqual(kg.alleenVerschil({ primary: clientTokens.roots.primary, ctaBg: '#000000' }, 'roots'), { ctaBg: '#000000' });
});

test('huisstijl uit Notion komt over de tokens in code, de rest blijft', () => {
  const eigenFonts = clientTokens.roots.customFonts;
  kg._zetNotionData(new Map([['roots', { pageId: 'r', profiel: { naam: 'Hostel Roots', huisstijl: { primary: '#123456' } }, feiten: undefined }]]));
  kg.pasToe();
  assert.strictEqual(getTokens('roots').primary, '#123456');
  assert.strictEqual(getTokens('roots').secondary, '#8BD7FD', 'ongewijzigde velden blijven uit de code');
  assert.deepStrictEqual(getTokens('roots').customFonts, eigenFonts, 'eigen lettertypebestanden blijven uit de code');
  kg._zetNotionData(new Map());
  kg.pasToe();
  assert.strictEqual(getTokens('roots').primary, '#F9D634', 'zonder rij geldt weer de code');
});

test('huisstijl: een klant alleen in Notion krijgt de standaard met zijn eigen kleuren, en verdwijnt weer', () => {
  kg._zetNotionData(new Map([['jansen', { pageId: 'p', profiel: { naam: 'Jansen', huisstijl: { primary: '#222222' } }, feiten: [] }]]));
  kg.pasToe();
  assert.strictEqual(getTokens('jansen').primary, '#222222');
  assert.strictEqual(getTokens('jansen').bg, defaultTokens.bg);
  kg._zetNotionData(new Map());
  kg.pasToe();
  assert.strictEqual(getTokens('jansen'), defaultTokens);
});

test('huisstijl: bewaar schrijft alleen het verschil en past direct toe', async () => {
  await kg.bewaar('macbouw', { profiel: { naam: 'MAC Bouw', huisstijl: { ...kg.bewerkbaar('macbouw').profiel.huisstijl, ctaBg: '#010203' } }, feiten: [] });
  const append = aanroepen.filter((a) => a[0] === 'append').pop()[1];
  const profielJson = JSON.parse(append.children[1].code.rich_text.map((t) => t.text.content).join(''));
  assert.deepStrictEqual(profielJson.huisstijl, { ctaBg: '#010203' });
  assert.strictEqual(getTokens('macbouw').ctaBg, '#010203');
});

test('huisstijl: bewaar zonder huisstijlveld laat een bestaande huisstijl staan', async () => {
  kg._zetNotionData(new Map([['macbouw', { pageId: 'pagina-1', profiel: { naam: 'MAC Bouw', huisstijl: { secondary: '#999999' } }, feiten: undefined }]]));
  kg.pasToe();
  await kg.bewaar('macbouw', { profiel: { naam: 'MAC Bouw' }, feiten: [] });
  assert.strictEqual(getTokens('macbouw').secondary, '#999999');
});

test('huisstijl: bewerkbaar geeft de huidige waarden, waarschuwingen en eigen lettertypen', () => {
  const k = kg.bewerkbaar('roots');
  assert.strictEqual(k.profiel.huisstijl.primary, '#F9D634');
  assert.strictEqual(k.huisstijlVanCode, true);
  assert.ok(Array.isArray(k.waarschuwingen));
  assert.ok(k.eigenLettertypenInCode.length >= 1, 'Yikes staat als eigen lettertype in de code');
});
