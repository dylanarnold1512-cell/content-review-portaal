// Tests voor src/lp/zoekvragen.js en de vragenblokken in ai.js (Pagr. stap 1, 14-10-2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  haalZoekvragen, dienstenUitTekst, vragenUitContent, vindDubbeleVragen, schoonVraag
} = require('../src/lp/zoekvragen');
const { bouwVragenBlok, formatKlantBronnenVoorSjabloon, buildTemplateSystemPrompt } = require('../src/lp/ai');

function nepFetch(antwoorden) {
  const aanroepen = [];
  const f = async (url) => {
    const q = decodeURIComponent(String(url).split('q=')[1] || '');
    aanroepen.push(q);
    const lijst = antwoorden[q] || [];
    return { ok: true, text: async () => JSON.stringify([q, lijst]) };
  };
  f.aanroepen = aanroepen;
  return f;
}

test('dienstenUitTekst splitst op komma en "en" en houdt er maximaal twee', () => {
  assert.deepEqual(dienstenUitTekst('verbouw, renovatie en onderhoud'), ['verbouw', 'renovatie']);
  assert.deepEqual(dienstenUitTekst('dakkapel plaatsen'), ['dakkapel plaatsen']);
  assert.deepEqual(dienstenUitTekst(''), []);
});

test('schoonVraag zet een hoofdletter en een vraagteken bij een vraag', () => {
  assert.equal(schoonVraag('heb ik een vergunning nodig voor een dakkapel'), 'Heb ik een vergunning nodig voor een dakkapel?');
  assert.equal(schoonVraag('dakkapel prijs'), 'Dakkapel prijs');
});

test('haalZoekvragen houdt alleen echte vragen over de dienst en geen dubbelen', async () => {
  const f = nepFetch({
    'hoe dakkapel plaatsen': ['hoe lang duurt het plaatsen van een dakkapel', 'hoe lang duurt het plaatsen van een dakkapel', 'hoe werkt een zonnepaneel'],
    'mag dakkapel plaatsen': ['mag ik een dakkapel plaatsen zonder vergunning'],
    'dakkapel plaatsen hillegom': ['dakkapel plaatsen hillegom prijs']
  });
  const uit = await haalZoekvragen({ diensten: ['dakkapel plaatsen'], plaats: 'Hillegom', fetchImpl: f });
  const vragen = uit.map((x) => x.vraag);
  assert.deepEqual(vragen, ['Hoe lang duurt het plaatsen van een dakkapel?', 'Mag ik een dakkapel plaatsen zonder vergunning?']);
  assert.ok(uit.every((x) => x.bron === 'Google suggesties'));
});

test('haalZoekvragen geeft een lege lijst bij een fout in plaats van te falen', async () => {
  const kapot = async () => { throw new Error('netwerk'); };
  const uit = await haalZoekvragen({ diensten: ['badkamer verbouwen'], plaats: 'Zandvoort', fetchImpl: kapot });
  assert.deepEqual(uit, []);
  assert.deepEqual(await haalZoekvragen({ diensten: [] }), []);
});

test('vragenUitContent vindt vragen in elke lijst met question of vraag', () => {
  const content = { slotData: { faqItems: [{ question: 'Wat kost het?', answer: 'x' }, { vraag: 'Hoe lang duurt het?' }], heroTitle: 'Titel', uspItems: [{ title: 'a' }] } };
  assert.deepEqual(vragenUitContent(content), ['Wat kost het?', 'Hoe lang duurt het?']);
  assert.deepEqual(vragenUitContent(null), []);
});

test('vindDubbeleVragen negeert plaatsnamen en vindt vrijwel gelijke vragen', () => {
  const dubbel = vindDubbeleVragen({
    vragen: ['Kan MAC Bouw mijn zolder verbouwen in Zandvoort?', 'Mag ik in Zandvoort een dakkapel plaatsen zonder vergunning?'],
    zusterVragen: ['Kan MAC Bouw mijn zolder verbouwen in Lisse?', 'Wat valt onder timmerwerk en woningonderhoud?'],
    plaatsen: ['Zandvoort', 'Lisse']
  });
  assert.equal(dubbel.length, 1);
  assert.equal(dubbel[0].vraag, 'Kan MAC Bouw mijn zolder verbouwen in Zandvoort?');
  assert.equal(dubbel[0].zusterVraag, 'Kan MAC Bouw mijn zolder verbouwen in Lisse?');
});

test('vindDubbeleVragen laat de werkt-in-deze-plaats vraag toe', () => {
  const dubbel = vindDubbeleVragen({
    vragen: ['Werkt MAC Bouw in Zandvoort?'],
    zusterVragen: ['Werkt MAC Bouw in Lisse?'],
    plaatsen: ['Zandvoort', 'Lisse']
  });
  assert.deepEqual(dubbel, []);
});

test('bouwVragenBlok noemt zoekvragen en bezette vragen, en is leeg zonder beide', () => {
  assert.equal(bouwVragenBlok({}), '');
  const tekst = bouwVragenBlok({ zoekvragen: [{ vraag: 'Heb ik een vergunning nodig?' }], zusterVragen: ['Wat valt onder timmerwerk?'] });
  assert.match(tekst, /ECHTE ZOEKVRAGEN/);
  assert.match(tekst, /Heb ik een vergunning nodig\?/);
  assert.match(tekst, /ZUSTERPAGINA'S STAAN/);
  assert.match(tekst, /Wat valt onder timmerwerk\?/);
});

test('sjabloon systeemprompt vraagt echte gegevens van de klant in het voorbeeld', () => {
  assert.match(buildTemplateSystemPrompt(), /ECHTE GEGEVENS VAN DE KLANT/);
});

test('formatKlantBronnenVoorSjabloon geeft bedrijf en werkgebied van MAC Bouw, en is leeg bij een onbekende klant', async () => {
  const tekst = await formatKlantBronnenVoorSjabloon('macbouw');
  assert.match(tekst, /ECHTE GEGEVENS VAN DE KLANT/);
  assert.match(tekst, /Hillegom/);
  assert.equal(await formatKlantBronnenVoorSjabloon('bestaat-niet'), '');
});
