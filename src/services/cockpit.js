// Cockpit: één overzicht van alle klanten met per klant een kleur (rood, oranje, groen).
// Beheer op uitzondering: Dylan opent alleen de klanten die rood of oranje zijn.
//
// Stap 1 (27-10-2026): het techniek signaal. Bronnen:
//   1. Notion contentplanning per klant: blogs op Fout, vastgelopen in generatie, te laat,
//      planning die leegloopt en hoe lang geleden de laatste publicatie was.
//   2. n8n uitvoeringen (public API, header X-N8N-API-KEY): mislukte runs in de laatste 7 dagen
//      en workflows met een schema die niet meer draaien.
//   3. De Clients tabel in n8n: de kritieke punten uit de controle voor livegang (alleen Shared klanten).
// Elk signaal heeft een soort (techniek, later ook kwaliteit, data en klant), zodat de volgende
// stappen er alleen signalen bij hoeven te zetten.

const { clients, getClient } = require('../config/clients');
const settingsService = require('./settings');
const workflowGegevens = require('./workflowGegevens');

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const CACHE_MS = 10 * 60 * 1000;
const UUR = 60 * 60 * 1000;
const DAG = 24 * UUR;

// Klanten met eigen workflows (naam "BA - BCU - ..." en "BA - PPE - ..."). Alle andere BA workflows zijn gedeeld.
const EIGEN_WORKFLOWS = { BCU: 'basecamp-utrecht', PPE: 'ppe' };

const DREMPELS = {
  vastgelopenUren: 6, // langer dan dit op In generatie = vastgelopen
  teLaatDagen: 2, // Gepland met een publicatiedatum die al zoveel dagen voorbij is
  planningVooruitDagen: 21, // zoveel dagen vooruit moet er minstens één blog klaarstaan
  stilDagen: 21, // geen publicatie in zoveel dagen = oranje
  foutRoodUren: 48 // een mislukte run in de laatste 48 uur is rood, ouder (tot 7 dagen) oranje
};

const NIVEAU_GEWICHT = { rood: 3, oranje: 2, info: 1 };

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, dus de cockpit kan n8n niet lezen.');
  return key;
}

async function n8nGet(pad) {
  const res = await fetch(`${N8N_BASE_URL}/api/v1${pad}`, { headers: { 'X-N8N-API-KEY': getApiKey() } });
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (err) { /* geen JSON */ }
  if (!res.ok) throw new Error(`n8n gaf een fout (${res.status}): ${data.message || res.statusText}`);
  return data;
}

// ---- Pure functies (getest in test/cockpit.test.js) ----

function klantVanWorkflow(naam) {
  const m = /^BA - (BCU|PPE) - /.exec(String(naam || ''));
  return m ? EIGEN_WORKFLOWS[m[1]] : null;
}

function isBlogWorkflow(naam) {
  return /^BA - /.test(String(naam || '')) && !/^BA - Test - /.test(String(naam || ''));
}

// Hoeveel uur er maximaal tussen twee runs van een geplande workflow mag zitten. null = geen schema of onbekend.
function verwachtInterval(workflow) {
  const triggers = (workflow.nodes || []).filter((n) => n.type === 'n8n-nodes-base.scheduleTrigger' && !n.disabled);
  if (!triggers.length) return null;
  let kortste = null;
  for (const t of triggers) {
    const regels = (((t.parameters || {}).rule || {}).interval) || [{}];
    for (const r of regels) {
      const veld = r.field || 'days';
      let uren = null;
      if (veld === 'seconds' || veld === 'minutes') uren = 1;
      else if (veld === 'hours') uren = Number(r.hoursInterval) || 1;
      else if (veld === 'days') uren = 24 * (Number(r.daysInterval) || 1);
      else if (veld === 'weeks') uren = 168 * (Number(r.weeksInterval) || 1);
      else if (veld === 'months') uren = 744 * (Number(r.monthsInterval) || 1);
      else if (veld === 'cronExpression') uren = cronInterval(r.expression);
      if (uren && (kortste === null || uren < kortste)) kortste = uren;
    }
  }
  return kortste;
}

function cronInterval(expressie) {
  const delen = String(expressie || '').trim().split(/\s+/);
  if (delen.length < 5) return null;
  const [min, uur, dag, , weekdag] = delen.length === 6 ? delen.slice(1) : delen;
  if (dag !== '*' && dag !== '?') return 744;
  if (weekdag !== '*' && weekdag !== '?' && !/[-,]/.test(weekdag)) return 168;
  if (uur === '*' || /\//.test(uur)) return 1;
  if (min === '*') return 1;
  return 24;
}

// Mag een workflow nog draaien? Ruime marge: twee keer het interval plus een paar uur.
function isStilgevallen(intervalUren, laatsteSucces, nu) {
  if (!intervalUren || !laatsteSucces) return false;
  const marge = intervalUren * 2 * UUR + 3 * UUR;
  return nu - new Date(laatsteSucces).getTime() > marge;
}

function dagenGeleden(iso, nu) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((nu - t) / DAG);
}

