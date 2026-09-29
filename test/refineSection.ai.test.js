// Test van de hele keten voor feedback per onderdeel, met een nep OpenAI-antwoord (geen echt netwerk).
const test = require('node:test');
const assert = require('node:assert/strict');

test('refineSectionProposal: stuurt alleen het gekozen onderdeel, vraagt lage redeneerinspanning en past de patch toe', async () => {
  const echteFetch = global.fetch;
  const verzoeken = [];
  process.env.OPENAI_API_KEY = 'test';
  global.fetch = async (url, opts) => {
    if (String(url).includes('api.openai.com')) {
      const body = JSON.parse(opts.body);
      verzoeken.push(body);
      if (verzoeken.length === 1 && body.reasoning_effort) {
        // eerste poging: model kent de parameter niet, we proberen zonder
        return { ok: false, status: 400, clone() { return this; }, text: async () => 'Unknown parameter: reasoning_effort' };
      }
      const patch = { sectieHtml: '<section class="usps"><h2>{{uspTitel}}</h2><p class="lp-nieuw">Beter</p></section>', cssToevoegen: '.lpt .lp-nieuw { color: green; }', uitleg: 'Tekst toegevoegd.' };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(patch) } }] }) };
    }
    throw new Error('geen netwerk in test');
  };
  try {
    const ai = require('../src/lp/ai');
    const html = '<section class="hero"><h1>{{heroTitle}}</h1></section><section class="usps"><h2>{{uspTitel}}</h2></section><section class="faq"><h2>Vragen</h2></section>';
    const r = await ai.refineSectionProposal({
      klant: 'macbouw', naam: 'Test', feedback: 'Voeg een alinea toe',
      huidigBlueprint: { templateFormat: 'slots', htmlTemplate: html, cssTemplate: '.lpt .hero { color: red; }', slots: [{ key: 'heroTitle', type: 'text' }, { key: 'uspTitel', type: 'text' }] },
      huidigeVoorbeeldSlotData: { heroTitle: 'H', uspTitel: 'Waarom' },
      sectie: { modus: 'vervang', index: 1 }
    });
    assert.equal(verzoeken.length, 2);
    assert.equal(verzoeken[0].reasoning_effort, 'low');
    assert.equal(verzoeken[1].reasoning_effort, undefined);
    const prompt = verzoeken[1].messages[1].content;
    assert.ok(prompt.includes('<section class="usps">'));
    assert.ok(!prompt.includes('Vragen'), 'andere onderdelen worden niet als te bewerken HTML meegestuurd');
    assert.ok(r.blueprint.htmlTemplate.includes('lp-nieuw'));
    assert.ok(r.blueprint.htmlTemplate.includes('<section class="hero"><h1>{{heroTitle}}</h1></section>'));
    assert.ok(r.blueprint.htmlTemplate.endsWith('<section class="faq"><h2>Vragen</h2></section>'));
    assert.equal(r.uitleg, 'Tekst toegevoegd.');
  } finally {
    global.fetch = echteFetch;
  }
});
