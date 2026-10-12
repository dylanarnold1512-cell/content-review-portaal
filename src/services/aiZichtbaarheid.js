// AI zichtbaarheid per klant: hoe vaak een AI assistent (ChatGPT, Gemini) het
// merk van de klant noemt en citeert. De n8n workflow "BA - AI Meting" stelt
// elke maandag vragen en bewaart de antwoorden, de workflow "BA - AI Meting
// Weeksamenvatting" rekent die om naar de data table ai_samenvatting (een rij
// per klant, week, platform en cluster, plus een rij met cluster "totaal").
// Het portaal leest alleen die samenvatting en rekent niets opnieuw uit.
//
// Wat de klant ziet: alleen het eigen merk. Concurrenten (top_merken), bronnen
// van anderen (top_bronnen), kosten en foutaantallen blijven intern, zie
// getAiIntern en het adminpaneel.

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const TABLE_ID = process.env.N8N_AI_SAMENVATTING_TABLE_ID || 'PO71b1z9NwtgTFoO';

const PROMPTS_TABLE_ID = process.env.N8N_AI_PROMPTS_TABLE_ID || 'fOe0eUDOQ7FNaL1r';
const METINGEN_TABLE_ID = process.env.N8N_AI_METINGEN_TABLE_ID || 'IRsXYL5ndnD6Yy7m';

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

function bouwWeken(rijen) {
  const perWeek = new Map();
  for (const r of rijen) {
    if (r.cluster !== 'totaal' || !PLATFORMEN.includes(r.platform)) continue;
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

// Alles wat de klant te zien krijgt. Bewust zonder merken van anderen, bronnen van anderen en kosten.
function bouwOverzicht(ruweRijen) {
  const rijen = uniekeRijen(ruweRijen);
  const weken = bouwWeken(rijen);
  const volledig = weken.filter((w) => w.compleet);
  const nieuwste = weken[weken.length - 1] || null;
  const laatste = volledig[volledig.length - 1] || null;
  const vorige = volledig.length > 1 ? volledig[volledig.length - 2] : null;

  if (!laatste) {
    return {
      status: 'leeg',
      melding: nieuwste
        ? 'De eerste meting was nog niet volledig. Zodra er een volledige week is, zie je hier de resultaten.'
        : 'De eerste meting volgt. Zodra die klaar is, zie je hier de resultaten.',
      platformen: [],
      clusters: [],
      trend: [],
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

  const clusterNamen = [...new Set(rijen.filter((r) => r.week_start === laatste.weekStart && r.cluster !== 'totaal').map((r) => r.cluster))].sort();
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
      platformen: Object.fromEntries(PLATFORMEN.map((p) => [p, { antwoorden: w.platformen[p].antwoorden, genoemd: w.platformen[p].genoemd, geciteerd: w.platformen[p].geciteerd }]))
    }))
    : [];

  const nieuwsteOnvolledig = nieuwste && !nieuwste.compleet && nieuwste.weekStart > laatste.weekStart;
  return {
    status: 'ok',
    laatsteWeek: { start: laatste.weekStart, label: weekLabel(laatste.weekStart) },
    aantalWeken: volledig.length,
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
// Alleen het eigen merk. De antwoordtekst zelf blijft weg, want daarin staan concurrenten.
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
    if (pr.actief === false) continue;
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

async function getAiVragen(klantNaam) {
  const overzicht = bouwOverzicht(await n8nRows(klantNaam));
  if (overzicht.status !== 'ok') return { status: 'leeg', vragen: [] };
  const week = overzicht.laatsteWeek;
  const klantFilter = { columnName: 'klant', condition: 'eq', value: klantNaam };
  const prompts = await n8nTabel(PROMPTS_TABLE_ID, [klantFilter]);
  let metingen;
  try {
    metingen = await n8nTabel(METINGEN_TABLE_ID, [klantFilter, { columnName: 'datum', condition: 'gte', value: week.start }]);
  } catch (err) {
    metingen = await n8nTabel(METINGEN_TABLE_ID, [klantFilter]);
  }
  return { status: 'ok', week, vragen: bouwVragen(prompts, metingen, week.start) };
}

async function getAiZichtbaarheid(klantNaam) {
  return bouwOverzicht(await n8nRows(klantNaam));
}

async function getAiIntern(klantNaam) {
  return bouwIntern(await n8nRows(klantNaam));
}

module.exports = { getAiZichtbaarheid, getAiIntern, getAiVragen, bouwOverzicht, bouwIntern, bouwVragen, weekLabel };
