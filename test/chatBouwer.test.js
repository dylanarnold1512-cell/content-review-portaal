const test = require('node:test');
const assert = require('node:assert/strict');
const chat = require('../src/lp/chatBouwer');
const { eigenSjabloonVan, CHAT_BLUEPRINT } = require('../src/lp/eigenSjabloon');
const { validateTemplateStructure, validatePage } = require('../src/lp/validator');
const { zorgVoorGalerijSlot } = require('../src/lp/galerij');
const ai = require('../src/lp/ai');
const { renderPageHtml } = require('../src/lp/render');
const { buildRenderPage } = require('../src/lp/pageRender');

const opties = { validateTemplateStructure, verdeelIconen: ai.verdeelIconen, zorgVoorGalerijSlot };

function blueprint(extraHtml = '') {
  return {
    templateFormat: 'slots',
    htmlTemplate: `<section class="lp-hero"><h1>{{heroTitle}}</h1><p>{{heroIntro}}</p><img src="{{heroImageSrc}}" alt="{{heroImageAlt}}"><a class="lp-cta-button" href="{{ctaHref}}">{{ctaLabel}}</a></section>${extraHtml}<section id="aanvraag"><h2>{{actieTitel}}</h2>{{formulier}}</section>`,
    cssTemplate: '.lpt .lp-hero{padding:40px;}',
    slots: [
      { key: 'heroTitle', type: 'text', verplicht: true },
      { key: 'heroIntro', type: 'text' },
      { key: 'heroImageSrc', type: 'text' },
      { key: 'heroImageAlt', type: 'text' },
      { key: 'ctaLabel', type: 'text', verplicht: true },
      { key: 'ctaHref', type: 'text', verplicht: true },
      { key: 'actieTitel', type: 'text' },
      { key: 'linksItems', type: 'list', verplicht: true, itemFields: ['label', 'href', 'reason'] },
      { key: 'metaTitle', type: 'text', verplicht: true },
      { key: 'metaDescription', type: 'text', verplicht: true }
    ],
    ctaRegel: { verplicht: true },
    linkRegels: { minimumInterneLinks: 2, minimumNaarZusterpaginas: 1, reasonRequired: true },
    seoRegels: { exactEenH1: true, metaTitleMin: 30, metaTitleMax: 65, metaDescriptionMin: 70, metaDescriptionMax: 160 }
  };
}

const slotData = {
  heroTitle: 'Uw aanbouw in de Bollenstreek, van plan tot oplevering',
  heroIntro: 'Vertel ons over uw plannen.',
  heroImageSrc: 'https://verzonnen.nl/foto.jpg',
  ctaLabel: 'Vertel ons over uw plannen',
  ctaHref: '#aanvraag',
  actieTitel: 'Plan uw verbouwing',
  metaTitle: 'Aanbouw in de Bollenstreek laten bouwen door een aannemer',
  metaDescription: 'Meer ruimte in huis? Wij bouwen uw aanbouw in de Bollenstreek en Haarlemmermeer, van eerste idee tot oplevering, in een vaste lijn.'
};

test('bouw: sjabloon zonder verplichte interne links en geen verzonnen foto', () => {
  const uit = chat.verwerkAntwoord({ actie: 'bouw', antwoord: 'Staat klaar.', titel: 'Ads: aanbouw Bollenstreek', blueprint: blueprint(), slotData }, null, opties);
  assert.equal(uit.actie, 'bouw');
  assert.equal(uit.slotData.heroImageSrc, '');
  assert.equal(uit.slug, 'ads-aanbouw-bollenstreek');
  assert.equal(uit.blueprint.linkRegels.minimumInterneLinks, 0);
  assert.equal(uit.blueprint.slots.find((s) => s.key === 'linksItems').verplicht, false);
  const validatie = validatePage({ blueprint: uit.blueprint, contentJson: { meta: { metaTitle: uit.slotData.metaTitle, metaDescription: uit.slotData.metaDescription }, slotData: uit.slotData } });
  assert.deepEqual(validatie.errors, []);
});

