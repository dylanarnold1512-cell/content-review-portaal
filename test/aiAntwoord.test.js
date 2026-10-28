const test = require('node:test');
const assert = require('node:assert');
const A = require('../public/ai-antwoord');
const S = require('../src/services/aiZichtbaarheid');
const D = require('../public/rapport-document');
const { bouwPdf } = require('../src/services/rapportPdf');

const MD = `**Gall & Gall**, **DrankDozijn** en gespecialiseerde webshops zoals **Bubbel Broeders** verkopen champagne.[[1]](https://drankdozijn.be/groep/wijn/champagne)[[2]](https://www.bubbelbroeders.nl/)

### Populaire Webshops voor Champagne

- **Gall & Gall** : De bekende drankenspecialist met een [Top 10 Champagne](https://www.gall.nl/ontdek/champagne/top-10-champagne/).
- **Bubbel Broeders** : Een gespecialiseerde webshop.[[1]](https://www.bubbelbroeders.nl/)

| Winkel | Prijs |
|---|---|
| BubbelBroeders | Hoog |

2\\. Kwaliteit`;

test('markdownNaarHtml: kopjes, lijsten, vet, links en citaties', () => {
  const html = A.markdownNaarHtml(MD, ['Bubbel Broeders']);
  assert.match(html, /<h4>Populaire Webshops voor Champagne<\/h4>/);
  assert.match(html, /<ul><li><strong>Gall &amp; Gall<\/strong>/);
  assert.match(html, /<a href="https:\/\/www\.gall\.nl\/ontdek\/champagne\/top-10-champagne\/" target="_blank" rel="noopener noreferrer">Top 10 Champagne<\/a>/);
  assert.match(html, /<a class="ai-ref" href="https:\/\/drankdozijn\.be\/groep\/wijn\/champagne"[^>]*>1<\/a>/);
  assert.match(html, /<table>/);
  assert.match(html, /2\. Kwaliteit/);
  assert.doesNotMatch(html, /\*\*/);
});

test('markdownNaarHtml: merk gemarkeerd, ook aan elkaar geschreven, nooit in een link adres', () => {
  const html = A.markdownNaarHtml(MD, ['Bubbel Broeders']);
  assert.match(html, /<strong><mark class="ai-merk">Bubbel Broeders<\/mark><\/strong>/);
  assert.match(html, /<mark class="ai-merk">BubbelBroeders<\/mark>/);
  assert.doesNotMatch(html, /href="[^"]*<mark/);
  assert.strictEqual(A.telMerk(MD, ['Bubbel Broeders']), 3);
  assert.strictEqual(A.telMerk('Basecamped is iets anders', ['Basecamp']), 0);
});

