const test = require('node:test');
const assert = require('node:assert');
const D = require('../public/rapport-document');
const { bouwPdf } = require('../src/services/rapportPdf');

const rapport = {
  maand: '2026-09', label: 'september 2026', periodeStart: '2026-09-01', periodeEind: '2026-09-30', aangemaakt: '2026-10-07',
  bron: 'Bron: Google Search Console en Google Analytics', voortgang: '12 blogs staan live, nog 19 in de planning.',
  totalen: { vertoningen: 2207, vertoningen_vorig: 1155, clicks: 2, clicks_vorig: 1, paginaweergaven: 14, hk_positie_gemiddeld: 9.3 },
  terugblik: ['In september behaalden jullie 2207 vertoningen en 2 clicks in Google.'],
  nieuweBlogs: [{ titel: 'Teamdag met resultaat', datum: '2026-09-29' }, { titel: 'Kleine vergaderruimte <Utrecht>', datum: '2026-09-25' }],
  gedaan: { nieuweBlogs: 2, aangevuld: 1, internelinks: 0 },
  blogs: [
    { titel: 'Klein', vertoningen: 10, clicks: 0, zoekwoorden: [{ q: 'vergaderen utrecht', i: 10, c: 0, p: 12 }] },
    { titel: 'Waarom duurzame vergaderlocaties', url: 'https://basecamputrecht.nl/news/duurzaam/', vertoningen: 1315, clicks: 1, zoekwoorden: [{ q: 'duurzame vergaderlocatie', i: 900, c: 1, p: 7 }] },
    { titel: 'Nul', vertoningen: 0, clicks: 0 }
  ],
  effecten: { items: [{ soortLabel: 'Blog aangevuld', datum: '2026-09-20', titel: 'Een blog', regels: ['Van 100 naar 140 vertoningen.'] }] },
  vooruitblik: [{ titel: 'Verbeteren', tekst: 'Voeg iets toe.' }, { titel: 'Twee', tekst: 'b' }, { titel: 'Drie', tekst: 'c' }, { titel: 'Vier', tekst: 'd' }]
};

test('volgendRapport: de maand na het nieuwste rapport, klaar op de 4e van de maand daarna', () => {
  const v = D.volgendRapport('2026-09', '2026-10-26');
  assert.strictEqual(v.maand, '2026-10');
  assert.strictEqual(v.loopt, true);
  assert.strictEqual(v.verschijnt, '2026-11-04');
  assert.strictEqual(v.verschijntTekst, '4 november');
  const laat = D.volgendRapport('2026-09', '2026-11-02');
  assert.strictEqual(laat.maand, '2026-10');
  assert.strictEqual(laat.loopt, false);
  assert.strictEqual(D.volgendRapport('2026-12', '2027-01-10').verschijnt, '2027-02-04');
  assert.strictEqual(D.volgendRapport('2026-10', '2026-10-26'), null);
  assert.strictEqual(D.volgendRapport('', '2026-10-26'), null);
});

test('documentHtml: alles uit het rapport staat in het document', () => {
  const html = D.documentHtml(rapport, null, 'Basecamp Utrecht');
  for (const stuk of ['Maandrapport september 2026', 'Basecamp Utrecht', '2.207', '+91%', '1.155 in de maand ervoor', '9,3', 'Periode 1 september 2026 tot en met 30 september 2026',
    'Vastgelegd op 7 oktober 2026', 'Terugblik op september 2026', 'Wat we deden in september 2026', '2 nieuwe blogs en 1 bestaande blog aangevuld.',
    'Teamdag met resultaat', 'Blogs met de meeste vertoningen', 'duurzame vergaderlocatie', 'Wat hebben we gedaan en wat was het effect', 'Vier',
    '12 blogs staan live', '1 blog had deze maand geen vertoningen of bezoekers.', 'Pagina 1 van 3', 'Pagina 3 van 3']) {
    assert.ok(html.includes(stuk), 'mist: ' + stuk);
  }
  // Alle vooruitblik punten, niet alleen de eerste drie zoals vroeger in het tabblad.
  assert.strictEqual((html.match(/rd-punt-titel/g) || []).length, 5);
  // Tekst uit data wordt ontsnapt.
  assert.ok(html.includes('Kleine vergaderruimte &lt;Utrecht&gt;'));
  assert.ok(!html.includes('<Utrecht>'));
  // De blog met de meeste vertoningen staat bovenaan.
  assert.ok(html.indexOf('Waarom duurzame') < html.indexOf('>Klein<'));
  // Zonder AI geen AI onderdeel.
  assert.ok(!html.includes('AI zichtbaarheid'));
});