test('bouw: al gekozen foto blijft staan bij een nieuwe opbouw', () => {
  const huidig = { blueprint: blueprint(), slotData: { ...slotData, heroImageSrc: 'https://klant.nl/wp-content/uploads/a.jpg', heroImageAlt: 'Aanbouw' } };
  const uit = chat.verwerkAntwoord({ actie: 'bouw', blueprint: blueprint('<section><p>{{extra}}</p></section>'), slotData: { ...slotData, heroImageSrc: '' } }, huidig, opties);
  assert.equal(uit.slotData.heroImageSrc, 'https://klant.nl/wp-content/uploads/a.jpg');
  assert.equal(uit.slotData.heroImageAlt, 'Aanbouw');
});

test('bouw: een sjabloon met een script wordt geweigerd', () => {
  const slecht = blueprint('<script>alert(1)</script>');
  assert.throws(() => chat.verwerkAntwoord({ actie: 'bouw', blueprint: slecht, slotData }, null, opties), (err) => Array.isArray(err.structuurFouten) && err.structuurFouten.length > 0);
});

test('tekst: alleen bekende slots veranderen, ontwerp blijft gelijk', () => {
  const huidig = { blueprint: blueprint(), slotData: { ...slotData, heroImageSrc: 'https://klant.nl/a.jpg' } };
  const uit = chat.verwerkAntwoord({ actie: 'tekst', antwoord: 'Kop aangepast.', slotWijzigingen: { heroTitle: 'Nieuwe kop', onbekend: 'x', heroImageSrc: 'https://verzonnen.nl/b.jpg' } }, huidig, opties);
  assert.equal(uit.actie, 'tekst');
  assert.equal(uit.slotData.heroTitle, 'Nieuwe kop');
  assert.equal(uit.slotData.onbekend, undefined);
  assert.equal(uit.slotData.heroImageSrc, 'https://klant.nl/a.jpg');
  assert.equal(uit.blueprint, huidig.blueprint);
});

test('tekst zonder pagina wordt alleen een antwoord', () => {
  const uit = chat.verwerkAntwoord({ actie: 'tekst', antwoord: 'Welke dienst?', slotWijzigingen: { heroTitle: 'x' } }, null, opties);
  assert.equal(uit.actie, 'geen');
  assert.equal(uit.blueprint, null);
});

test('chatBeurt probeert een keer opnieuw als het sjabloon geweigerd wordt', async () => {
  const antwoorden = [
    { actie: 'bouw', blueprint: blueprint('<script>x</script>'), slotData },
    { actie: 'bouw', antwoord: 'Gerepareerd.', blueprint: blueprint(), slotData }
  ];
  const prompts = [];
  const deps = {
    ai: { ...ai, formatKlantSiteVoorPrompt: async () => '', formatKlantBronnenVoorSjabloon: async () => '', formatBrandingForPrompt: () => 'huisstijl' },
    callOpenAi: async ({ userPrompt }) => { prompts.push(userPrompt); return antwoorden.shift(); },
    validateTemplateStructure,
    verdeelIconen: ai.verdeelIconen,
    zorgVoorGalerijSlot
  };
  const client = { profile: { naam: 'MAC Bouw', formulier: { shortcode: '[contact-form-7 id="1"]' }, bedrijf: { naam: 'MAC Bouw' } }, feiten: [{ label: 'Werkgebied', waarde: 'Hillegom' }] };
  const uit = await chat.chatBeurt({ klant: 'macbouw', client, huidig: null, berichten: [], bericht: 'Maak een Ads pagina voor aanbouw', deps });
  assert.equal(uit.antwoord, 'Gerepareerd.');
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /Werkgebied: Hillegom/);
  assert.match(prompts[1], /geweigerd/);
});

