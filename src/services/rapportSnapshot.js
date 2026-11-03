// Vaste snapshot voor het maandrapport. De n8n workflow "BA - Shared - Maandrapport" vraagt dit op de 4e van de maand op
// (POST /api/admin/rapporten/snapshot) en bewaart het in de kolom extra van de tabel maandrapporten.
// Zo liggen AI zichtbaarheid, opbrengst, waarde, merk, uitgevoerd werk en effecten per maand vast, en rekent het rapport
// met dezelfde regels als de tabbladen Google en AI zichtbaarheid. Oude rapporten zonder extra vallen terug op live data.

const prestaties = require('./prestaties');
const ai = require('./aiZichtbaarheid');
const { bouwEffecten } = require('./effecten');

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const SNAPSHOT_VERSIE = 1;
const PLATFORMEN = ['chatgpt', 'gemini'];
const PLATFORM_NAMEN = { chatgpt: 'ChatGPT', gemini: 'Gemini' };
const MAX_FOUT_AANDEEL = 0.2;
const MAX_VRAGEN = 30;
const TABELLEN = {
  aiSamenvatting: process.env.N8N_AI_SAMENVATTING_TABLE_ID || 'PO71b1z9NwtgTFoO',
  aiPrompts: process.env.N8N_AI_PROMPTS_TABLE_ID || 'fOe0eUDOQ7FNaL1r',
  aiMetingen: process.env.N8N_AI_METINGEN_TABLE_ID || 'IRsXYL5ndnD6Yy7m',
  aiFaq: process.env.N8N_AI_FAQ_TABLE_ID || 'kPhlO5AWU6bOmTyo',
  effecten: process.env.N8N_EFFECTEN_TABLE_ID || 'LvhL8FkJPDySGE7N',
  verbeteringen: process.env.N8N_VERBETERINGEN_TABLE_ID || 'comDCmDwMvzTSamB',
  conversieTotalen: process.env.N8N_CONVERSIE_TOTALEN_TABLE_ID || 'XPI7gsMhDIEoBc8o'
};

const num = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
const waar = (v) => v === true || String(v) === 'true';
const pct = (deel, totaal) => (totaal > 0 ? Math.round((deel / totaal) * 100) : null);

