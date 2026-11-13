// AI zichtbaarheid per klant: hoe vaak een AI assistent (ChatGPT, Gemini) het
// merk van de klant noemt en citeert. De n8n workflow "BA - AI Meting" stelt
// elke maandag vragen en bewaart de antwoorden, de workflow "BA - AI Meting
// Weeksamenvatting" rekent die om naar de data table ai_samenvatting (een rij
// per klant, week, platform en cluster, plus een rij met cluster "totaal").
// Het portaal leest alleen die samenvatting en rekent niets opnieuw uit.
//
// Wat de klant ziet: de cijfers van het eigen merk, en per vraag het antwoord
// van de AI zelf (daarin kunnen ook andere bedrijven staan, dat is bewust: zo
// ziet de klant bij welke vraag hij zichtbaar is). De samengevatte lijsten met
// merken van anderen (top_merken), bronnen van anderen (top_bronnen), kosten en
// foutaantallen blijven intern, zie getAiIntern.

const aiFaqService = require('./aiFaq');

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const TABLE_ID = process.env.N8N_AI_SAMENVATTING_TABLE_ID || 'PO71b1z9NwtgTFoO';

const PROMPTS_TABLE_ID = process.env.N8N_AI_PROMPTS_TABLE_ID || 'fOe0eUDOQ7FNaL1r';
const METINGEN_TABLE_ID = process.env.N8N_AI_METINGEN_TABLE_ID || 'IRsXYL5ndnD6Yy7m';
const GOOGLE_TABLE_ID = process.env.N8N_AI_GOOGLE_TABLE_ID || 'pkdY2ZoRt12SSZPT';
const KERN_WIJZIGINGEN_TABLE_ID = process.env.N8N_AI_KERN_WIJZIGINGEN_TABLE_ID || 'SeItyAsQZfNQXZ3t';
const BRON_DOMEINEN_TABLE_ID = process.env.N8N_AI_BRON_DOMEINEN_TABLE_ID || 'IfsEE7Mljx5bHDX0';
const KANSEN_TABLE_ID = process.env.N8N_KANSEN_TABLE_ID || 'C0ASGyrj8nT1zXOS';
const KOPPELINGEN_TABLE_ID = process.env.N8N_AI_VRAAG_PAGINAS_TABLE_ID || 'ZWXBXwyJNBhRbk8e';
const CLIENTS_TABLE_ID = process.env.N8N_CLIENTS_TABLE_ID || '42vYfT6ktan72bpa';
// De AI meting bewaarde eerst steeds de eerste 1500 tekens van een antwoord.
// Sinds november 2026 wordt een antwoord waarin het merk staat helemaal bewaard (tot 9000 tekens).
const OUDE_GRENS_ANTWOORD = 1500;

const PLATFORMEN = ['chatgpt', 'gemini'];
const PLATFORM_LABEL = { chatgpt: 'ChatGPT', gemini: 'Gemini' };
// Een week telt alleen mee als hooguit 10 procent van de aanroepen mislukte.
const MAX_FOUT_AANDEEL = 0.1;
// Een verschil van 2 antwoorden of minder is ruis en wordt nooit als winst of verlies getoond.
const RUIS_GRENS = 2;
const MIN_WEKEN_VOOR_TREND = 3;
const MAX_WEKEN_IN_TREND = 12;

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, AI zichtbaarheid kan niet bij n8n.');
  return key;
}