test('systeemprompt noemt het formulier alleen als de klant er een heeft', () => {
  const met = chat.bouwSysteemPrompt({ heeftPagina: false, heeftFormulier: true, deps: { ai } });
  const zonder = chat.bouwSysteemPrompt({ heeftPagina: false, heeftFormulier: false, deps: { ai } });
  assert.match(met, /het formulier van de klant \(\{\{formulier\}\}/);
  assert.match(zonder, /nog geen formulier/);
});

test('berichten worden begrensd', () => {
  const veel = Array.from({ length: 70 }, (_, i) => ({ rol: 'dylan', tekst: String(i) }));
  const uit = chat.voegBerichtenToe(veel, { rol: 'ai', tekst: 'laatste' });
  assert.equal(uit.length, chat.MAX_BERICHTEN_BEWAARD);
  assert.equal(uit[uit.length - 1].tekst, 'laatste');
});

test('eigen sjabloon van een chatpagina wordt gebruikt en rendert voor WordPress', () => {
  const page = { id: 'p1', klant: 'macbouw', blueprint: CHAT_BLUEPRINT, titel: 'Test', slug: 'test', sjabloon: { blueprint: blueprint(), berichten: [] }, content: { slotData } };
  const bp = eigenSjabloonVan(page);
  assert.ok(bp);
  assert.equal(bp.clientId, 'macbouw');
  const html = renderPageHtml(buildRenderPage({ blueprint: bp, content: page.content, clientId: 'macbouw', slug: 'test', invoer: {} }), { forWordPress: true });
  assert.match(html, /contact-form-7/);
  assert.equal(eigenSjabloonVan({ blueprint: 'festivals', sjabloon: null }), null);
});

test('systeemprompt bevat campagnekennis, en de campagnestart alleen bij een nieuwe pagina', () => {
  const nieuw = chat.bouwSysteemPrompt({ heeftPagina: false, heeftFormulier: true, deps: { ai } });
  const bestaand = chat.bouwSysteemPrompt({ heeftPagina: true, heeftFormulier: true, deps: { ai } });
  assert.match(nieuw, /Aansluiting op de advertentie/);
  assert.match(nieuw, /CAMPAGNESTART/);
  assert.match(nieuw, /kopAlternatief/);
  assert.match(bestaand, /Aansluiting op de advertentie/);
  assert.doesNotMatch(bestaand, /CAMPAGNESTART/);
});

test('kopAlternatief komt in het antwoord en onthoud wordt schoongemaakt', () => {
  const uit = chat.verwerkAntwoord({ actie: 'bouw', antwoord: 'Staat klaar.', blueprint: blueprint(), slotData, kopAlternatief: 'Meer ruimte in huis, zonder gedoe', onthoud: ['  Doel is altijd een offerte ', '', 'Noem nooit prijzen'] }, null, opties);
  assert.match(uit.antwoord, /Alternatieve kop om te testen: Meer ruimte in huis, zonder gedoe/);
  assert.deepEqual(uit.onthoud, ['Doel is altijd een offerte', 'Noem nooit prijzen']);
  const geen = chat.verwerkAntwoord({ actie: 'geen', antwoord: 'Welk kanaal?', kopAlternatief: 'x' }, null, opties);
  assert.doesNotMatch(geen.antwoord, /Alternatieve kop/);
  assert.deepEqual(geen.onthoud, []);
});

test('vaste voorkeuren van de klant gaan mee in de prompt en worden zonder dubbelen bijgehouden', async () => {
  const { voegVoorkeurenToe, bouwCampagneVoorkeurenBlok } = require('../src/lp/campagneKennis');
  assert.deepEqual(voegVoorkeurenToe(['Doel is offerte'], ['doel is OFFERTE', 'Geen prijzen']), ['Doel is offerte', 'Geen prijzen']);
  assert.equal(bouwCampagneVoorkeurenBlok([]), '');
  const prompts = [];
  const deps = {
    ai: { ...ai, formatKlantSiteVoorPrompt: async () => '', formatKlantBronnenVoorSjabloon: async () => '', formatBrandingForPrompt: () => 'huisstijl' },
    callOpenAi: async ({ userPrompt }) => { prompts.push(userPrompt); return { actie: 'geen', antwoord: 'Ok.' }; },
    validateTemplateStructure, verdeelIconen: ai.verdeelIconen, zorgVoorGalerijSlot
  };
  const client = { profile: { naam: 'MAC Bouw', campagneVoorkeuren: ['Doel is altijd een offerte'] }, feiten: [] };
  await chat.chatBeurt({ klant: 'macbouw', client, huidig: null, berichten: [], bericht: 'Hoi', deps });
  assert.match(prompts[0], /VASTE VOORKEUREN VAN DYLAN/);
  assert.match(prompts[0], /Doel is altijd een offerte/);
});
