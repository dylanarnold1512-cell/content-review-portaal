// Demogegevens voor de schermafbeeldingen in de handleiding: een verzonnen klant, nooit een echte.
// Per branche een eigen set (nu: klussenbedrijf). Alle cijfers zijn verzonnen en bedoeld om het portaal
// te laten zien zoals het eruitziet als het een paar maanden draait.

const NAAM = process.env.DEMO_KLANT || 'Vermeulen Klussenbedrijf';
const SLUG = 'demo-klussenbedrijf';
const SITE = 'https://vermeulen-klussenbedrijf.nl';

const dag = (iso, plus) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + plus); return d.toISOString().slice(0, 10); };
const VANDAAG = new Date().toISOString().slice(0, 10);

// Blogs: titel, cluster, hoofdzoekwoord, dagen geleden gepubliceerd, vertoningen, klikken, vorige vertoningen, vorige klikken, positie, vorige positie, paginaweergaven, zoekwoorden
const LIVE = [
  ['Sierbestrating of klinkers: welke past bij jouw tuin?', 'Sierbestrating', 'sierbestrating', 'sierbestrating-of-klinkers', 74, 3120, 96, 2210, 61, 7.4, 9.8, 188, [['sierbestrating', 41, 1420, 7.4], ['klinkers of tegels', 22, 980, 9.1], ['bestrating tuin kosten', 12, 410, 11.8]]],
  ['Schutting plaatsen: dit moet je vooraf weten', 'Schuttingen', 'schutting plaatsen', 'schutting-plaatsen', 61, 2480, 71, 1530, 40, 8.9, 12.4, 140, [['schutting plaatsen', 38, 1180, 8.9], ['schutting bouwen', 18, 760, 10.2], ['hout of beton schutting', 11, 380, 12.7]]],
  ['Oprit bestraten: zo zorg je voor een stevige ondergrond', 'Sierbestrating', 'oprit bestraten', 'oprit-bestraten', 47, 1890, 52, 1010, 28, 9.6, 14.2, 101, [['oprit bestraten', 29, 940, 9.6], ['oprit stenen', 14, 520, 12.0]]],
  ['Terras laten reinigen: wanneer is het tijd?', 'Terrasreiniging', 'terras laten reinigen', 'terras-laten-reinigen', 33, 1260, 38, 640, 17, 10.8, 15.1, 77, [['terras laten reinigen', 24, 700, 10.8], ['terras reinigen machine', 8, 260, 13.4]]],
  ['Complete tuinaanleg: van plan tot oplevering', 'Tuinaanleg', 'tuinaanleg', 'complete-tuinaanleg', 20, 640, 15, 0, 0, 14.5, null, 36, [['tuinaanleg', 15, 410, 14.5]]],
  ['Verzakte bestrating herstellen: dit kun je verwachten', 'Herstel', 'verzakte bestrating herstellen', 'verzakte-bestrating-herstellen', 9, 120, 2, 0, 0, null, null, 8, [['verzakte bestrating', 2, 90, 17.2]]]
];

function overzichtRij() {
  const v = LIVE.reduce((t, b) => t + b[5], 0), c = LIVE.reduce((t, b) => t + b[6], 0);
  const vv = LIVE.reduce((t, b) => t + b[7], 0), cv = LIVE.reduce((t, b) => t + b[8], 0);
  return { client_name: NAAM, periode_type: '28d', periode_start: dag(VANDAAG, -28), periode_eind: dag(VANDAAG, -1), vertoningen: v, vertoningen_vorig: vv, clicks: c, clicks_vorig: cv, paginaweergaven: LIVE.reduce((t, b) => t + b[11], 0), blogs_gepubliceerd: LIVE.length, blogs_pipeline: 4, toelichting: '', bijgewerkt: VANDAAG + 'T05:10:00.000Z' };
}

function blogRijen() {
  return LIVE.map((b) => ({
    client_name: NAAM, periode_type: '28d', blog_pad: '/' + b[3] + '/', blog_url: SITE + '/' + b[3] + '/', titel: b[0], cluster: b[1], publicatiedatum: dag(VANDAAG, -b[4]),
    hoofdkeyword: b[2], hk_positie: b[9], hk_positie_vorig: b[10], hk_vertoningen: Math.round(b[5] * 0.45), vertoningen: b[5], vertoningen_vorig: b[7], clicks: b[6], clicks_vorig: b[8], paginaweergaven: b[11],
    zoekwoorden: JSON.stringify(b[12].map((z) => ({ q: z[0], c: z[1], i: z[2], p: z[3] })))
  }));
}