async function n8nTabel(tabelId, filters) {
  const filter = encodeURIComponent(JSON.stringify({ type: 'and', filters }));
  const alle = [];
  let cursor = '';
  for (let pagina = 0; pagina < 20; pagina += 1) {
    const url = `${N8N_BASE_URL}/api/v1/data-tables/${tabelId}/rows?limit=250&filter=${filter}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await fetch(url, { headers: { 'X-N8N-API-KEY': getApiKey(), 'Content-Type': 'application/json' } });
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (err) {
      // niet JSON, alleen relevant als res.ok ook false is
    }
    if (!res.ok) throw new Error(`n8n data table gaf een fout (${res.status}): ${data.message || raw || res.statusText}`);
    alle.push(...(data.data || []));
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return alle;
}

async function n8nRows(klantNaam) {
  return n8nTabel(TABLE_ID, [{ columnName: 'klant', condition: 'eq', value: klantNaam }]);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseLijst(tekst) {
  if (Array.isArray(tekst)) return tekst;
  try {
    const l = JSON.parse(tekst || '[]');
    return Array.isArray(l) ? l : [];
  } catch (err) {
    return [];
  }
}

function weekLabel(weekStart) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(weekStart || ''));
  if (!m) return String(weekStart || '');
  return `week van ${Number(m[3])} ${MAANDEN[Number(m[2]) - 1]} ${m[1]}`;
}

// Per klant, week, platform en cluster telt alleen de nieuwste rij.
function uniekeRijen(rijen) {
  const map = new Map();
  for (const r of rijen || []) {
    if (!r || !r.week_start || !r.platform || !r.cluster) continue;
    const sleutel = [r.week_start, r.platform, r.cluster].join('|');
    const bestaand = map.get(sleutel);
    if (!bestaand || String(r.bijgewerkt || '') >= String(bestaand.bijgewerkt || '')) map.set(sleutel, r);
  }
  return [...map.values()];
}

function platformCijfers(r) {
  return { antwoorden: num(r.antwoorden), genoemd: num(r.genoemd), geciteerd: num(r.geciteerd), fouten: num(r.fouten) };
}

// De kop van het tabblad en het verloop gebruiken de vaste kernvragen zodra
// daar cijfers van zijn. De wisselvragen veranderen elke maand en maken het
// verloop onvergelijkbaar. Zonder kernrijen (oudere metingen) geldt het totaal.
function gekozenReeks(rijen) {
  return (rijen || []).some((r) => r.cluster === 'kern') ? 'kern' : 'totaal';
}

function bouwWeken(rijen, reeks = 'totaal') {
  const perWeek = new Map();
  for (const r of rijen) {
    if (r.cluster !== reeks || !PLATFORMEN.includes(r.platform)) continue;
    const week = perWeek.get(r.week_start) || { weekStart: r.week_start, platformen: {} };
    week.platformen[r.platform] = platformCijfers(r);
    perWeek.set(r.week_start, week);
  }
  const weken = [...perWeek.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  for (const w of weken) {
    const aanwezig = Object.values(w.platformen);
    const metAntwoorden = aanwezig.filter((p) => p.antwoorden > 0).length;
    const foutAandeelOk = aanwezig.every((p) => {
      const totaal = p.antwoorden + p.fouten;
      return totaal > 0 && p.fouten / totaal <= MAX_FOUT_AANDEEL;
    });
    // Beide platformen moeten erin zitten, anders is de week niet vergelijkbaar.
    w.compleet = aanwezig.length === PLATFORMEN.length && metAntwoorden === PLATFORMEN.length && foutAandeelOk;
  }
  return weken;
}

function verschil(nu, vorig) {
  if (!vorig || !vorig.antwoorden || !nu.antwoorden) return { soort: 'geen', aantal: 0 };
  const verwacht = Math.round((vorig.genoemd * nu.antwoorden) / vorig.antwoorden);
  const d = nu.genoemd - verwacht;
  if (Math.abs(d) <= RUIS_GRENS) return { soort: 'schommeling', aantal: Math.abs(d) };
  return { soort: d > 0 ? 'meer' : 'minder', aantal: Math.abs(d) };
}

function schoneUrl(url) {
  return String(url || '').replace(/[#?].*$/, '').replace(/\/+$/, '');
}

function bouwEigenUrls(rijen, weekStart) {
  const telling = new Map();
  for (const r of rijen) {
    if (r.week_start !== weekStart || r.cluster !== 'totaal') continue;
    for (const item of parseLijst(r.eigen_urls)) {
      const url = schoneUrl(item && (item.naam || item.url));
      if (!url) continue;
      telling.set(url, (telling.get(url) || 0) + num(item.aantal || 1));
    }
  }
  return [...telling.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([url, aantal]) => ({ url, aantal }));
}

// Wanneer de kernvragen zijn aangepast: per reeksstart het aantal vervangen vragen en het aantal
// vragen dat erbij kwam, plus de datum van de laatste kwartaalcontrole. Zonder vraagteksten van de klant te tonen.
function bouwKernWijzigingen(rijen) {
  const perStart = new Map();
  const bijStart = new Map();
  let laatsteControle = '';
  for (const r of rijen || []) {
    if (!r || !r.soort) continue;
    const datum = String(r.datum || '').slice(0, 10);
    if (datum > laatsteControle) laatsteControle = datum;
    if (r.soort !== 'vervangen' && r.soort !== 'uitgebreid') continue;
    const start = String(r.reeks_start || '').slice(0, 10);
    if (!start) continue;
    const doel = r.soort === 'vervangen' ? perStart : bijStart;
    doel.set(start, (doel.get(start) || 0) + 1);
  }
  const lijst = (m) => [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([weekStart, aantal]) => ({ weekStart, aantal, label: weekLabel(weekStart) }));
  return { wijzigingen: lijst(perStart), uitbreidingen: lijst(bijStart), laatsteControle };
}

// AI kansen uit de kansentabel (soort ai_zichtbaarheid). Alleen de tekstvelden, zonder interne velden.
function bouwAiKansen(rijen) {
  const rang = { hoog: 0, middel: 1, laag: 2 };
  return (rijen || [])
    .filter((r) => r && r.soort === 'ai_zichtbaarheid' && r.signaal)
    .sort((a, b) => (rang[a.prioriteit] ?? 3) - (rang[b.prioriteit] ?? 3))
    .map((r) => ({ onderwerp: r.zoekwoord || '', prioriteit: r.prioriteit || 'laag', signaal: r.signaal, waarom: r.waarom || '', actie: r.actie || '', onderbouwing: r.onderbouwing || '' }));
}

// Alles wat de klant te zien krijgt. Bewust zonder merken van anderen, bronnen van anderen en kosten.
function bouwOverzicht(ruweRijen, opties = {}) {
  const clusterSoort = opties.clusterSoort === 'markt' ? 'markt' : 'onderwerp';
  const rijen = uniekeRijen(ruweRijen);
  const reeks = gekozenReeks(rijen);
  const weken = bouwWeken(rijen, reeks);
  const volledig = weken.filter((w) => w.compleet);
  const nieuwste = weken[weken.length - 1] || null;
  const kernInfo = bouwKernWijzigingen(opties.kernWijzigingen);
  const kansen = bouwAiKansen(opties.kansen);
  const laatste = volledig[volledig.length - 1] || null;
  const vorige = volledig.length > 1 ? volledig[volledig.length - 2] : null;

  if (!laatste) {
    return {
      status: 'leeg',
      clusterSoort,
      melding: nieuwste
        ? 'De eerste meting was nog niet volledig. Zodra er een volledige week is, zie je hier de resultaten.'
        : 'De eerste meting volgt. Zodra die klaar is, zie je hier de resultaten.',
      reeks,
      platformen: [],
      clusters: [],
      trend: [],
      kernWijzigingen: kernInfo.wijzigingen,
      kansen: [],
      eigenUrls: []
    };
  }

  const platformen = PLATFORMEN.map((p) => {
    const nu = laatste.platformen[p];
    return {
      id: p,
      label: PLATFORM_LABEL[p],
      antwoorden: nu.antwoorden,
      genoemd: nu.genoemd,
      geciteerd: nu.geciteerd,
      percentage: nu.antwoorden ? Math.round((nu.genoemd / nu.antwoorden) * 100) : 0,
      verschil: vorige ? verschil(nu, vorige.platformen[p]) : { soort: 'geen', aantal: 0 }
    };
  });

  const clusterNamen = [...new Set(rijen.filter((r) => r.week_start === laatste.weekStart && r.cluster !== 'totaal' && r.cluster !== 'kern').map((r) => r.cluster))].sort();
  const clusters = clusterNamen.map((naam) => {
    const rij = { naam, platformen: {} };
    for (const p of PLATFORMEN) {
      const r = rijen.find((x) => x.week_start === laatste.weekStart && x.cluster === naam && x.platform === p);
      if (r) rij.platformen[p] = platformCijfers(r);
    }
    return rij;
  });

  const trend = volledig.length >= MIN_WEKEN_VOOR_TREND
    ? volledig.slice(-MAX_WEKEN_IN_TREND).map((w) => ({
      weekStart: w.weekStart,
      label: weekLabel(w.weekStart),
      platformen: Object.fromEntries(PLATFORMEN.map((p) => [p, { antwoorden: w.platformen[p].antwoorden, genoemd: w.platformen[p].genoemd, geciteerd: w.platformen[p].geciteerd }])),
      kernVervangen: 0,
      kernUitgebreid: 0
    }))
    : [];
  // De markering hoort bij de eerste week in het verloop vanaf de dag dat de nieuwe kernvragen ingaan.
  for (const k of kernInfo.wijzigingen) {
    const doel = trend.find((w) => w.weekStart >= k.weekStart);
    if (doel) doel.kernVervangen += k.aantal;
  }
  for (const k of kernInfo.uitbreidingen) {
    const doel = trend.find((w) => w.weekStart >= k.weekStart);
    if (doel) doel.kernUitgebreid += k.aantal;
  }

  const nieuwsteOnvolledig = nieuwste && !nieuwste.compleet && nieuwste.weekStart > laatste.weekStart;
  return {
    status: 'ok',
    clusterSoort,
    laatsteWeek: { start: laatste.weekStart, label: weekLabel(laatste.weekStart) },
    aantalWeken: volledig.length,
    reeks,
    kernWijzigingen: kernInfo.wijzigingen,
    laatsteKernControle: kernInfo.laatsteControle,
    kansen,
    melding: nieuwsteOnvolledig ? `De meting van de ${weekLabel(nieuwste.weekStart)} was niet volledig en telt daarom niet mee.` : '',
    platformen,
    clusters,
    trend,
    eigenUrls: bouwEigenUrls(rijen, laatste.weekStart)
  };
}

// Alleen voor Advertisr: merken en bronnen die de AI noemt, en wat de meting kostte.
function bouwIntern(ruweRijen) {
  const rijen = uniekeRijen(ruweRijen);
  const weken = bouwWeken(rijen);
  if (!weken.length) return { status: 'leeg', platformen: [] };
  const volledig = weken.filter((w) => w.compleet);
  const week = volledig.length ? volledig[volledig.length - 1] : weken[weken.length - 1];
  const platformen = PLATFORMEN.map((p) => {
    const r = rijen.find((x) => x.week_start === week.weekStart && x.cluster === 'totaal' && x.platform === p);
    if (!r) return { id: p, label: PLATFORM_LABEL[p], aanwezig: false };
    return {
      id: p,
      label: PLATFORM_LABEL[p],
      aanwezig: true,
      ...platformCijfers(r),
      kosten: num(r.kosten),
      merken: parseLijst(r.top_merken),
      bronnen: parseLijst(r.top_bronnen)
    };
  });
  return { status: 'ok', week: { start: week.weekStart, label: weekLabel(week.weekStart), compleet: week.compleet }, platformen };
}

function maandagVan(datum) {
  const d = new Date(String(datum || '').slice(0, 10) + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return '';
  const dag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dag);
  return d.toISOString().slice(0, 10);
}

function parseUrls(tekst) {
  return parseLijst(tekst).map((u) => schoneUrl(typeof u === 'string' ? u : u && (u.url || u.naam))).filter(Boolean);
}

// Per vraag: werd het merk genoemd, en werd de eigen website als bron gebruikt.
// Het antwoord zelf haalt het portaal pas op als de klant op een vraag klikt (getAiAntwoord).
function bouwVragen(prompts, metingen, weekStart) {
  const perVraag = new Map();
  for (const m of metingen) {
    if (maandagVan(m.datum) !== weekStart || !PLATFORMEN.includes(m.platform)) continue;
    if (m.fout) continue;
    const rec = perVraag.get(m.prompt_id) || { chatgpt: { n: 0, genoemd: 0, geciteerd: 0 }, gemini: { n: 0, genoemd: 0, geciteerd: 0 }, urls: new Set() };
    const p = rec[m.platform];
    p.n += 1;
    if (m.genoemd === true || m.genoemd === 'true') p.genoemd += 1;
    if (m.geciteerd === true || m.geciteerd === 'true') {
      p.geciteerd += 1;
      for (const u of parseUrls(m.geciteerde_urls)) rec.urls.add(u);
    }
    perVraag.set(m.prompt_id, rec);
  }
  const rijen = [];
  for (const pr of prompts) {
    // Ook vragen die inmiddels zijn vervangen tellen mee voor de week waarin ze gemeten zijn.
    const rec = perVraag.get(pr.prompt_id);
    if (!rec) continue;
    rijen.push({
      id: pr.prompt_id,
      vraag: pr.prompt,
      onderwerp: pr.cluster || '',
      chatgpt: { metingen: rec.chatgpt.n, genoemd: rec.chatgpt.genoemd, geciteerd: rec.chatgpt.geciteerd },
      gemini: { metingen: rec.gemini.n, genoemd: rec.gemini.genoemd, geciteerd: rec.gemini.geciteerd },
      urls: [...rec.urls].slice(0, 3)
    });
  }
  // Eerst de vragen waarop het merk gevonden werd, dan de rest.
  const score = (r) => r.chatgpt.genoemd + r.gemini.genoemd;
  rijen.sort((a, b) => score(b) - score(a) || String(a.id).localeCompare(String(b.id), 'nl', { numeric: true }));
  return rijen;
}

// Wat er bewoog: per vraag de laatste week naast de week ervoor. Alleen feiten, geen oorzaak.
//   nieuw: vraag die vorige meting ook al werd gesteld, toen zonder vermelding, nu met vermelding.
//   nieuweVragen: vraag die vorige meting niet werd gesteld en nu meteen een vermelding geeft.
//   weg: vraag met vermelding vorige meting, nu zonder. blijft: aantal vragen met vermelding in beide weken.
function bouwBewegingen(prompts, metingen, weekStart) {
  const vorigeStart = (() => { const d = new Date(weekStart + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); })();
  const tel = (start) => {
    const per = new Map();
    for (const m of metingen || []) {
      if (!m || m.fout || !PLATFORMEN.includes(m.platform) || maandagVan(m.datum) !== start) continue;
      const rec = per.get(m.prompt_id) || { chatgpt: 0, gemini: 0 };
      if (waar(m.genoemd)) rec[m.platform] += 1;
      per.set(m.prompt_id, rec);
    }
    return per;
  };
  const nu = tel(weekStart);
  const vorig = tel(vorigeStart);
  const uit = { vergelijkbaar: false, vorigeLabel: weekLabel(vorigeStart), nieuw: [], nieuweVragen: [], weg: [], blijft: 0 };
  for (const pr of prompts || []) {
    const n = nu.get(pr.prompt_id);
    if (!n) continue;
    const v = vorig.get(pr.prompt_id);
    const nuGenoemd = n.chatgpt + n.gemini > 0;
    const regel = () => ({ id: pr.prompt_id, vraag: pr.prompt || '', onderwerp: pr.cluster || '', platformen: PLATFORMEN.filter((id) => n[id] > 0).map((id) => PLATFORM_LABEL[id]) });
    if (!v) { if (nuGenoemd) uit.nieuweVragen.push(regel()); continue; }
    uit.vergelijkbaar = true;
    const voorGenoemd = v.chatgpt + v.gemini > 0;
    if (nuGenoemd && !voorGenoemd) uit.nieuw.push(regel());
    else if (!nuGenoemd && voorGenoemd) uit.weg.push({ id: pr.prompt_id, vraag: pr.prompt || '', onderwerp: pr.cluster || '', platformen: PLATFORMEN.filter((id) => v[id] > 0).map((id) => PLATFORM_LABEL[id]) });
    else if (nuGenoemd && voorGenoemd) uit.blijft += 1;
  }
  const volg = (a, b) => String(a.id).localeCompare(String(b.id), 'nl', { numeric: true });
  uit.nieuw.sort(volg); uit.nieuweVragen.sort(volg); uit.weg.sort(volg);
  return uit;
}

// Bronnen staan in ai_metingen als regels "titel | url".
function parseBronnen(tekst) {
  const uit = [];
  const gezien = new Set();
  for (const regel of String(tekst || '').split('\n')) {
    const i = regel.lastIndexOf(' | ');
    const url = (i >= 0 ? regel.slice(i + 3) : regel).trim();
    if (!/^https?:\/\//i.test(url) || gezien.has(url)) continue;
    gezien.add(url);
    const titel = (i >= 0 ? regel.slice(0, i) : '').trim();
    let domein = '';
    try { domein = new URL(url).hostname.replace(/^www\./, ''); } catch (err) { domein = ''; }
    uit.push({ titel: titel || domein || url, url, domein });
  }
  return uit;
}

// Woorden waarop het merk in een antwoord gemarkeerd wordt. Zelfde regel als de
// meting in n8n (BA - AI Meting, Verwerk antwoord): de zoektermen uit
// Clients.ai_zoektermen van minimaal 6 tekens, plus het domein (ai_domein).
// Alleen als er geen van beide is, geldt de klantnaam. Een klant met een gewone
// woordnaam (zoals Trockenblumengrosshandel) krijgt alleen het domein als zoekterm.
function merkTermen(klantNaam, zoektermen, domein) {
  const termen = [];
  const voeg = (t) => {
    const schoon = String(t || '').trim();
    if (schoon.replace(/[^\p{L}\p{N}]/gu, '').length < 6) return;
    if (!termen.some((x) => x.toLowerCase() === schoon.toLowerCase())) termen.push(schoon);
  };
  String(zoektermen || '').split(',').forEach(voeg);
  voeg(String(domein || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, ''));
  if (!termen.length) voeg(klantNaam);
  return termen.sort((a, b) => b.length - a.length);
}

const waar = (v) => v === true || v === 'true';

// Het antwoord van ChatGPT en Gemini op een vraag, in een week. Per platform alle
// runs, de runs waarin het merk genoemd werd eerst.
function bouwAntwoord(prompt, metingen, weekStart, termen) {
  const platformen = PLATFORMEN.map((id) => {
    const runs = (metingen || [])
      .filter((m) => m && m.platform === id && m.prompt_id === prompt.prompt_id && maandagVan(m.datum) === weekStart && !m.fout)
      .map((m) => {
        const antwoord = String(m.antwoord_ingekort || '');
        return {
          run: num(m.run) || 1,
          datum: String(m.datum || '').slice(0, 10),
          genoemd: waar(m.genoemd),
          geciteerd: waar(m.geciteerd),
          antwoord,
          ingekort: antwoord.length === OUDE_GRENS_ANTWOORD,
          bronnen: parseBronnen(m.bronnen),
          eigenUrls: parseUrls(m.geciteerde_urls)
        };
      })
      .sort((a, b) => (Number(b.genoemd) - Number(a.genoemd)) || (a.run - b.run));
    return { id, label: PLATFORM_LABEL[id], runs };
  });
  return {
    id: prompt.prompt_id,
    vraag: prompt.prompt || '',
    onderwerp: prompt.cluster || '',
    week: { start: weekStart, label: weekLabel(weekStart) },
    termen: termen || [],
    platformen
  };
}

async function klantTermen(klantNaam) {
  try {
    const rijen = await n8nTabel(CLIENTS_TABLE_ID, [{ columnName: 'client_name', condition: 'eq', value: klantNaam }]);
    const rij = rijen[0] || {};
    return merkTermen(klantNaam, rij.ai_zoektermen, rij.ai_domein);
  } catch (err) {
    return merkTermen(klantNaam, '', '');
  }
}

// Bronnen die AI in de antwoorden aanhaalt, omgezet in acties. Het soort bron (overzichtssite, platform,
// media, overheid, aanbieder) komt uit ai_bron_domeinen, die de workflow "BA - AI Meting Bronnen Indelen" vult.
// Op websites van andere aanbieders kunnen we niets doen, die tonen we alleen als context.
const BRON_DAGEN = 28;
const BRON_MIN_ANTWOORDEN = 3;
const BRON_MAX_KANSEN = 8;
const BRON_SOORTEN = {
  overzichtssite: { label: 'Overzichtssite', tip: 'Op een overzichtssite kunnen jullie meestal zelf een vermelding aanvragen. Dat kunnen wij niet voor jullie regelen.' },
  platform: { label: 'Platform', tip: 'Een compleet en actueel profiel op dit platform helpt, met foto\'s, omschrijving en recente reviews. Dit beheren jullie zelf.' },
  media: { label: 'Media of blog', tip: '' },
  overheid: { label: 'Organisatie', tip: '' }
};
// Wat wij bij een vraag doen, afgeleid van wat er al in het systeem staat (FAQ status en koppeling aan een pagina).
const BRON_VRAAG_STATUS = {
  staat: 'Het antwoord staat inmiddels als veelgestelde vraag op jullie website',
  komt: 'Het antwoord wordt als veelgestelde vraag aan jullie website toegevoegd',
  pagina: 'Wij beoordelen of dit antwoord op een bestaande pagina van jullie kan',
  nieuw: 'Wij beoordelen of hier een nieuw onderwerp voor komt'
};
const BRON_MAX_VRAGEN = 3;

function domeinVan(url) {
  const m = String(url || '').trim().match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
}

function bouwBronnen(metingen, domeinen, eigenDomein, ctx = {}) {
  const vraagTekst = new Map();
  for (const p of ctx.prompts || []) if (p && p.prompt_id) vraagTekst.set(String(p.prompt_id), String(p.prompt || '').trim());
  const koppel = new Map();
  for (const k of ctx.koppelingen || []) if (k && k.prompt_id) koppel.set(String(k.prompt_id), k);
  const faq = ctx.faqStatus || {};
  const statusVan = (id) => {
    const f = faq[String(id)] && faq[String(id)].status;
    if (f === 'toegepast') return 'staat';
    if (f === 'goedgekeurd') return 'komt';
    const k = koppel.get(String(id));
    if (k && k.oordeel === 'past') return 'pagina';
    if (k && k.oordeel === 'geen') return 'nieuw';
    return '';
  };
  const eigen = String(eigenDomein || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const soortVan = new Map();
  for (const d of domeinen || []) if (d && d.domein) soortVan.set(String(d.domein).toLowerCase(), String(d.soort || ''));
  const perDomein = new Map();
  let antwoorden = 0;
  for (const m of metingen || []) {
    if (!m || m.fout) continue;
    const bronnen = parseBronnen(m.bronnen);
    if (!bronnen.length) continue;
    antwoorden += 1;
    const gezien = new Set();
    for (const b of bronnen) {
      const dom = domeinVan(b.url);
      if (!dom || gezien.has(dom)) continue;
      if (eigen && (dom === eigen || dom.endsWith('.' + eigen))) continue;
      gezien.add(dom);
      const rec = perDomein.get(dom) || { domein: dom, antwoorden: 0, vragen: new Set(), perVraag: new Map(), genoemd: 0, url: schoneUrl(b.url), titel: b.titel };
      rec.antwoorden += 1;
      rec.vragen.add(m.prompt_id);
      const pv = rec.perVraag.get(m.prompt_id) || { n: 0, genoemd: 0 };
      pv.n += 1;
      if (waar(m.genoemd)) { rec.genoemd += 1; pv.genoemd += 1; }
      rec.perVraag.set(m.prompt_id, pv);
      perDomein.set(dom, rec);
    }
  }
  if (!antwoorden) return { status: 'leeg', dagen: BRON_DAGEN, antwoorden: 0, kansen: [], aanbieders: [] };
  const lijst = [...perDomein.values()].filter((r) => r.antwoorden >= BRON_MIN_ANTWOORDEN).sort((a, b) => b.antwoorden - a.antwoorden);
  const metSoort = lijst.map((r) => ({ ...r, soort: soortVan.get(r.domein) || '' }));
  const ingedeeld = metSoort.some((r) => r.soort);
  const kansen = metSoort
    .filter((r) => BRON_SOORTEN[r.soort])
    .slice(0, BRON_MAX_KANSEN)
    .map((r) => {
      // Vragen waarbij het merk niet genoemd werd eerst, want daar valt iets te winnen.
      const vragenLijst = [...r.perVraag.entries()]
        .filter(([id]) => vraagTekst.get(String(id)))
        .sort((a, b) => (a[1].genoemd > 0) - (b[1].genoemd > 0) || b[1].n - a[1].n)
        .slice(0, BRON_MAX_VRAGEN)
        .map(([id, v]) => { const st = statusVan(id); return { id, vraag: vraagTekst.get(String(id)), genoemd: v.genoemd > 0, status: st, statusTekst: BRON_VRAAG_STATUS[st] || '' }; });
      return { domein: r.domein, soort: r.soort, label: BRON_SOORTEN[r.soort].label, antwoorden: r.antwoorden, vragen: r.vragen.size, genoemd: r.genoemd, url: r.url, titel: r.titel, tip: BRON_SOORTEN[r.soort].tip, vragenLijst };
    });
  const aanbieders = metSoort
    .filter((r) => (ingedeeld ? r.soort === 'aanbieder' : true))
    .slice(0, 5)
    .map((r) => ({ domein: r.domein, antwoorden: r.antwoorden, vragen: r.vragen.size }));
  return { status: ingedeeld ? 'ok' : 'indeling_volgt', dagen: BRON_DAGEN, antwoorden, kansen, aanbieders };
}

async function getAiBronnen(klantNaam) {
  const dag = new Date(Date.now() - BRON_DAGEN * 86400000).toISOString().slice(0, 10);
  const klantFilter = { columnName: 'klant', condition: 'eq', value: klantNaam };
  const [metingen, domeinen, klantRijen, prompts, koppelingen, faqRijen] = await Promise.all([
    n8nTabel(METINGEN_TABLE_ID, [klantFilter, { columnName: 'datum', condition: 'gte', value: dag }]),
    optioneleTabel(BRON_DOMEINEN_TABLE_ID, [{ columnName: 'domein', condition: 'neq', value: '' }]),
    optioneleTabel(CLIENTS_TABLE_ID, [{ columnName: 'client_name', condition: 'eq', value: klantNaam }]),
    optioneleTabel(PROMPTS_TABLE_ID, [klantFilter]),
    optioneleTabel(KOPPELINGEN_TABLE_ID, [klantFilter]),
    optioneleTabel(aiFaqService.TABLE_ID, [klantFilter])
  ]);
  let faqStatus = {};
  try { faqStatus = aiFaqService.statusPerVraag(faqRijen); } catch (err) { /* geen FAQ status, de bronnen blijven staan */ }
  return bouwBronnen(metingen, domeinen, (klantRijen[0] || {}).ai_domein, { prompts, koppelingen, faqStatus });
}

async function getAiAntwoord(klantNaam, promptId) {
  const overzicht = bouwOverzicht(await n8nRows(klantNaam));
  if (overzicht.status !== 'ok') return { status: 'leeg' };
  const week = overzicht.laatsteWeek;
  const klantFilter = { columnName: 'klant', condition: 'eq', value: klantNaam };
  const idFilter = { columnName: 'prompt_id', condition: 'eq', value: String(promptId) };
  const [prompts, metingen, termen] = await Promise.all([
    n8nTabel(PROMPTS_TABLE_ID, [klantFilter, idFilter]),
    n8nTabel(METINGEN_TABLE_ID, [klantFilter, idFilter, { columnName: 'datum', condition: 'gte', value: week.start }]),
    klantTermen(klantNaam)
  ]);
  const prompt = prompts[0];
  if (!prompt) return { status: 'onbekend' };
  return { status: 'ok', ...bouwAntwoord(prompt, metingen, week.start, termen) };
}

// Voor het maandrapport: bij welke vragen noemde AI het merk in deze kalendermaand.
// Telt alleen metingen uit weken die in die maand beginnen, net als de cijfers in het rapport.
function bouwVragenMaand(prompts, metingen, maand) {
  const perVraag = new Map();
  for (const m of metingen || []) {
    if (!m || !waar(m.genoemd) || m.fout || !PLATFORMEN.includes(m.platform)) continue;
    if (maandagVan(m.datum).slice(0, 7) !== maand) continue;
    const rec = perVraag.get(m.prompt_id) || { chatgpt: 0, gemini: 0, geciteerd: 0 };
    rec[m.platform] += 1;
    if (waar(m.geciteerd)) rec.geciteerd += 1;
    perVraag.set(m.prompt_id, rec);
  }
  const vragen = [];
  for (const pr of prompts || []) {
    const rec = perVraag.get(pr.prompt_id);
    if (!rec) continue;
    vragen.push({ id: pr.prompt_id, vraag: pr.prompt || '', onderwerp: pr.cluster || '', chatgpt: rec.chatgpt, gemini: rec.gemini, geciteerd: rec.geciteerd, totaal: rec.chatgpt + rec.gemini });
  }
  vragen.sort((a, b) => b.totaal - a.totaal || String(a.vraag).localeCompare(String(b.vraag), 'nl'));
  return vragen;
}

function maandGrenzen(maand) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(maand || ''));
  if (!m) return null;
  // Een week die op de laatste maandag van de maand begint, kan in de volgende maand doorlopen.
  return { van: `${maand}-01`, tot: `${maand}-31` };
}

// Een afgesloten maand verandert niet meer, dus die bewaren we in het geheugen.
// Zo hoeft het rapport de metingen van een maand maar een keer op te halen.
const vragenMaandCache = new Map();

async function getAiVragenMaand(klantNaam, maand, vandaag = new Date().toISOString().slice(0, 7)) {
  const grens = maandGrenzen(maand);
  if (!grens) return { maand, vragen: [] };
  const sleutel = `${klantNaam}|${maand}`;
  if (vragenMaandCache.has(sleutel)) return vragenMaandCache.get(sleutel);
  const klantFilter = { columnName: 'klant', condition: 'eq', value: klantNaam };
  const [prompts, metingen] = await Promise.all([
    n8nTabel(PROMPTS_TABLE_ID, [klantFilter]),
    n8nTabel(METINGEN_TABLE_ID, [klantFilter, { columnName: 'datum', condition: 'gte', value: grens.van }, { columnName: 'datum', condition: 'lte', value: grens.tot }])
  ]);
  const uitkomst = { maand, vragen: bouwVragenMaand(prompts, metingen, maand) };
  if (maand < vandaag) vragenMaandCache.set(sleutel, uitkomst);
  return uitkomst;
}

async function getAiVragen(klantNaam) {
  const overzicht = bouwOverzicht(await n8nRows(klantNaam));
  if (overzicht.status !== 'ok') return { status: 'leeg', vragen: [] };
  const week = overzicht.laatsteWeek;
  const klantFilter = { columnName: 'klant', condition: 'eq', value: klantNaam };
  const prompts = await n8nTabel(PROMPTS_TABLE_ID, [klantFilter]);
  // Vanaf de week ervoor, zodat we kunnen laten zien wat er bewoog.
  const van = (() => { const d = new Date(week.start + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); })();
  let metingen;
  try {
    metingen = await n8nTabel(METINGEN_TABLE_ID, [klantFilter, { columnName: 'datum', condition: 'gte', value: van }]);
  } catch (err) {
    metingen = await n8nTabel(METINGEN_TABLE_ID, [klantFilter]);
  }
  return { status: 'ok', week, vragen: bouwVragen(prompts, metingen, week.start), bewegingen: bouwBewegingen(prompts, metingen, week.start) };
}

// Google AI Overviews: eigen tabel, los van ChatGPT en Gemini. Geen overzicht bij een zoekopdracht
// is geen fout en telt niet als "niet genoemd": we tellen apart bij hoeveel vragen Google een
// overzicht toont en in hoeveel daarvan het merk staat.
function bouwGoogle(prompts, metingen) {
  const perWeek = new Map();
  for (const m of metingen || []) {
    if (!m || m.fout || !m.prompt_id || !m.datum) continue;
    const w = maandagVan(m.datum);
    if (!w) continue;
    const week = perWeek.get(w) || new Map();
    // Per vraag telt de nieuwste meting in die week.
    week.set(m.prompt_id, m);
    perWeek.set(w, week);
  }
  const weken = [...perWeek.keys()].sort();
  if (!weken.length) return { status: 'leeg', trend: [], vragen: [] };
  const cijfers = (week) => {
    const rijen = [...week.values()];
    const met = rijen.filter((r) => waar(r.overzicht_getoond));
    return { vragen: rijen.length, metOverzicht: met.length, genoemd: met.filter((r) => waar(r.genoemd)).length, geciteerd: met.filter((r) => waar(r.geciteerd)).length };
  };
  const trend = weken.slice(-8).map((w) => ({ weekStart: w, label: weekLabel(w), ...cijfers(perWeek.get(w)) }));
  const laatste = weken[weken.length - 1];
  const naam = new Map((prompts || []).map((p) => [p.prompt_id, p]));
  const vragen = [...perWeek.get(laatste).values()]
    .filter((r) => waar(r.overzicht_getoond))
    .map((r) => {
      const pr = naam.get(r.prompt_id) || {};
      return { id: r.prompt_id, vraag: pr.prompt || '', onderwerp: pr.cluster || '', genoemd: waar(r.genoemd), geciteerd: waar(r.geciteerd), url: schoneUrl(String(r.geciteerde_urls || '').split('\n').map((u) => u.trim()).find((u) => /^https?:\/\//i.test(u)) || '') };
    })
    .sort((a, b) => (Number(b.genoemd) - Number(a.genoemd)) || (Number(b.geciteerd) - Number(a.geciteerd)) || String(a.vraag).localeCompare(String(b.vraag), 'nl'));
  const vorige = trend.length > 1 ? trend[trend.length - 2] : null;
  return { status: 'ok', week: { start: laatste, label: weekLabel(laatste) }, nu: trend[trend.length - 1], vorige, trend, vragen };
}

async function getAiGoogle(klantNaam) {
  const klantFilter = { columnName: 'klant', condition: 'eq', value: klantNaam };
  const metingen = await optioneleTabel(GOOGLE_TABLE_ID, [klantFilter]);
  if (!metingen.length) return { status: 'leeg', trend: [], vragen: [] };
  const prompts = await optioneleTabel(PROMPTS_TABLE_ID, [klantFilter]);
  return bouwGoogle(prompts, metingen);
}

// Kernwijzigingen en kansen zijn extra: lukt het ophalen niet (tabel bestaat nog niet), dan blijft de rest werken.
async function optioneleTabel(tabelId, filters) {
  try {
    return await n8nTabel(tabelId, filters);
  } catch (err) {
    return [];
  }
}

// Kansen per vraag: vragen waarbij AI het merk in de laatste week nergens noemde.
// Het oordeel "past" (de site heeft een pagina over dit onderwerp) of "geen" (nog geen pagina) komt uit ai_vraag_paginas,
// die de workflow "BA - AI Meting Vraag Koppeling" elke week vult. Alleen die twee oordelen worden een kans.
const VRAAGKANS_MAX_PAGINA = 5;
const VRAAGKANS_MAX_NIEUW = 2;
const VRAAGKANS_MAX_PER_ONDERWERP = 2;
const VRAAGKANS_MIN_METINGEN = 2;

function veiligeUrl(url) {
  const u = String(url || '').trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : '';
}

function bouwVraagKansen(vragen, prompts, koppelingen, weekStart, faqStatus) {
  const koppel = new Map();
  for (const k of koppelingen || []) if (k && k.prompt_id) koppel.set(String(k.prompt_id), k);
  const kern = new Set((prompts || []).filter((p) => p && p.soort === 'kern' && (p.actief === true || p.actief === 'true')).map((p) => String(p.prompt_id)));
  const week = weekLabel(weekStart);
  const kandidaten = [];
  for (const v of vragen || []) {
    const metingen = v.chatgpt.metingen + v.gemini.metingen;
    if (metingen < VRAAGKANS_MIN_METINGEN) continue;
    if (v.chatgpt.genoemd + v.gemini.genoemd > 0) continue;
    const k = koppel.get(String(v.id));
    if (!k) continue;
    const url = veiligeUrl(k.pagina_url);
    if (k.oordeel === 'past' && url) kandidaten.push({ v, metingen, url, titel: String(k.pagina_titel || '').trim(), nieuw: false, kern: kern.has(String(v.id)) });
    else if (k.oordeel === 'geen') kandidaten.push({ v, metingen, url: '', titel: '', nieuw: true, kern: kern.has(String(v.id)) });
  }
  // Vaste kernvragen eerst, daarna op volgorde van de vraag. Per onderwerp maximaal twee, zodat de kansen verspreid zijn.
  kandidaten.sort((a, b) => (Number(b.kern) - Number(a.kern)) || String(a.v.id).localeCompare(String(b.v.id), 'nl', { numeric: true }));
  const perOnderwerp = new Map();
  let nPagina = 0;
  let nNieuw = 0;
  const gekozen = [];
  for (const c of kandidaten) {
    if (c.nieuw ? nNieuw >= VRAAGKANS_MAX_NIEUW : nPagina >= VRAAGKANS_MAX_PAGINA) continue;
    const sleutel = c.v.onderwerp || '';
    if ((perOnderwerp.get(sleutel) || 0) >= VRAAGKANS_MAX_PER_ONDERWERP) continue;
    perOnderwerp.set(sleutel, (perOnderwerp.get(sleutel) || 0) + 1);
    if (c.nieuw) nNieuw += 1; else nPagina += 1;
    gekozen.push(c);
  }
  return gekozen.map((c) => {
    const faq = (faqStatus && faqStatus[String(c.v.id)] && faqStatus[String(c.v.id)].status) || '';
    const eigenBron = c.v.chatgpt.geciteerd + c.v.gemini.geciteerd;
    const onderbouwing = `AI meting, ${week}: 0 van ${c.metingen} antwoorden (ChatGPT en Gemini samen) noemen het merk.` +
      (eigenBron ? ` De website werd in ${eigenBron} van deze antwoorden wel als bron getoond.` : '') +
      (c.url ? ` Gekoppelde pagina: ${c.url}` : '');
    return {
      vraagId: c.v.id,
      vraag: c.v.vraag,
      prioriteit: c.nieuw ? 'laag' : (c.kern ? 'hoog' : 'middel'),
      signaal: `Bij de vraag "${c.v.vraag}" noemt AI jullie merk in geen van de ${c.metingen} antwoorden.`,
      waarom: c.nieuw
        ? 'We vonden op jullie website geen pagina die deze vraag duidelijk beantwoordt.'
        : `Op jullie website staat al een pagina die bij dit onderwerp past${c.titel ? `: "${c.titel}"` : ''}. AI noemt jullie merk bij deze vraag toch niet.`,
      faqStatus: faq === 'toegepast' || faq === 'goedgekeurd' ? faq : '',
      actie: faq === 'toegepast'
        ? 'Het antwoord op deze vraag staat inmiddels als korte veelgestelde vraag op de pagina. We meten of AI jullie merk hierna vaker noemt. Er is geen garantie.'
        : faq === 'goedgekeurd'
          ? 'Het antwoord op deze vraag wordt als korte veelgestelde vraag aan de pagina toegevoegd. Er is geen garantie dat AI jullie merk daarna noemt.'
          : c.nieuw
        ? 'Advertisr beoordeelt of hier een nieuw onderwerp voor komt. Er is geen garantie dat AI jullie merk daarna noemt.'
        : 'Advertisr beoordeelt of het antwoord op deze vraag, bijvoorbeeld als korte veelgestelde vraag, in deze pagina kan worden toegevoegd. Er is geen garantie dat AI jullie merk daarna noemt.',
      onderbouwing,
      pagina: c.nieuw ? null : { titel: c.titel || c.url.replace(/^https?:\/\/(www\.)?/, ''), url: c.url }
    };
  });
}

async function getVraagKansen(klantNaam, overzicht) {
  try {
    if (!overzicht || overzicht.status !== 'ok') return [];
    const koppelingen = await optioneleTabel(KOPPELINGEN_TABLE_ID, [{ columnName: 'klant', condition: 'eq', value: klantNaam }]);
    if (!koppelingen.length) return [];
    const weekStart = overzicht.laatsteWeek.start;
    const klantFilter = { columnName: 'klant', condition: 'eq', value: klantNaam };
    const [prompts, metingen] = await Promise.all([
      n8nTabel(PROMPTS_TABLE_ID, [klantFilter]),
      n8nTabel(METINGEN_TABLE_ID, [klantFilter, { columnName: 'datum', condition: 'gte', value: weekStart }])
    ]);
    let faqStatus = {};
    try {
      faqStatus = aiFaqService.statusPerVraag(await optioneleTabel(aiFaqService.TABLE_ID, [klantFilter]));
    } catch (err) { /* geen FAQ voorstellen beschikbaar, de kans blijft gewoon staan */ }
    return bouwVraagKansen(bouwVragen(prompts, metingen, weekStart), prompts, koppelingen, weekStart, faqStatus);
  } catch (err) {
    return [];
  }
}

async function getAiZichtbaarheid(klantNaam, opties = {}) {
  const [rijen, kernWijzigingen, kansen] = await Promise.all([
    n8nRows(klantNaam),
    optioneleTabel(KERN_WIJZIGINGEN_TABLE_ID, [{ columnName: 'klant', condition: 'eq', value: klantNaam }]),
    optioneleTabel(KANSEN_TABLE_ID, [{ columnName: 'client_name', condition: 'eq', value: klantNaam }, { columnName: 'soort', condition: 'eq', value: 'ai_zichtbaarheid' }])
  ]);
  const overzicht = bouwOverzicht(rijen, { ...opties, kernWijzigingen, kansen });
  if (overzicht.status === 'ok') overzicht.vraagKansen = await getVraagKansen(klantNaam, overzicht);
  return overzicht;
}

async function getAiIntern(klantNaam) {
  return bouwIntern(await n8nRows(klantNaam));
}

module.exports = { getAiBronnen, bouwBronnen, n8nTabel, schoneUrl, getAiZichtbaarheid, getAiIntern, getAiVragen, getAiGoogle, bouwGoogle, getAiAntwoord, getAiVragenMaand, bouwOverzicht, bouwIntern, bouwVragen, bouwBewegingen, bouwAntwoord, bouwVragenMaand, parseBronnen, merkTermen, bouwKernWijzigingen, bouwAiKansen, bouwVraagKansen, weekLabel };