function datumNl(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' });
}

function meervoud(n, een, meer) { return `${n} ${n === 1 ? een : meer}`; }

// Signalen uit de Notion contentplanning. blogs: [{ titel, status, publicatiedatum, laatstGewijzigd }]
function blogSignalen(blogs, { statussen, blogsPerMaand, nu }) {
  const s = {
    fout: 'Fout',
    generatie: statussen.generating || 'In generatie',
    gepland: statussen.planned || 'Gepland',
    idee: statussen.idea || 'Idee',
    gepubliceerd: statussen.published || 'Gepubliceerd',
    review: statussen.review || 'Ter review',
    goedgekeurd: statussen.approved || 'Goedgekeurd'
  };
  const signalen = [];
  const voeg = (niveau, tekst, details) => signalen.push({ soort: 'techniek', niveau, tekst, details: details || [] });
  const vandaag = new Date(nu); vandaag.setUTCHours(0, 0, 0, 0);

  const fout = blogs.filter((b) => b.status === s.fout);
  if (fout.length) voeg('rood', `${meervoud(fout.length, 'blog staat', 'blogs staan')} op Fout`, fout.map((b) => b.titel));

  const vast = blogs.filter((b) => b.status === s.generatie && nu - new Date(b.laatstGewijzigd).getTime() > DREMPELS.vastgelopenUren * UUR);
  if (vast.length) voeg('rood', `${meervoud(vast.length, 'blog hangt', 'blogs hangen')} al langer dan ${DREMPELS.vastgelopenUren} uur op ${s.generatie}`, vast.map((b) => b.titel));

  const teLaat = blogs.filter((b) => b.status === s.gepland && b.publicatiedatum && (vandaag.getTime() - new Date(b.publicatiedatum).getTime()) > DREMPELS.teLaatDagen * DAG);
  if (teLaat.length) voeg('oranje', `${meervoud(teLaat.length, 'geplande blog is', 'geplande blogs zijn')} niet geschreven terwijl de datum voorbij is`, teLaat.map((b) => `${b.titel} (${datumNl(b.publicatiedatum)})`));

  if (blogsPerMaand !== 0) {
    const grens = vandaag.getTime() + DREMPELS.planningVooruitDagen * DAG;
    const komend = blogs.filter((b) => [s.gepland, s.generatie, s.review, s.goedgekeurd].includes(b.status) && b.publicatiedatum && new Date(b.publicatiedatum).getTime() >= vandaag.getTime() && new Date(b.publicatiedatum).getTime() <= grens);
    const openstaand = blogs.filter((b) => [s.generatie, s.review, s.goedgekeurd].includes(b.status));
    if (!komend.length && !openstaand.length) voeg('oranje', `Geen blog gepland in de komende ${DREMPELS.planningVooruitDagen} dagen`);
  }

  const gepubliceerd = blogs.filter((b) => b.status === s.gepubliceerd && b.publicatiedatum).map((b) => b.publicatiedatum).sort();
  const laatste = gepubliceerd[gepubliceerd.length - 1] || null;
  const dagen = dagenGeleden(laatste, nu);
  if (!laatste) voeg('info', 'Nog geen gepubliceerde blog');
  else if (dagen > DREMPELS.stilDagen) voeg('oranje', `Laatste publicatie was ${dagen} dagen geleden (${datumNl(laatste)})`);

  return { signalen, laatstePublicatie: laatste };
}

// Mislukte runs groeperen per workflow. fouten: [{ workflowId, workflowNaam, id, startedAt, bericht, node }]
function foutSignalen(fouten, nu) {
  const perWorkflow = new Map();
  for (const f of fouten) {
    if (!perWorkflow.has(f.workflowId)) perWorkflow.set(f.workflowId, []);
    perWorkflow.get(f.workflowId).push(f);
  }
  const signalen = [];
  for (const [workflowId, lijst] of perWorkflow) {
    lijst.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    const laatste = lijst[0];
    const recent = nu - new Date(laatste.startedAt).getTime() <= DREMPELS.foutRoodUren * UUR;
    const uitleg = laatste.bericht ? `${laatste.node ? laatste.node + ': ' : ''}${laatste.bericht}` : '';
    signalen.push({
      soort: 'techniek',
      niveau: recent ? 'rood' : 'oranje',
      tekst: `${laatste.workflowNaam}: ${meervoud(lijst.length, 'mislukte run', 'mislukte runs')} in 7 dagen, laatste ${datumNl(laatste.startedAt)}`,
      details: uitleg ? [uitleg.slice(0, 300)] : [],
      link: `${N8N_BASE_URL}/workflow/${workflowId}/executions/${laatste.id}`
    });
  }
  return signalen;
}