function wekenRijen() {
  const start = dag(VANDAAG, -7 * 12 - ((new Date(VANDAAG + 'T00:00:00Z').getUTCDay() + 6) % 7));
  const klik = [4, 6, 9, 14, 19, 27, 35, 44, 58, 66, 78, 96];
  const vert = [210, 340, 520, 780, 1040, 1390, 1760, 2140, 2780, 3150, 3640, 4390];
  const nieuw = { 1: [LIVE[0]], 3: [LIVE[1]], 5: [LIVE[2]], 7: [LIVE[3]], 9: [LIVE[4]], 10: [LIVE[5]] };
  return klik.map((k, i) => ({ client_name: NAAM, week_start: dag(start, i * 7), week_eind: dag(start, i * 7 + 6), volledig: true, clicks: k, vertoningen: vert[i], nieuwe_blogs: JSON.stringify((nieuw[i] || []).map((b) => ({ titel: b[0], url: SITE + '/' + b[3] + '/' }))) }));
}

function conversieRijen() {
  return LIVE.map((b, i) => ({ client_name: NAAM, periode_type: '28d', blog_pad: '/' + b[3] + '/', sessies_google: Math.round(b[6] * 0.9), betrokken_seconden: 70 + i * 9, leads: [3, 2, 2, 1, 0, 0][i], doorkliks_contact: [9, 6, 5, 3, 1, 0][i], sessies_ai: [8, 5, 6, 2, 1, 0][i], leads_ai: [1, 0, 1, 0, 0, 0][i] }));
}

function conversieTotalen() {
  return [{ client_name: NAAM, periode_type: '28d', periode_start: dag(VANDAAG, -28), sessies_ai: 22, leads_ai: 2, ai_bronnen: JSON.stringify([{ naam: 'ChatGPT', aantal: 14 }, { naam: 'Gemini', aantal: 6 }, { naam: 'Perplexity', aantal: 2 }]), ondersteund_actief: false }];
}

function aiRijen() {
  const start = dag(VANDAAG, -7 * 8 - ((new Date(VANDAAG + 'T00:00:00Z').getUTCDay() + 6) % 7));
  const genoemdChat = [1, 2, 2, 3, 5, 6, 8, 9];
  const genoemdGem = [0, 1, 2, 2, 3, 5, 6, 7];
  const citChat = [0, 0, 1, 1, 2, 3, 4, 5];
  const citGem = [0, 0, 1, 1, 1, 2, 3, 4];
  const rijen = [];
  for (let i = 0; i < 8; i += 1) {
    const wk = dag(start, i * 7);
    for (const [pf, gen, cit] of [['chatgpt', genoemdChat[i], citChat[i]], ['gemini', genoemdGem[i], citGem[i]]]) {
      for (const cl of ['kern', 'totaal']) rijen.push({ klant: NAAM, week_start: wk, platform: pf, cluster: cl, antwoorden: 24, genoemd: gen, geciteerd: cit, fouten: 0, bijgewerkt: wk + 'T08:00:00.000Z', eigen_urls: cl === 'totaal' ? JSON.stringify([{ naam: SITE + '/sierbestrating-of-klinkers/', aantal: Math.max(1, cit) }, { naam: SITE + '/schutting-plaatsen/', aantal: Math.max(0, cit - 1) }]) : '[]' });
      if (i === 7) {
        for (const [cl, f] of [['Sierbestrating', 0.5], ['Schuttingen', 0.3], ['Tuinaanleg', 0.15], ['Terrasreiniging', 0.05]]) rijen.push({ klant: NAAM, week_start: wk, platform: pf, cluster: cl, antwoorden: 6, genoemd: Math.round(gen * f * 2), geciteerd: Math.round(cit * f * 2), fouten: 0, bijgewerkt: wk + 'T08:00:00.000Z', eigen_urls: '[]' });
      }
    }
  }
  return rijen;
}

