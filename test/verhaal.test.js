const test = require('node:test');
const assert = require('node:assert');
const v = require('../src/lp/verhaal');
const ai = require('../src/lp/ai');

const SJABLOON = {
  htmlTemplate: '<h1>{{heroTitle}}</h1><p>{{heroIntro}}</p>{{#each offerItems}}{{title}}{{/each}}{{#each uspItems}}{{title}}{{/each}}{{#each stepsItems}}{{title}}{{/each}}{{#each reviewItems}}{{text}}{{/each}}{{#each faqItems}}{{question}}{{/each}}{{formulier}}',
  slots: [
    { key: 'heroTitle', type: 'text' }, { key: 'heroIntro', type: 'text' },
    { key: 'stepsItems', type: 'list', label: 'Werkwijze', itemFields: ['title', 'text'] },
    { key: 'offerItems', type: 'list', label: 'Aanbod', itemFields: ['title', 'text', 'imageSrc'] },
    { key: 'uspItems', type: 'list', label: 'Waarom', itemFields: ['title', 'text'] },
    { key: 'reviewItems', type: 'list', label: 'Reviews', itemFields: ['name', 'text'] },
    { key: 'faqItems', type: 'list', label: 'Vragen', itemFields: ['question', 'answer'] },
    { key: 'ctaLabel', type: 'text' }, { key: 'ctaHref', type: 'text' },
    { key: 'metaTitle', type: 'text' }
  ]
};

const GOED = {
  heroTitle: 'Dakkapel laten plaatsen in Hillegom',
  heroIntro: 'Wij helpen woningeigenaren in Hillegom met een dakkapel. We luisteren naar je plannen en denken praktisch mee.',
  uspItems: [
    { title: 'Een vast aanspreekpunt', text: 'Je belt altijd met dezelfde persoon, zodat je niet steeds opnieuw hoeft uit te leggen wat je wilt.' },
    { title: 'Heldere afspraken vooraf', text: 'Voor we beginnen weet je wat het kost en wanneer we komen.' }
  ],
  faqItems: [{ question: 'Heb ik een vergunning nodig?', answer: 'Vaak niet, maar dat hangt af van de plek aan de straatzijde. Wij zoeken het voor je uit.' }]
};

test('verhaalSecties zet de onderdelen in de volgorde van de pagina en geeft elk een rol', () => {
  const secties = v.verhaalSecties(SJABLOON);
  assert.deepStrictEqual(secties.map((s) => s.rol), ['hero', 'aanbod', 'waarom', 'werkwijze', 'bewijs', 'twijfels', 'actie']);
  assert.strictEqual(v.slotRol({ key: 'x', rol: 'bewijs' }), 'bewijs');
  assert.strictEqual(v.slotRol({ key: 'heroImageSrc' }), 'overig');
});

test('sjabloonRolWaarschuwingen waarschuwt voor een sjabloon zonder bewijs en met de werkwijze voor het aanbod', () => {
  const zonderBewijs = { htmlTemplate: '{{heroTitle}}{{#each stepsItems}}{{t}}{{/each}}{{#each offerItems}}{{t}}{{/each}}{{#each faqItems}}{{q}}{{/each}}{{ctaLabel}}', slots: [{ key: 'heroTitle' }, { key: 'stepsItems', type: 'list' }, { key: 'offerItems', type: 'list' }, { key: 'faqItems', type: 'list' }, { key: 'ctaLabel' }] };
  const w = v.sjabloonRolWaarschuwingen(zonderBewijs);
  assert.ok(w.some((t) => /bewijs/.test(t)));
  assert.ok(w.some((t) => /werkwijze .* voor het aanbod/.test(t)));
  assert.deepStrictEqual(v.sjabloonRolWaarschuwingen({ htmlTemplate: '{{heroTitle}}', slots: [{ key: 'heroTitle' }] }), []);
});

