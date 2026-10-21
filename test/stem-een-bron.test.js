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