function rapportRijen() {
  const maanden = [
    ['2026-10', '2026-11-04', 5120, 2860, 138, 71, 2, 'In oktober kwamen er twee blogs bij. Jullie werden bijna twee keer zo vaak getoond in Google en de eerste aanvragen kwamen binnen via de blogs over sierbestrating.'],
    ['2026-09', '2026-10-04', 2860, 1010, 71, 22, 3, 'In september stonden de eerste blogs live. Google begon ze te ontdekken en de eerste bezoekers kwamen binnen.']
  ];
  return maanden.map(([m, aangemaakt, v, vv, c, cv, nieuw, alinea]) => ({
    client_name: NAAM, maand: m, aangemaakt: aangemaakt + 'T06:00:00.000Z', periode_start: m + '-01', periode_eind: m + '-30', bron: 'search_console', voortgang: '',
    totalen: JSON.stringify({ vertoningen: v, vertoningen_vorig: vv, clicks: c, clicks_vorig: cv }),
    blogs: JSON.stringify(LIVE.slice(0, 4).map((b) => ({ titel: b[0], url: SITE + '/' + b[3] + '/', vertoningen: Math.round(b[5] * 0.6), clicks: Math.round(b[6] * 0.6) }))),
    nieuwe_blogs: JSON.stringify(LIVE.slice(nieuw === 2 ? 4 : 0, nieuw === 2 ? 6 : 3).map((b) => ({ titel: b[0], url: SITE + '/' + b[3] + '/', datum: dag(VANDAAG, -b[4]) }))),
    kansen: '[]', vooruitblik: '[]', terugblik: JSON.stringify({ alinea: [alinea] })
  }));
}

function items() {
  const mk = (id, titel, status, cluster, datum, kw, sec, extra = {}) => ({ id, titel, status, categorie: cluster, cta: '', seoTitle: titel, seoDescription: 'Lees wat je vooraf moet weten en hoe wij dit aanpakken.', publicatiedatum: datum, opmerkingenKlant: '', wordpressPostId: '', liveUrl: '', mainKeyword: kw, slug: '', secundaireKeywords: sec, zoekintentie: 'Commercieel', cluster, clicks30d: null, impressions30d: null, avgPosition30d: null, pageviews30d: null, strategieOnderbouwing: '', topKeywords30d: '', intentie: '', bestaandeUrl: '', laatstGewijzigd: VANDAAG + 'T07:00:00.000Z', ...extra });
  const lijst = [];
  LIVE.forEach((b, i) => lijst.push(mk('live-' + i, b[0], 'Gepubliceerd', b[1], dag(VANDAAG, -b[4]), b[2], '', { liveUrl: SITE + '/' + b[3] + '/' })));
  lijst.push(mk('review-1', 'Schutting vervangen: wanneer is het zover en wat komt erbij kijken?', 'Ter review', 'Schuttingen', dag(VANDAAG, 1), 'schutting vervangen', 'oude schutting verwijderen, nieuwe schutting laten plaatsen'));
  lijst.push(mk('review-2', 'Terrasreiniging voor een VvE: planning en hinder beperken', 'Ter review', 'VvE en bedrijven', dag(VANDAAG, 3), 'terrasreiniging vve', 'gemeenschappelijke buitenruimte onderhouden'));
  lijst.push(mk('gepland-1', 'Kunstgras of gazon: wat past bij jouw tuin?', 'Gepland', 'Tuinaanleg', dag(VANDAAG, 11), 'kunstgras of gazon', ''));
  lijst.push(mk('gepland-2', 'Parkeerterrein herstraten: zo plan je het werk gefaseerd', 'Gepland', 'VvE en bedrijven', dag(VANDAAG, 18), 'parkeerterrein herstraten', ''));
  lijst.push(mk('gepland-3', 'Waterdoorlatende bestrating: wat is het en wanneer kies je het?', 'Gepland', 'Sierbestrating', dag(VANDAAG, 25), 'waterdoorlatende bestrating', ''));
  return lijst;
}

const BLOG_TEKST = {
  'review-1': ['Een schutting gaat jaren mee, maar niet eeuwig. Scheve palen, rottende planken en losse onderplaten zijn tekenen dat vervanging dichterbij komt. In deze blog lees je waar je op let en wat wij doen als we een schutting vervangen.', 'Wanneer vervang je een schutting?', 'Meestal begint het bij de palen. Zijn ze zacht bij de grond of staat de schutting scheef, dan is herstel vaak niet genoeg. Wij kijken eerst naar de staat van palen, planken en onderplaten en bespreken met je wat past.', 'Wat gebeurt er met de oude schutting?', 'Wij verwijderen de oude schutting en voeren hem af, zodat je tuin schoon wordt opgeleverd. Daarna zetten we de nieuwe palen in de juiste maat en hoogte.', 'Hout of beton?', 'Hout oogt warm en is eenvoudig aan te passen. Hout-beton combineert betonpalen en onderplaten met houten schermen en is stevig bij de grond.']
};

module.exports = { NAAM, SLUG, SITE, VANDAAG, items, blogRijen, overzichtRij, wekenRijen, conversieRijen, conversieTotalen, aiRijen, rapportRijen, BLOG_TEKST, LIVE };
