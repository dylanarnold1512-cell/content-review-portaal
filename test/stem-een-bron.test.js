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