test('redactieControle geeft geen punten bij een persoonlijke pagina zonder herhaling', () => {
  assert.deepStrictEqual(v.redactieControle(GOED, { bedrijfsnaam: 'MAC Bouw', aanspreekvorm: 'je' }), []);
});

test('redactieControle vindt dezelfde zin op twee plekken en dezelfde boodschap in veel onderdelen', () => {
  const slechts = {
    heroTitle: 'Prefab dakkapel plaatsen',
    heroIntro: 'Wij bereiden alles voor in de werkplaats, zodat uw dakkapel vaak binnen een dag wind en waterdicht staat.',
    uspItems: [
      { title: 'Snel klaar', text: 'Uw dakkapel staat vaak binnen een dag wind en waterdicht op het dak.' },
      { title: 'Weinig overlast', text: 'Omdat het werk wind waterdicht wordt opgeleverd merkt u weinig van de verbouwing.' },
      { title: 'Zekerheid', text: 'Een wind waterdicht resultaat betekent dat u zich geen zorgen hoeft te maken over regen.' }
    ],
    stepsItems: [{ title: 'Plaatsing', text: 'De wind waterdicht geplaatste dakkapel is binnen een dag klaar.' }],
    faqItems: [{ question: 'Hoe snel?', answer: 'Vaak binnen een dag wind en waterdicht, daarna werken we netjes af.' }]
  };
  const punten = v.redactieControle(slechts, { aanspreekvorm: 'u' });
  assert.ok(punten.some((p) => p.soort === 'herhaling' && /Dezelfde zin/.test(p.tekst)));
  assert.ok(punten.some((p) => p.soort === 'herhaling' && /komt in \d+ onderdelen terug/.test(p.tekst)));
  const zin = punten.find((p) => /Dezelfde zin/.test(p.tekst));
  assert.ok(zin.slots.length >= 2);
});

test('redactieControle meldt wisselen tussen je en u, een te vaak genoemde bedrijfsnaam en lege woorden', () => {
  const data = {
    heroTitle: 'Verbouwen in Haarlem',
    heroIntro: 'MAC Bouw helpt u met verbouwen. MAC Bouw levert hoogwaardige kwaliteit en excellentie.',
    uspItems: [
      { title: 'Een', text: 'Bij MAC Bouw krijgt je altijd een vast aanspreekpunt dat met je meedenkt over de planning.' },
      { title: 'Twee', text: 'U weet vooraf wat het kost en uw wensen staan voorop.' }
    ],
    faqItems: [{ question: 'Kosten?', answer: 'Dat bespreken we samen met je voor we beginnen met het werk.' }]
  };
  const punten = v.redactieControle(data, { bedrijfsnaam: 'MAC Bouw', aanspreekvorm: 'je' });
  assert.ok(punten.some((p) => /wisselt tussen/.test(p.tekst)));
  assert.ok(punten.some((p) => /bedrijfsnaam staat \d+ keer/.test(p.tekst)));
  assert.ok(punten.some((p) => p.soort === 'vulwoorden' && /hoogwaardig/.test(p.tekst)));
});

test('redactieControle herkent een claim uit "niet gebruiken" en een afstandelijke intro', () => {
  const data = {
    heroTitle: 'Aannemer in Haarlem',
    heroIntro: 'Het bedrijf voert verbouwingen uit voor particuliere opdrachtgevers.',
    uspItems: [{ title: 'Ervaring', text: 'We hebben met succes talloze projecten afgerond in de regio.' }, { title: 'Twee', text: 'Je krijgt een vaste contactpersoon tijdens het werk.' }],
    faqItems: [{ question: 'Hoe lang?', answer: 'Dat hangt af van de grootte van het werk en de planning.' }]
  };
  const punten = v.redactieControle(data, { nietGebruiken: [{ tekst: 'We hebben met succes talloze projecten afgerond', reden: 'niet te bewijzen' }] });
  assert.ok(punten.some((p) => p.soort === 'claim'));
  assert.ok(punten.some((p) => /intro bovenaan klinkt afstandelijk/.test(p.tekst)));
});

