const test = require('node:test');
const assert = require('node:assert/strict');
const { filterBrontekst, beoordeelRegel, spamTreffers } = require('../src/lp/bronFilter');
const { haalSiteTeksten, formatSiteTekstenVoorPrompt } = require('../src/lp/siteTeksten');

// Echte voorbeelden van mac-bouw.nl/nieuwbouw-en-verbouw/ (19-10-2026), ingekort.
const CASINO = [
  'Online gambling has seen tremendous growth across Canada, with players increasingly exploring international platforms for safe and engaging experiences.',
  'Promotions and bonuses play a crucial role in online gaming, and the site provides detailed guidance on the best offers available. From welcome bonuses and free spins to loyalty rewards and seasonal promotions, the terms are explained clearly.',
  'In summary, this is a trusted resource for Canadian players seeking reliable international online casinos, thorough reviews and guidance on bonuses and payments for every player.'
];
const GOED = [
  'Bij Aannemersbedrijf MAC Bouw B.V. actief in Hillegom, Haarlemmermeer en de Duin- en Bollenstreek krijgen wij vaak de vraag wat het verschil is tussen nieuwbouw en verbouw.',
  'We communiceren helder over de planning, werkwijze en kosten, zodat je niet voor verrassingen komt te staan.',
  '## Prefab dakkapellen plaatsen in één dag'
];

test('het casinoblok van mac-bouw.nl wordt uit de bron gehaald en de echte tekst blijft staan', () => {
  const r = filterBrontekst([...GOED, ...CASINO].join('\n'), { taal: 'nl' });
  for (const regel of CASINO) assert.ok(!r.tekst.includes(regel.slice(0, 30)), regel.slice(0, 30));
  for (const regel of GOED) assert.ok(r.tekst.includes(regel), regel.slice(0, 30));
  assert.equal(r.verwijderd.length, 3);
  assert.ok(r.verwijderd.every((v) => v.reden && v.regel));
});

test('spam wordt ook op woorden herkend, zonder taalcontrole', () => {
  assert.deepEqual(spamTreffers('Beste casino bonus met free spins'), ['casino', 'free spin']);
  assert.match(beoordeelRegel('Speel nu bij het beste casino met gratis poker en roulette', { taal: 'en' }), /spam/);
  assert.equal(beoordeelRegel('Wij bouwen een casino-achtig terras voor de horeca', { taal: 'nl' }), null, 'een woord is geen spam');
});

test('placeholders van thema en plugins gaan eruit, een korte kop in een andere taal blijft', () => {
  const r = filterBrontekst(['We Build Building and Great Constructive Homes.', 'Got a project in mind?', "Let's Talk", 'View More', 'Lorem ipsum dolor sit amet', '## Female Only Dorm', 'Check-in vanaf 15:00 uur'].join('\n'));
  assert.equal(r.tekst, '## Female Only Dorm\nCheck-in vanaf 15:00 uur');
  assert.equal(r.verwijderd.length, 5);
});

test('een lange Engelse regel valt af bij Nederlands, maar niet bij een Engelse klant', () => {
  const engels = 'We successfully cope with tasks of varying complexity, provide long-term guarantees and regularly master new technologies for our customers.';
  assert.match(beoordeelRegel(engels, { taal: 'nl' }), /Engels/);
  assert.equal(beoordeelRegel(engels, { taal: 'en' }), null);
});

test('een Nederlandse regel met enkele Engelse woorden blijft staan', () => {
  const regel = 'Onze Female Only Dorm en de Hotelkamers hebben een eigen badkamer, en je kunt gratis fietsen lenen bij de receptie als je dat wilt.';
  assert.equal(beoordeelRegel(regel, { taal: 'nl' }), null);
});

test('haalSiteTeksten geeft terug wat het bronfilter heeft weggehaald', async () => {
  const oud = global.fetch;
  const dienst = `<main><h1>Nieuwbouw en verbouw</h1>${Array.from({ length: 6 }, (_, i) => `<p>Wij begeleiden uw verbouwing van begin tot eind, regel ${i}, met heldere afspraken over planning en kosten voor u.</p>`).join('')}${CASINO.map((c) => `<p>${c}</p>`).join('')}</main>`;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/wp-json/')) return { ok: true, status: 200, url: u, text: async () => JSON.stringify([{ link: 'https://klant-filter.nl/nieuwbouw-en-verbouw/', title: { rendered: 'Nieuwbouw' } }]) };
    return { ok: true, status: 200, url: u, text: async () => dienst };
  };
  try {
    const r = await haalSiteTeksten({ url: 'https://klant-filter.nl', uitsluit: [] });
    assert.equal(r.fout, null);
    assert.ok(r.gefilterd.length >= 3);
    assert.ok(r.gefilterd.every((g) => g.url && g.regel && g.reden));
    const tekst = formatSiteTekstenVoorPrompt(r);
    assert.ok(!/gambling|casino/i.test(tekst), 'geen spam in de brontekst voor de AI');
    assert.match(tekst, /heldere afspraken/);
  } finally {
    global.fetch = oud;
  }
});
