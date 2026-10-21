const test = require('node:test');
const assert = require('node:assert');
const ai = require('../src/lp/ai');
const kv = require('../src/lp/klantverhaal');

const goedgekeurd = {
  status: 'goedgekeurd',
  stem: { aanspreekvorm: 'je', kenmerken: ['praktisch'], voorbeeldzinnen: [{ tekst: 'Wij denken met je mee.' }] },
  gezicht: { naam: 'Nick Hirs', rol: 'eigenaar', tekst: 'Installateur sinds 2010' },
  waaromKiezen: [{ punt: 'Duidelijk' }]
};

test('derde persoon: geen enkele regel schrijft wij of noemt de eigenaar voor', () => {
  const opbouw = kv.paginaOpbouwRegels({ derde: true });
  assert.ok(!/in "wij"|wat jullie|wat we voor je doen|waarom bij ons|letterlijk als citaat met naam/.test(opbouw));
  const blok = kv.bouwKlantverhaalBlok(goedgekeurd, { bedrijfsnaam: 'Hirs Installaties', derde: true });
  assert.ok(!/GEZICHT|Nick Hirs/.test(blok));
  assert.ok(!/praat als bedrijf over jezelf met "wij"/.test(blok));
  assert.ok(/derde persoon/.test(blok));
});

test('wij-vorm blijft ongewijzigd voor andere klanten', () => {
  const opbouw = kv.paginaOpbouwRegels({ derde: false });
  assert.ok(/in "wij" wat jullie/.test(opbouw));
  const blok = kv.bouwKlantverhaalBlok(goedgekeurd, { bedrijfsnaam: 'X', derde: false });
  assert.ok(/GEZICHT/.test(blok) && /"wij" of "we"/.test(blok));
});

test('contentprompt volgt de gekozen stem', () => {
  const t = { slots: [{ key: 'heroTitle', type: 'text' }] };
  assert.ok(/derde persoon/.test(ai.buildContentSystemPrompt(t, { derde: true })));
  assert.ok(/in "wij" wat jullie/.test(ai.buildContentSystemPrompt(t, {})));
});

const { tekstControle } = require('../src/lp/tekstcontrole');
const pf = require('../src/lp/projectFotos');

test('derde persoon: bedrijfsnaam moet het onderwerp zijn, lege FAQ wordt aangewezen', () => {
  const sd = { directAnswer: 'De installateur doet badkamers.', introText: 'Het bedrijf werkt in Haarlem. De installateur luistert.', faqItems: [] };
  const punten = tekstControle(sd, { derdePersoon: true, bedrijfsnaam: 'Hirs Installaties' });
  assert.ok(punten.some((p) => /Hirs Installaties/.test(p.aanwijzing)));
  assert.ok(punten.some((p) => p.slots.includes('faqItems')));
  const goed = { a: 'Hirs Installaties doet badkamers.', b: 'Hirs Installaties werkt in Haarlem.', c: 'Hirs Installaties luistert.', d: 'Hirs Installaties levert op.', e: 'Hirs Installaties denkt mee.', faqItems: [1, 2, 3, 4, 5, 6].map((n) => ({ question: `Hoe gaat stap ${n} van de renovatie?`, answer: 'Antwoord.' })) };
  assert.strictEqual(tekstControle(goed, { derdePersoon: true, bedrijfsnaam: 'Hirs Installaties' }).length, 0);
});

test('projectkaart zonder tekst verdwijnt als er projecten met tekst zijn', () => {
  const tpl = { slots: [{ key: 'projectItems', type: 'list', itemFields: ['title', 'text', 'imageSrc', 'imageAlt'] }] };
  const d = { projectItems: [{ title: 'A', text: 'x', imageSrc: '1' }, { title: 'B', text: 'y', imageSrc: '2' }, { title: '', text: '', imageSrc: '3' }] };
  pf.ruimOpProjectItems(tpl, d);
  assert.strictEqual(d.projectItems.length, 2);
  const alleenFoto = { projectItems: [1, 2, 3].map((n) => ({ title: '', text: '', imageSrc: String(n) })) };
  pf.ruimOpProjectItems(tpl, alleenFoto);
  assert.strictEqual(alleenFoto.projectItems.length, 3);
});

const { scrubPersoonsnamen } = require('../src/lp/tekstcontrole');

test('scrub vervangt een persoonsnaam mechanisch door de bedrijfsnaam, ook in alt, maar niet in links', () => {
  const sd = { a: 'Nick Hirs bespreekt de indeling. Nick werkt zelfstandig.', heroImageAlt: 'Nick Hirs monteert', ctaHref: '/nick', b: ['Hirs Installaties Nick Hirs'] };
  const n = scrubPersoonsnamen(sd, { nietNoemen: ['Nick'], bedrijfsnaam: 'Hirs Installaties' });
  assert.strictEqual(n, 4);
  assert.ok(!/Nick/.test(sd.a + sd.heroImageAlt + sd.b[0]));
  assert.strictEqual(sd.ctaHref, '/nick');
  assert.strictEqual(sd.b[0], 'Hirs Installaties');
});

test('voorbeeldblok bevat de goedgekeurde tekst en de opdracht om de stijl te volgen', () => {
  const blok = ai.bouwVoorbeeldBlok({ titel: 'Badkamer', slotData: { heroTitle: 'Badkamer renoveren in Haarlem', directAnswer: 'Hirs Installaties verzorgt badkamerverbouwingen in Haarlem en omgeving voor particulieren.' } });
  assert.ok(/GOEDGEKEURD VOORBEELD/.test(blok) && /Badkamer renoveren in Haarlem/.test(blok) && /Kopieer geen zinnen letterlijk/.test(blok));
  assert.strictEqual(ai.bouwVoorbeeldBlok(null), '');
});

test('lengtecontrole: een veel kortere kop of intro dan op het voorbeeld wordt aangewezen', () => {
  const voorbeeld = { heroIntro: 'Wil je een badkamer die past bij hoe je de ruimte gebruikt? Hirs Installaties denkt met je mee over indeling, materialen en techniek.', heroTitle: 'Badkamer renoveren in Haarlem' };
  const kort = tekstControle({ heroIntro: 'Een badkamerrenovatie kan veel brengen.', heroTitle: 'Lekkage Haarlem' }, { voorbeeldSlotData: voorbeeld });
  assert.ok(kort.some((p) => p.slots.includes('heroIntro')));
  assert.ok(!kort.some((p) => p.slots.includes('heroTitle')));
  const goed = tekstControle({ heroIntro: 'Heb je een lekkage in huis en wil je dat die snel wordt verholpen? Hirs Installaties zoekt de oorzaak en lost die voor je op.' }, { voorbeeldSlotData: voorbeeld });
  assert.strictEqual(goed.length, 0);
});