test('ontbrekendBewijs meldt een leeg reviewonderdeel', () => {
  const punten = v.ontbrekendBewijs(SJABLOON, { reviewItems: [] }, { status: 'goedgekeurd', bewijs: [{ tekst: 'x' }] });
  assert.strictEqual(punten.length, 1);
  assert.deepStrictEqual(punten[0].slots, ['reviewItems']);
  assert.deepStrictEqual(v.ontbrekendBewijs(SJABLOON, { reviewItems: [{ name: 'a', text: 'b' }] }, null), []);
});

test('schoonPlan houdt alleen bestaande slots en bouwSchrijfplanBlok noemt de verdeling', () => {
  const plan = ai.schoonPlan({
    leidraad: 'De bezoeker wil een offerte aanvragen.',
    secties: [
      { rol: 'hero', slots: ['heroTitle', 'bestaatNiet'], kernboodschap: 'Herkenning.', gebruik: ['vaste contactpersoon'], nietHier: ['kosten'] },
      { rol: 'waarom', slots: ['nietEcht'], kernboodschap: 'x' }
    ],
    verdeling: [{ punt: 'vaste contactpersoon', uitgebreid: 'uspItems', kort: 'heroIntro' }]
  }, SJABLOON);
  assert.strictEqual(plan.secties.length, 1);
  assert.deepStrictEqual(plan.secties[0].slots, ['heroTitle']);
  const blok = ai.bouwSchrijfplanBlok(plan);
  assert.match(blok, /SCHRIJFPLAN/);
  assert.match(blok, /vaste contactpersoon: uitgebreid bij uspItems, kort bij heroIntro/);
  assert.strictEqual(ai.bouwSchrijfplanBlok(null), '');
});

function mockOpenAi(antwoorden) {
  const echt = global.fetch;
  const aanroepen = [];
  process.env.OPENAI_API_KEY = 'test';
  global.fetch = async (url, opts) => {
    aanroepen.push(JSON.parse(opts.body));
    const a = antwoorden.shift();
    if (a instanceof Error) return { ok: false, status: 500, text: async () => a.message, clone() { return this; } };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(a) } }] }) };
  };
  return { aanroepen, herstel: () => { global.fetch = echt; } };
}

test('generatePageContent maakt eerst een plan en schrijft dan de tekst met het plan in de prompt', async () => {
  const m = mockOpenAi([
    { leidraad: 'Aanvragen.', secties: [{ rol: 'hero', slots: ['heroTitle', 'heroIntro'], kernboodschap: 'Persoonlijke opening.' }], verdeling: [] },
    { slotData: { heroTitle: 'Titel', heroIntro: 'Wij helpen je graag.' } }
  ]);
  try {
    const r = await ai.generatePageContent({ klant: 'Test', template: SJABLOON, invoer: {}, feiten: [], linkKandidaten: [] });
    assert.strictEqual(m.aanroepen.length, 2);
    assert.match(m.aanroepen[1].messages[1].content, /SCHRIJFPLAN/);
    assert.match(m.aanroepen[1].messages[1].content, /Persoonlijke opening/);
    assert.ok(r.schrijfplan && r.schrijfplan.secties.length === 1);
    assert.strictEqual(r.slotData.heroTitle, 'Titel');
  } finally { m.herstel(); }
});

test('generatePageContent schrijft ook zonder plan als ronde 1 mislukt', async () => {
  const m = mockOpenAi([new Error('plan stuk'), { slotData: { heroTitle: 'Titel', heroIntro: 'Wij helpen je.' } }]);
  try {
    const r = await ai.generatePageContent({ klant: 'Test', template: SJABLOON, invoer: {}, feiten: [], linkKandidaten: [] });
    assert.strictEqual(r.slotData.heroTitle, 'Titel');
    assert.strictEqual(r.schrijfplan, null);
    assert.match(r.planWaarschuwing, /zonder plan/);
  } finally { m.herstel(); }
});