function stilSignalen(stil) {
  return stil.map((w) => ({
    soort: 'techniek',
    niveau: 'rood',
    tekst: `${w.naam} draait niet meer: laatste geslaagde run ${datumNl(w.laatsteSucces)}`,
    details: [],
    link: `${N8N_BASE_URL}/workflow/${w.id}/executions`
  }));
}

function kleurVan(signalen) {
  if (signalen.some((s) => s.niveau === 'rood')) return 'rood';
  if (signalen.some((s) => s.niveau === 'oranje')) return 'oranje';
  return 'groen';
}

function sorteerKlanten(rijen) {
  const volgorde = { rood: 0, oranje: 1, groen: 2, uit: 3 };
  return rijen.slice().sort((a, b) => (volgorde[a.kleur] - volgorde[b.kleur]) || a.naam.localeCompare(b.naam, 'nl'));
}

function sorteerSignalen(signalen) {
  return signalen.slice().sort((a, b) => NIVEAU_GEWICHT[b.niveau] - NIVEAU_GEWICHT[a.niveau]);
}

// ---- Ophalen ----

async function alleBlogs(config) {
  const { listAllPages } = require('./notion');
  return listAllPages(config.id);
}

async function alleWorkflows() {
  const lijst = [];
  let cursor = '';
  for (let i = 0; i < 5; i++) {
    const data = await n8nGet(`/workflows?active=true&limit=250${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    lijst.push(...(data.data || []));
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return lijst.filter((w) => isBlogWorkflow(w.name));
}

async function recenteFouten(workflows, nu) {
  const namen = new Map(workflows.map((w) => [w.id, w.name]));
  const grens = nu - 7 * DAG;
  const fouten = [];
  let cursor = '';
  for (let i = 0; i < 4; i++) {
    const data = await n8nGet(`/executions?status=error&limit=250${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    const rijen = data.data || [];
    for (const e of rijen) {
      const t = new Date(e.startedAt).getTime();
      if (t < grens) continue;
      if (!namen.has(e.workflowId)) continue;
      fouten.push({ id: e.id, workflowId: e.workflowId, workflowNaam: namen.get(e.workflowId), startedAt: e.startedAt });
    }
    const oudste = rijen.length ? new Date(rijen[rijen.length - 1].startedAt).getTime() : 0;
    if (!data.nextCursor || oudste < grens) break;
    cursor = data.nextCursor;
  }
  // Van de laatste fout per workflow halen we de foutmelding op, zodat je ziet wat er misging zonder n8n te openen.
  const laatstePer = new Map();
  for (const f of fouten) if (!laatstePer.has(f.workflowId) || f.startedAt > laatstePer.get(f.workflowId).startedAt) laatstePer.set(f.workflowId, f);
  await inPartijen([...laatstePer.values()].slice(0, 15), 3, async (f) => {
    try {
      const d = await n8nGet(`/executions/${f.id}?includeData=true`);
      const rd = ((d.data || {}).resultData) || {};
      f.bericht = (rd.error && (rd.error.message || rd.error.description)) || '';
      f.node = rd.lastNodeExecuted || (rd.error && rd.error.node && rd.error.node.name) || '';
    } catch (err) { /* zonder melding is de fout er nog steeds */ }
  });
  return fouten;
}

async function stilgevallenWorkflows(workflows, nu) {
  const gepland = workflows.map((w) => ({ id: w.id, naam: w.name, interval: verwachtInterval(w) })).filter((w) => w.interval);
  const stil = [];
  await inPartijen(gepland, 5, async (w) => {
    try {
      const data = await n8nGet(`/executions?workflowId=${encodeURIComponent(w.id)}&status=success&limit=1`);
      const laatste = (data.data || [])[0];
      if (laatste && isStilgevallen(w.interval, laatste.startedAt, nu)) stil.push({ ...w, laatsteSucces: laatste.startedAt });
    } catch (err) { /* onbekend telt niet als stil */ }
  });
  return stil;
}

async function inPartijen(lijst, grootte, fn) {
  for (let i = 0; i < lijst.length; i += grootte) await Promise.all(lijst.slice(i, i + grootte).map(fn));
}

function heeftBlogr(producten) {
  const p = producten || 'Blogr.';
  return p === 'Blogr.' || p === 'Beide';
}

async function bouwCockpit() {
  const nu = Date.now();
  const instellingen = await settingsService.listAllSettings(clients);
  const problemen = [];

  let workflows = [];
  let fouten = [];
  let stil = [];
  try {
    workflows = await alleWorkflows();
    [fouten, stil] = await Promise.all([recenteFouten(workflows, nu), stilgevallenWorkflows(workflows, nu)]);
  } catch (err) {
    problemen.push(`n8n kon niet worden gelezen: ${err.message}`);
  }

  const klanten = await Promise.all(instellingen.map(async (inst) => {
    const config = getClient(inst.id);
    const rij = { id: inst.id, naam: inst.naam, producten: inst.producten, klantstatus: inst.klantstatus, signalen: [], laatstePublicatie: null };
    if (inst.klantstatus !== 'actief') return { ...rij, kleur: 'uit', samenvatting: inst.klantstatus === 'gepauzeerd' ? 'Gepauzeerd' : 'Beëindigd' };
    if (!heeftBlogr(inst.producten) || !config.databaseId) {
      return { ...rij, kleur: 'groen', samenvatting: 'Alleen Pagr., de blogcontrole is niet van toepassing' };
    }

    let blogsPerMaand = null;
    if (!Object.values(EIGEN_WORKFLOWS).includes(inst.id)) {
      try {
        const clientsRij = await workflowGegevens.zoekRij(inst.id, inst.naam);
        const controle = workflowGegevens.bouwControle({ rij: clientsRij, clientId: inst.id, portaalStatus: inst.klantstatus, portaalStatusIngesteld: inst.klantstatusIngesteld });
        for (const c of controle.filter((r) => !r.ok && r.kritiek)) rij.signalen.push({ soort: 'techniek', niveau: 'rood', tekst: c.tekst, details: [] });
        if (clientsRij && clientsRij.blogs_per_maand !== undefined && clientsRij.blogs_per_maand !== null && clientsRij.blogs_per_maand !== '') blogsPerMaand = Number(clientsRij.blogs_per_maand);
      } catch (err) {
        rij.signalen.push({ soort: 'techniek', niveau: 'oranje', tekst: `Clients tabel kon niet worden gelezen: ${err.message}`, details: [] });
      }
    }

    try {
      const blogs = await alleBlogs(config);
      const uit = blogSignalen(blogs, { statussen: config.statusValues || {}, blogsPerMaand, nu });
      rij.signalen.push(...uit.signalen);
      rij.laatstePublicatie = uit.laatstePublicatie;
    } catch (err) {
      rij.signalen.push({ soort: 'techniek', niveau: 'rood', tekst: `Notion planning kon niet worden gelezen: ${err.message}`, details: [] });
    }

    const eigenFouten = fouten.filter((f) => klantVanWorkflow(f.workflowNaam) === inst.id);
    rij.signalen.push(...foutSignalen(eigenFouten, nu));
    rij.signalen.push(...stilSignalen(stil.filter((w) => klantVanWorkflow(w.naam) === inst.id)));

    rij.signalen = sorteerSignalen(rij.signalen);
    const kleur = kleurVan(rij.signalen);
    return { ...rij, kleur, samenvatting: kleur === 'groen' ? 'Alles draait' : '' };
  }));

  const gedeeldeFouten = fouten.filter((f) => !klantVanWorkflow(f.workflowNaam));
  const gedeeld = sorteerSignalen([
    ...foutSignalen(gedeeldeFouten, nu),
    ...stilSignalen(stil.filter((w) => !klantVanWorkflow(w.naam)))
  ]);

  return {
    bijgewerkt: new Date(nu).toISOString(),
    klanten: sorteerKlanten(klanten),
    gedeeld: { kleur: kleurVan(gedeeld), signalen: gedeeld, workflows: workflows.length },
    problemen
  };
}

let cache = { op: 0, data: null, bezig: null };

async function getCockpit({ ververs = false } = {}) {
  if (!ververs && cache.data && Date.now() - cache.op < CACHE_MS) return cache.data;
  if (cache.bezig) return cache.bezig;
  cache.bezig = bouwCockpit()
    .then((data) => { cache = { op: Date.now(), data, bezig: null }; return data; })
    .catch((err) => { cache.bezig = null; throw err; });
  return cache.bezig;
}

module.exports = {
  getCockpit,
  blogSignalen,
  foutSignalen,
  stilSignalen,
  verwachtInterval,
  cronInterval,
  isStilgevallen,
  klantVanWorkflow,
  isBlogWorkflow,
  kleurVan,
  sorteerKlanten,
  DREMPELS
};