test('documentHtml: AI zichtbaarheid met en zonder meting in die maand', () => {
  const ai = { beschikbaar: true, platformen: [{ id: 'chatgpt', label: 'ChatGPT' }],
    trend: [{ weekStart: '2026-09-07', platformen: { chatgpt: { antwoorden: 30, genoemd: 3 } } }, { weekStart: '2026-08-10', platformen: { chatgpt: { antwoorden: 20, genoemd: 4 } } }] };
  const g = D.aiGegevens(ai, rapport);
  const html = D.documentHtml(rapport, g, 'Basecamp Utrecht');
  assert.ok(html.includes('AI noemde jullie merk in 10% van de antwoorden.'));
  assert.ok(html.includes('10 procentpunt lager dan de maand ervoor (20%).'));
  assert.ok(html.includes('rd-cijfers-5'));
  const leeg = D.documentHtml(rapport, D.aiGegevens({ beschikbaar: true, trend: [] }, rapport), '');
  assert.ok(leeg.includes('In deze maand is nog niet gemeten'));
  assert.strictEqual(D.aiGegevens({ beschikbaar: false }, rapport), null);
});

test('documentHtml: een leeg rapport geeft nette teksten en geen kapotte pagina', () => {
  const html = D.documentHtml({ maand: '2026-08', label: 'augustus 2026', totalen: {}, blogs: [], nieuweBlogs: [], terugblik: [], vooruitblik: [] }, null, '');
  assert.ok(html.includes('werden jullie blogs nog niet getoond in Google'));
  assert.ok(html.includes('Er zijn deze maand geen nieuwe blogs live gegaan.'));
  assert.ok(html.includes('Nog geen onderbouwde kansen'));
  assert.ok(!html.includes('undefined'));
  assert.ok(!html.includes('NaN'));
});

test('zoekwoorden in het document: maximaal 15, met een noot over de rest', () => {
  const veel = Array.from({ length: 20 }, (_, i) => ({ q: 'woord ' + i, i: 100 - i, c: 0, p: 5 }));
  const html = D.documentHtml({ ...rapport, blogs: [{ titel: 'A', vertoningen: 100, clicks: 0, zoekwoorden: veel }] }, null, '');
  assert.ok(html.includes('woord 14'));
  assert.ok(!html.includes('woord 15<'));
  assert.ok(html.includes('De 15 zoekwoorden die het vaakst getoond werden, van 20 in totaal.'));
});

test('miniatuur toont de maand en de cijfers', () => {
  const html = D.miniatuur({ label: 'september 2026' }, D.kerncijfers(rapport, null));
  assert.ok(html.includes('SEPTEMBER 2026'));
  assert.ok(html.includes('2.207'));
  assert.ok(D.miniatuur({ label: 'augustus 2026' }).includes('rp-mini-leeg'));
});

test('PDF bevat ook wat we deden en de periode', async () => {
  const buf = await bouwPdf({ rapport, klantNaam: 'Basecamp Utrecht', ai: null });
  assert.strictEqual(buf.slice(0, 4).toString(), '%PDF');
  assert.ok(buf.length > 2000);
});

test('opbrengst toont nooit een kale nul en legt uit waarom', () => {
  const D = require('../public/rapport-document.js');
  const geen = D.opbrengstBlokken({ label: 'oktober 2026', meting: null });
  assert.ok(geen.alinea[0].includes('niet vastgelegd'));
  const nul = D.opbrengstBlokken({ label: 'oktober 2026', meting: { eerderActief: true, eerderLeads: 0, eerderBoekingen: 0, sessiesAi: 0 } });
  assert.strictEqual(nul.punten.length, 0);
  assert.ok(nul.alinea[0].includes('De meting liep wel'));
  const wel = D.opbrengstBlokken({ label: 'oktober 2026', meting: { eerderActief: true, eerderLeads: 2, eerderBoekingen: null, sessiesAi: 0 } });
  assert.deepStrictEqual(wel.punten, ['2 aanvragen van mensen die eerder een blog lazen']);
});