test('herschrijfOnderdelen verandert alleen de gevraagde slots en houdt afbeeldingen en andere tekst', async () => {
  const slotData = {
    heroTitle: 'Titel', heroIntro: 'Oud.',
    offerItems: [{ title: 'A', text: 'oud a', imageSrc: '/a.jpg' }, { title: 'B', text: 'oud b', imageSrc: '/b.jpg' }],
    uspItems: [{ title: 'U', text: 'blijft' }]
  };
  const m = mockOpenAi([{ slotData: { offerItems: [{ title: 'A2', text: 'nieuw a [link](https://verzonnen.nl)' }, { title: 'B2', text: 'nieuw b' }], uspItems: [{ title: 'mag niet', text: 'x' }] } }]);
  try {
    const r = await ai.herschrijfOnderdelen({ klant: 'Test', template: SJABLOON, slotData, slots: ['offerItems'], aanwijzing: 'Persoonlijker.' });
    assert.deepStrictEqual(r.gewijzigd, ['offerItems']);
    assert.strictEqual(r.slotData.offerItems[0].title, 'A2');
    assert.strictEqual(r.slotData.offerItems[0].imageSrc, '/a.jpg');
    assert.strictEqual(r.slotData.offerItems[1].imageSrc, '/b.jpg');
    assert.doesNotMatch(r.slotData.offerItems[0].text, /verzonnen\.nl/);
    assert.deepStrictEqual(r.slotData.uspItems, slotData.uspItems);
    assert.strictEqual(r.slotData.heroIntro, 'Oud.');
    await assert.rejects(() => ai.herschrijfOnderdelen({ klant: 'Test', template: SJABLOON, slotData, slots: ['ctaHref', 'metaTitle'] }), /geen onderdeel/);
  } finally { m.herstel(); }
});

test('redactieReview houdt maximaal vijf punten met bestaande slots', async () => {
  const slotData = { ...GOED };
  const punt = (slot) => ({ slots: [slot], probleem: 'Klinkt afstandelijk.', aanwijzing: 'Schrijf persoonlijker.' });
  const m = mockOpenAi([{ verbeteringen: [punt('heroIntro'), punt('bestaatNiet'), punt('uspItems'), punt('faqItems'), punt('heroTitle'), punt('heroIntro'), punt('uspItems')] }]);
  try {
    const punten = await ai.redactieReview({ klant: 'Test', template: SJABLOON, slotData, alGevonden: [] });
    assert.ok(punten.length <= 5);
    assert.ok(punten.every((p) => !p.slots.includes('bestaatNiet')));
    assert.ok(punten.length >= 1);
  } finally { m.herstel(); }
});

test('redactiecontrole: te lang fotolabel, ervaring in de projectintro en ja/nee antwoordblok', () => {
  const punten = v.redactieControle({
    heroTitle: 'Verbouw in Bennebroek',
    heroIntro: 'Wil je verbouwen? Wij helpen je met je plannen.',
    heroBadgeTitle: 'Sinds 2012',
    heroBadgeText: 'Mitchell is eigenaar, opgeleid tot allround timmerman en heeft de KOB-opleiding afgerond.',
    answerTitle: 'Kun je je woning in Bloemendaal laten verbouwen?',
    locationAnswer: 'Ja. Voor je woning kun je bij ons terecht.',
    projectsIntro: 'Mitchell heeft meer dan 20 jaar ervaring in de bouwsector.',
    projectsTitle: 'Project'
  }, { bedrijfsnaam: 'MAC Bouw' });
  assert.ok(punten.some((p) => p.soort === 'lengte' && p.slots.includes('heroBadgeText')));
  assert.ok(punten.some((p) => p.slots.includes('projectsIntro')));
  assert.ok(punten.some((p) => p.slots.includes('answerTitle') || p.slots.includes('locationAnswer')));
});