function vorigeMaand(maand) {
  const m = /^(\d{4})-(\d{2})$/.exec(maand || '');
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 2, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function volgendeMaand(maand) {
  const m = /^(\d{4})-(\d{2})$/.exec(maand || '');
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

// Zelfde regel als het AI tabblad: een meting hoort bij de week (en dus de maand) van zijn maandag.
function maandagVan(datum) {
  const d = new Date(String(datum || '').slice(0, 10) + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function parse(tekst, standaard) {
  try {
    const v = JSON.parse(tekst || '');
    return v === null || v === undefined ? standaard : v;
  } catch (err) {
    return standaard;
  }
}

// Een week hoort bij de maand waarin de maandag valt (zelfde regel als het AI tabblad).
// Een week telt alleen als beide platformen antwoorden gaven en er niet te veel fouten waren.
function wekenVanReeks(rijen, reeks) {
  const perWeek = new Map();
  for (const r of rijen || []) {
    if (!r || r.cluster !== reeks || !PLATFORMEN.includes(r.platform)) continue;
    const w = perWeek.get(r.week_start) || { weekStart: String(r.week_start || ''), platformen: {} };
    w.platformen[r.platform] = { antwoorden: num(r.antwoorden) || 0, genoemd: num(r.genoemd) || 0, geciteerd: num(r.geciteerd) || 0, fouten: num(r.fouten) || 0 };
    perWeek.set(r.week_start, w);
  }
  return [...perWeek.values()].map((w) => {
    const p = Object.values(w.platformen);
    w.compleet = p.length === PLATFORMEN.length && p.every((x) => x.antwoorden > 0 && x.fouten / (x.antwoorden + x.fouten) <= MAX_FOUT_AANDEEL);
    return w;
  }).sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

function telMaand(weken, maand) {
  const inMaand = weken.filter((w) => w.weekStart.slice(0, 7) === maand);
  const compleet = inMaand.filter((w) => w.compleet);
  if (!compleet.length) return { meting: null, onvolledig: inMaand.length };
  const per = {};
  let antwoorden = 0;
  let genoemd = 0;
  let geciteerd = 0;
  for (const w of compleet) {
    for (const id of PLATFORMEN) {
      const x = w.platformen[id];
      per[id] = per[id] || { antwoorden: 0, genoemd: 0, geciteerd: 0 };
      per[id].antwoorden += x.antwoorden;
      per[id].genoemd += x.genoemd;
      per[id].geciteerd += x.geciteerd;
      antwoorden += x.antwoorden;
      genoemd += x.genoemd;
      geciteerd += x.geciteerd;
    }
  }
  Object.keys(per).forEach((id) => { per[id].percentage = pct(per[id].genoemd, per[id].antwoorden); });
  return { meting: { weken: compleet.length, antwoorden, genoemd, geciteerd, percentage: pct(genoemd, antwoorden), per }, onvolledig: inMaand.length - compleet.length };
}

// AI zichtbaarheid van een kalendermaand. Het percentage komt uit de vaste kernvragen zodra die er zijn, net als op het
// AI tabblad. De vorige maand telt alleen mee als die op dezelfde reeks gemeten is, anders is er geen eerlijke vergelijking.
function bouwAiMaand(samenvatting, prompts, metingen, maand) {
  const rijen = samenvatting || [];
  const reeks = rijen.some((r) => r && r.cluster === 'kern') ? 'kern' : 'totaal';
  const weken = wekenVanReeks(rijen, reeks);
  const nu = telMaand(weken, maand);
  if (!nu.meting) return { status: 'niet_gemeten', reeks, wekenOnvolledig: nu.onvolledig };
  const vorig = telMaand(weken, vorigeMaand(maand)).meting;

  const kern = new Set((prompts || []).filter((p) => p && p.soort === 'kern').map((p) => String(p.prompt_id)));
  const aantalKern = (prompts || []).filter((p) => p && p.soort === 'kern' && waar(p.actief)).length;
  const vragen = ai.bouwVragenMaand(prompts, metingen, maand).slice(0, MAX_VRAGEN).map((v) => ({ ...v, kern: kern.has(String(v.id)) }));
  const vragenGesteld = new Set((metingen || []).filter((m) => m && !m.fout && maandagVan(m.datum).slice(0, 7) === maand).map((m) => String(m.prompt_id))).size;

  return {
    status: 'gemeten',
    reeks,
    aantalKernvragen: reeks === 'kern' ? aantalKern : null,
    vragenGesteld,
    nu: nu.meting,
    vorig,
    verschil: vorig ? nu.meting.percentage - vorig.percentage : null,
    wekenOnvolledig: nu.onvolledig,
    platformen: PLATFORMEN.map((id) => ({ id, label: PLATFORM_NAMEN[id] })),
    vragen
  };
}

// Aanvragen, boekingen en AI bezoeken uit conversie_totalen, alleen als de rij echt bij deze maand hoort.
function bouwOpbrengst(conversieRijen, maand, klantNaam) {
  const rij = (conversieRijen || []).find((r) => r && r.periode_type === 'maand' && String(r.periode_start || '').slice(0, 7) === maand);
  if (!rij) return null;
  const actief = waar(rij.ondersteund_actief);
  return {
    sessiesAi: num(rij.sessies_ai),
    leadsAi: num(rij.leads_ai),
    boekingenAi: num(rij.boekingen_ai),
    leadsTotaal: num(rij.leads_totaal),
    boekingenTotaal: num(rij.boekingen_totaal),
    eerderActief: actief,
    eerderLeads: actief ? num(rij.ondersteund_blog_leads) : null,
    eerderBoekingen: actief ? num(rij.ondersteund_blog_boekingen) : null,
    aiBronnen: parse(rij.ai_bronnen, []).slice(0, 5),
    woorden: prestaties.conversieWoorden(klantNaam)
  };
}

// Waarde van de klikken, zoekopdrachten op de naam en hoe ver de blogs in Google zijn. Uit dezelfde berekening als het
// Google tabblad met de periode "vorige kalendermaand". Alleen als die periode precies de maand van het rapport is.
function bouwGoogle(data, maand, klantNaam) {
  if (!data || !data.overzicht || String(data.overzicht.periode_start || '').slice(0, 7) !== maand) return null;
  const p = prestaties.bouwPrestaties({ ...data, klantNaam });
  const t = p.totalen || {};
  const merkRij = data.merk && String(data.merk.periode_start || '').slice(0, 7) === maand ? data.merk : null;
  const blogs = p.blogs || [];
  return {
    waarde: t.waarde || null,
    merk: merkRij && t.merk ? { klikken: t.merk.klikken, vertoningen: t.merk.vertoningen, klikkenVorig: t.merk.klikkenVorig, vertoningenVorig: t.merk.vertoningenVorig } : null,
    blogsGemeten: blogs.length,
    blogsGetoond: blogs.filter((b) => (b.vertoningen || 0) > 0).length,
    blogsPaginaEen: blogs.filter((b) => b.hkPositie !== null && b.hkPositie !== undefined && b.hkPositie <= 10).length,
    aiBezoekenBlogs: t.ai ? t.ai.sessiesBlogs : null
  };
}

// Wat er in de kalendermaand is gedaan.
function bouwGedaan(effectRijen, verbeterRijen, faqRijen, maand) {
  const inMaand = (d) => String(d || '').slice(0, 7) === maand;
  const aangevuld = (verbeterRijen || []).filter((r) => r && (r.status === 'geplaatst' || r.status === 'gedeeltelijk') && inMaand(r.geplaatst_op || r.besluit_op)).length;
  const internelinks = (effectRijen || []).filter((r) => r && r.soort === 'interne_link' && inMaand(r.actiedatum)).reduce((t, r) => {
    const d = parse(r.details, {});
    return t + (Number(d && d.aantal) > 0 ? Number(d.aantal) : 1);
  }, 0);
  const faq = (faqRijen || []).filter((r) => r && r.status === 'toegepast' && inMaand(r.toegepast));
  return {
    aangevuld,
    internelinks,
    faq: faq.length,
    faqVoorbeelden: faq.slice(0, 5).map((r) => ({ vraag: String(r.vraag || ''), pagina: String(r.pagina_titel || '') }))
  };
}

function maakSnapshot({ maand, klantNaam, aiAan, prestatieData, samenvatting, prompts, metingen, conversieRijen, effectRijen, verbeterRijen, faqRijen }, nu) {
  return {
    versie: SNAPSHOT_VERSIE,
    vastgelegd: nu || new Date().toISOString(),
    google: bouwGoogle(prestatieData, maand, klantNaam),
    opbrengst: bouwOpbrengst(conversieRijen, maand, klantNaam),
    ai: aiAan ? bouwAiMaand(samenvatting, prompts, metingen, maand) : null,
    gedaan: bouwGedaan(effectRijen, verbeterRijen, faqRijen, maand),
    effecten: bouwEffecten(effectRijen, verbeterRijen, maand)
  };
}

async function tabel(tabelId, filters) {
  return ai.n8nTabel(tabelId, filters);
}

// Haalt alles op voor een klant en maand. aiAan komt uit de portaalinstellingen van de klant.
async function bouwSnapshot(klantNaam, maand, { aiAan } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(maand || ''))) throw new Error('Geef een maand op als 2026-10.');
  const opKlant = [{ columnName: 'client_name', condition: 'eq', value: klantNaam }];
  const opKlantAi = [{ columnName: 'klant', condition: 'eq', value: klantNaam }];
  const vorig = vorigeMaand(maand);
  // Metingen tot en met de eerste week van de maand erna: een week die eind van de maand begint, loopt daarin door.
  const leeg = () => [];
  const [prestatieData, samenvatting, prompts, metingen, conversieRijen, effectRijen, verbeterRijen, faqRijen] = await Promise.all([
    prestaties.getPrestatiesData(klantNaam, 'maand').catch(() => null),
    aiAan ? tabel(TABELLEN.aiSamenvatting, [...opKlantAi, { columnName: 'week_start', condition: 'gte', value: `${vorig}-01` }]).catch(leeg) : [],
    aiAan ? tabel(TABELLEN.aiPrompts, opKlantAi).catch(leeg) : [],
    aiAan ? tabel(TABELLEN.aiMetingen, [...opKlantAi, { columnName: 'datum', condition: 'gte', value: `${maand}-01` }, { columnName: 'datum', condition: 'lte', value: `${volgendeMaand(maand)}-07` }]).catch(leeg) : [],
    tabel(TABELLEN.conversieTotalen, opKlant).catch(leeg),
    tabel(TABELLEN.effecten, opKlant).catch(leeg),
    tabel(TABELLEN.verbeteringen, opKlant).catch(leeg),
    tabel(TABELLEN.aiFaq, opKlantAi).catch(leeg)
  ]);
  return maakSnapshot({ maand, klantNaam, aiAan: Boolean(aiAan), prestatieData, samenvatting, prompts, metingen, conversieRijen, effectRijen, verbeterRijen, faqRijen });
}

module.exports = { bouwSnapshot, maakSnapshot, bouwAiMaand, bouwOpbrengst, bouwGoogle, bouwGedaan, wekenVanReeks, vorigeMaand, SNAPSHOT_VERSIE, N8N_BASE_URL };
