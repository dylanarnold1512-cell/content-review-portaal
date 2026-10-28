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

test('merkTermen: zoektermen en domein, korte termen vallen weg, klantnaam alleen als er niets anders is', () => {
  assert.deepStrictEqual(S.merkTermen('PPExport', 'ppexport,pp export,ppe', 'ppexport.eu'), ['ppexport.eu', 'pp export', 'ppexport']);
  assert.deepStrictEqual(S.merkTermen('Trockenblumengrosshandel', 'trockenblumengrosshandel.de', 'https://www.trockenblumengrosshandel.de/'), ['trockenblumengrosshandel.de']);
  assert.deepStrictEqual(S.merkTermen('Basecamp Utrecht', '', ''), ['Basecamp Utrecht']);
});

test('merkregel: bij een gewone woordnaam telt alleen het domein', () => {
  const termen = ['trockenblumengrosshandel.de'];
  const tekst = 'Das hängt vom jeweiligen Trockenblumen-Großhandel ab. Ein Trockenblumengroßhandel liefert. Siehe [Decofleur](https://www.decofleur.com/de/trockenblumen-grosshandel). Trockenblumengrosshandel. De rest.';
  assert.strictEqual(A.telMerk(tekst, termen), 0);
  assert.doesNotMatch(A.markdownNaarHtml(tekst, termen), /<mark/);
  const echt = 'Ein Anbieter ist **Trockenblumengrosshandel** (trockenblumengrosshandel.de) mit Lager in NRW.';
  assert.strictEqual(A.telMerk(echt, termen), 1);
  assert.match(A.markdownNaarHtml(echt, termen), /<mark class="ai-merk">trockenblumengrosshandel\.de<\/mark>/);
});