test('markdownNaarHtml: HTML en gevaarlijke links uit de AI tekst worden nooit uitgevoerd', () => {
  const html = A.markdownNaarHtml('<script>alert(1)</script> [klik](javascript:alert(1)) <img src=x onerror=alert(1)>', []);
  assert.doesNotMatch(html, /<script|<img|href="javascript/);
  assert.match(html, /&lt;script&gt;/);
});

function meting(o) {
  return { klant: 'Bubbel Broeders', prompt_id: 'v01', platform: 'chatgpt', run: 1, datum: '2026-10-26', genoemd: false, geciteerd: false, geciteerde_urls: '', bronnen: '', antwoord_ingekort: 'tekst', fout: '', ...o };
}

test('bouwAntwoord: per platform de runs, met vermelding eerst, alleen die week en zonder fouten', () => {
  const metingen = [
    meting({ run: 1, antwoord_ingekort: 'zonder merk' }),
    meting({ run: 2, genoemd: true, geciteerd: 'true', geciteerde_urls: 'https://www.bubbelbroeders.nl/', bronnen: 'Bubbel Broeders | https://www.bubbelbroeders.nl/\nGall | https://www.gall.nl/x\nkapot regel' }),
    meting({ run: 3, fout: 'time out' }),
    meting({ platform: 'gemini', run: 1, antwoord_ingekort: 'x'.repeat(1500) }),
    meting({ datum: '2026-10-19', run: 1, genoemd: true }),
    meting({ prompt_id: 'v02', genoemd: true })
  ];
  const a = S.bouwAntwoord({ prompt_id: 'v01', prompt: 'Welke webshop verkoopt lekkere champagne?', cluster: 'Webshop' }, metingen, '2026-10-26', ['Bubbel Broeders']);
  assert.strictEqual(a.vraag, 'Welke webshop verkoopt lekkere champagne?');
  assert.strictEqual(a.week.label, 'week van 26 oktober 2026');
  const c = a.platformen.find((p) => p.id === 'chatgpt');
  assert.deepStrictEqual(c.runs.map((r) => r.run), [2, 1]);
  assert.strictEqual(c.runs[0].geciteerd, true);
  assert.deepStrictEqual(c.runs[0].bronnen.map((b) => b.domein), ['bubbelbroeders.nl', 'gall.nl']);
  const g = a.platformen.find((p) => p.id === 'gemini');
  assert.strictEqual(g.runs[0].ingekort, true);
  assert.deepStrictEqual(A.startKeuze(a), { platform: 'chatgpt', run: 0 });
});

test('merkTermen: zoektermen en klantnaam, korte termen vallen weg', () => {
  assert.deepStrictEqual(S.merkTermen('PPExport', 'ppexport,pp export,ppe'), ['pp export', 'ppexport']);
  assert.deepStrictEqual(S.merkTermen('Basecamp Utrecht', ''), ['Basecamp Utrecht']);
});

test('vensterHtml: tabs per platform, merk gemarkeerd, bronnen en noot bij een ingekort antwoord', () => {
  const data = { vraag: 'Welke <b>webshop</b>?', week: { label: 'week van 26 oktober 2026' }, termen: ['Bubbel Broeders'], platformen: [
    { id: 'chatgpt', label: 'ChatGPT', runs: [{ run: 1, genoemd: true, geciteerd: true, antwoord: MD, ingekort: false, bronnen: [{ titel: 'Bubbel Broeders', url: 'https://www.bubbelbroeders.nl/', domein: 'bubbelbroeders.nl' }], eigenUrls: ['https://www.bubbelbroeders.nl'] }] },
    { id: 'gemini', label: 'Gemini', runs: [{ run: 1, genoemd: true, geciteerd: false, antwoord: 'Begin zonder naam', ingekort: true, bronnen: [], eigenUrls: [] }, { run: 2, genoemd: false, geciteerd: false, antwoord: 'Iets', ingekort: false, bronnen: [], eigenUrls: [] }] }
  ] };
  const html = A.vensterHtml(data, A.startKeuze(data));
  assert.match(html, /Welke &lt;b&gt;webshop&lt;\/b&gt;\?/);
  assert.match(html, /data-ai-platform="gemini"/);
  assert.match(html, /Merk genoemd/);
  assert.match(html, /Website als bron/);
  assert.match(html, /jullie website/);
  const gem = A.antwoordHtml(data, { platform: 'gemini', run: 0 });
  assert.match(gem, /Het merk staat verderop in dit antwoord/);
  assert.match(gem, /Meting 2/);
  const leeg = A.antwoordHtml({ ...data, platformen: [{ id: 'chatgpt', label: 'ChatGPT', runs: [] }] }, { platform: 'chatgpt' });
  assert.match(leeg, /geen bruikbaar antwoord/);
});

test('bouwVragenMaand: alleen vermeldingen uit weken in die maand, meest genoemd eerst', () => {
  const prompts = [{ prompt_id: 'v01', prompt: 'Vraag een' }, { prompt_id: 'v02', prompt: 'Vraag twee' }, { prompt_id: 'v03', prompt: 'Vraag drie' }];
  const metingen = [
    meting({ prompt_id: 'v01', genoemd: true, datum: '2026-10-05' }),
    meting({ prompt_id: 'v02', genoemd: true, datum: '2026-10-05' }),
    meting({ prompt_id: 'v02', genoemd: 'true', platform: 'gemini', geciteerd: true, datum: '2026-10-12' }),
    meting({ prompt_id: 'v03', genoemd: true, datum: '2026-09-28' }),
    meting({ prompt_id: 'v03', genoemd: false, datum: '2026-10-12' }),
    meting({ prompt_id: 'v01', genoemd: true, datum: '2026-10-12', fout: 'x' })
  ];
  const v = S.bouwVragenMaand(prompts, metingen, '2026-10');
  assert.deepStrictEqual(v.map((x) => [x.id, x.chatgpt, x.gemini, x.geciteerd]), [['v02', 1, 1, 1], ['v01', 1, 0, 0]]);
});

test('maandrapport: lijst met vragen, met noot over de rest, en een zin als er geen zijn', () => {
  const vragen = Array.from({ length: 10 }, (_, i) => ({ id: 'v' + i, vraag: 'Vraag ' + i, chatgpt: 2, gemini: i % 2, geciteerd: i === 0 ? 1 : 0 }));
  const html = D.aiVragenHtml(vragen, 'oktober 2026');
  assert.strictEqual((html.match(/<li>/g) || []).length, D.AI_VRAGEN_IN_DOCUMENT);
  assert.match(html, /En bij 2 andere vragen/);
  assert.match(html, /ChatGPT 2 keer\. Jullie website 1 keer als bron/);
  assert.match(D.aiVragenHtml([], 'oktober 2026'), /bij geen van de vragen/);
  assert.strictEqual(D.aiVragenHtml(null, 'oktober 2026'), '');
});

test('maandrapport document en PDF tonen de vragen in de AI sectie', async () => {
  const rapport = { maand: '2026-10', label: 'oktober 2026', totalen: { vertoningen: 10, clicks: 1 }, blogs: [], nieuweBlogs: [], terugblik: [], vooruitblik: [] };
  const ai = { beschikbaar: true, platformen: [{ id: 'chatgpt', label: 'ChatGPT' }], trend: [{ weekStart: '2026-10-05', platformen: { chatgpt: { antwoorden: 30, genoemd: 3 } } }] };
  const vragen = [{ id: 'v01', vraag: 'Welke webshop verkoopt lekkere champagne?', chatgpt: 3, gemini: 0, geciteerd: 0 }];
  const html = D.documentHtml(rapport, D.aiGegevens(ai, rapport, vragen), 'Bubbel Broeders');
  assert.match(html, /Bij deze vragen noemde AI jullie merk/);
  assert.match(html, /Welke webshop verkoopt lekkere champagne\?/);
  const zonder = D.documentHtml(rapport, D.aiGegevens(ai, rapport), 'Bubbel Broeders');
  assert.doesNotMatch(zonder, /Bij deze vragen/);
  const buf = await bouwPdf({ rapport, klantNaam: 'Bubbel Broeders', ai: { ...ai, vragenMaand: vragen } });
  assert.strictEqual(buf.slice(0, 4).toString(), '%PDF');
});