test('merkregel: een naam nooit midden in een ander woord', () => {
  assert.strictEqual(A.telMerk('Het Basecampgebouw en basecamp utrecht.', ['Basecamp']), 1);
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

function vraagRij(id, o = {}) {
  return { id, vraag: o.vraag || 'Vraag ' + id, onderwerp: o.onderwerp || 'Teamdagen', urls: [],
    chatgpt: { metingen: o.cm ?? 3, genoemd: o.cg ?? 0, geciteerd: o.cc ?? 0 },
    gemini: { metingen: o.gm ?? 3, genoemd: o.gg ?? 0, geciteerd: 0 } };
}

test('bouwVraagKansen: alleen vragen zonder vermelding, met pagina of zonder passende pagina, kernvragen eerst', () => {
  const vragen = [
    vraagRij('w01', { vraag: 'Wissel vraag' }),
    vraagRij('k01', { vraag: 'Kern vraag', onderwerp: 'Vergaderen' }),
    vraagRij('k02', { vraag: 'Wel genoemd', cg: 1 }),
    vraagRij('k03', { vraag: 'Te weinig metingen', cm: 1, gm: 0 }),
    vraagRij('k04', { vraag: 'Geen pagina', onderwerp: 'Feesten' }),
    vraagRij('k05', { vraag: 'Deels', onderwerp: 'Feesten' }),
    vraagRij('k06', { vraag: 'Onveilige link', onderwerp: 'Feesten' }),
    vraagRij('k07', { vraag: 'Site als bron', cc: 2, onderwerp: 'Locatie' })
  ];
  const prompts = [{ prompt_id: 'k01', soort: 'kern', actief: true }, { prompt_id: 'w01', soort: 'wissel', actief: true }];
  const koppelingen = [
    { prompt_id: 'w01', oordeel: 'past', pagina_url: 'https://x.nl/teamdag/', pagina_titel: 'Teamdag organiseren' },
    { prompt_id: 'k01', oordeel: 'past', pagina_url: 'https://x.nl/vergaderen/', pagina_titel: 'Vergaderen' },
    { prompt_id: 'k02', oordeel: 'past', pagina_url: 'https://x.nl/a/', pagina_titel: 'A' },
    { prompt_id: 'k03', oordeel: 'past', pagina_url: 'https://x.nl/b/', pagina_titel: 'B' },
    { prompt_id: 'k04', oordeel: 'geen', pagina_url: '', pagina_titel: '' },
    { prompt_id: 'k05', oordeel: 'deels', pagina_url: 'https://x.nl/c/', pagina_titel: 'C' },
    { prompt_id: 'k06', oordeel: 'past', pagina_url: 'javascript:alert(1)', pagina_titel: 'Gevaarlijk' },
    { prompt_id: 'k07', oordeel: 'past', pagina_url: 'https://x.nl/locatie/', pagina_titel: 'Locatie' }
  ];
  const kansen = S.bouwVraagKansen(vragen, prompts, koppelingen, '2026-10-26');
  assert.deepStrictEqual(kansen.map((k) => k.vraagId), ['k01', 'k04', 'k07', 'w01']);
  const k01 = kansen[0];
  assert.strictEqual(k01.prioriteit, 'hoog');
  assert.strictEqual(kansen[1].prioriteit, 'laag');
  assert.strictEqual(kansen[3].prioriteit, 'middel');
  assert.strictEqual(k01.pagina.url, 'https://x.nl/vergaderen/');
  assert.match(k01.signaal, /Kern vraag/);
  assert.match(k01.signaal, /geen van de 6 antwoorden/);
  assert.match(k01.waarom, /"Vergaderen"/);
  assert.match(k01.actie, /geen garantie/);
  assert.match(k01.onderbouwing, /week van 26 oktober 2026: 0 van 6 antwoorden/);
  assert.match(kansen[2].onderbouwing, /wel als bron getoond/);
  assert.strictEqual(kansen[1].pagina, null);
  assert.match(kansen[1].waarom, /geen pagina/);
});

test('bouwVraagKansen: maximaal twee per onderwerp en vijf met een pagina, zonder koppelingen niets', () => {
  const vragen = Array.from({ length: 12 }, (_, i) => vraagRij('k' + String(i + 1).padStart(2, '0'), { onderwerp: 'O' + (i % 4) }));
  const koppelingen = vragen.map((v) => ({ prompt_id: v.id, oordeel: 'past', pagina_url: 'https://x.nl/p/', pagina_titel: 'P' }));
  const kansen = S.bouwVraagKansen(vragen, [], koppelingen, '2026-10-26');
  assert.strictEqual(kansen.length, 5);
  const perO = {};
  vragen.forEach((v) => { if (kansen.some((k) => k.vraagId === v.id)) perO[v.onderwerp] = (perO[v.onderwerp] || 0) + 1; });
  assert.ok(Object.values(perO).every((n) => n <= 2));
  assert.deepStrictEqual(S.bouwVraagKansen(vragen, [], [], '2026-10-26'), []);
});

test('vraagKansenHtml: tekst veilig, pagina als link, knop naar het antwoord', () => {
  const html = A.vraagKansenHtml([
    { vraagId: 'k01', vraag: 'Is <b>dit</b> een vraag?', prioriteit: 'hoog', signaal: 'Bij de vraag "<img src=x>"', waarom: 'W', actie: 'Doen', onderbouwing: 'O', pagina: { titel: 'Pagina <i>1</i>', url: 'https://x.nl/a/' } },
    { vraagId: 'k02', vraag: 'V2', prioriteit: 'laag', signaal: 'S', waarom: '', actie: '', onderbouwing: '', pagina: { titel: 'Eval', url: 'javascript:alert(1)' } },
    { vraagId: 'k03', vraag: 'V3', prioriteit: 'onbekend', signaal: 'S3', pagina: null }
  ]);
  assert.doesNotMatch(html, /<img|<b>dit|<i>1/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /<a href="https:\/\/x\.nl\/a\/" target="_blank" rel="noopener noreferrer">Pagina &lt;i&gt;1&lt;\/i&gt;<\/a>/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.match(html, /data-ai-vraag="k01" data-ai-titel="Is &lt;b&gt;dit&lt;\/b&gt; een vraag\?"/);
  assert.match(html, /pv-tag-hoog/);
  assert.match(html, /pv-tag-laag/);
  assert.strictEqual(A.vraagKansenHtml([]), '');
});

test('bouwVraagKansen: toont voor de klant of het antwoord al als veelgestelde vraag op de pagina staat', () => {
  const vragen = [vraagRij('k01', { vraag: 'a?', onderwerp: 'A' }), vraagRij('k02', { vraag: 'b?', onderwerp: 'B' }), vraagRij('k03', { vraag: 'c?', onderwerp: 'C' })];
  const prompts = ['k01', 'k02', 'k03'].map((id) => ({ prompt_id: id, soort: 'kern', actief: true }));
  const koppel = ['k01', 'k02', 'k03'].map((id) => ({ prompt_id: id, oordeel: 'past', pagina_url: 'https://x.nl/' + id, pagina_titel: 'T' }));
  const uit = S.bouwVraagKansen(vragen, prompts, koppel, '2026-10-26', { k01: { status: 'toegepast' }, k02: { status: 'goedgekeurd' }, k03: { status: 'voorstel' } });
  assert.equal(uit.find((k) => k.vraagId === 'k01').faqStatus, 'toegepast');
  assert.match(uit.find((k) => k.vraagId === 'k01').actie, /staat inmiddels/);
  assert.equal(uit.find((k) => k.vraagId === 'k02').faqStatus, 'goedgekeurd');
  assert.equal(uit.find((k) => k.vraagId === 'k03').faqStatus, '', 'een concept voorstel is nog niet voor de klant zichtbaar');
  assert.doesNotMatch(uit.find((k) => k.vraagId === 'k03').actie, /staat inmiddels|wordt als korte/);
});
