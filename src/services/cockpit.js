// Cockpit: één overzicht van alle klanten met per klant een kleur (rood, oranje, groen).
// Beheer op uitzondering: Dylan opent alleen de klanten die rood of oranje zijn.
//
// Stap 1 (27-10-2026): het techniek signaal. Bronnen:
//   1. Notion contentplanning per klant: blogs op Fout, vastgelopen in generatie, te laat,
//      planning die leegloopt en hoe lang geleden de laatste publicatie was.
//   2. n8n uitvoeringen (public API, header X-N8N-API-KEY): mislukte runs in de laatste 7 dagen
//      en workflows met een schema die niet meer draaien.
//   3. De Clients tabel in n8n: de kritieke punten uit de controle voor livegang (alleen Shared klanten).
//
// Stap 2 tot en met 4 (27-10-2026):
//   Kwaliteit: n8n tabel blog_kwaliteit (QA afkeuringen, herschrijvingen die de controle niet halen,
//              afwijzingen door de klant).
//   Data:      n8n tabel Prestaties Overzicht (28 dagen tegenover de 28 dagen ervoor, en of de sync nog draait).
//   Klant:     blogs die lang op Ter review staan en wanneer de klant voor het laatst in het portaal was
//              (Portaal Instellingen, kolom Laatste login).
//   Samenvatting: samenvattingTekst() maakt het wekelijkse Telegram bericht (workflow BA - Systeem - Cockpit Weekoverzicht).
//
// Afronding (27-10-2026):
//   Blog:      per gepubliceerde blog van de automation: in Google (Prestaties Indexatie), interne links, lengte en
//              tussenkoppen (content_inventory), SEO titel en omschrijving (Notion) en een uitgelichte afbeelding
//              (WordPress REST, alleen lezen).
//   Gedeeld:   een fout in een Shared workflow wordt aan de klant gekoppeld als de klantnaam in de invoer van de
//              mislukte stap staat.
//   Steekproef: elke week 3 recent gepubliceerde blogs om zelf te lezen. Het oordeel gaat naar blog_kwaliteit
//              (gebeurtenis steekproef), een afkeuring wordt een kwaliteitssignaal.

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

const KWALITEIT = {
  qaDagen: 14, qaMin: 3, // zoveel QA afkeuringen in zoveel dagen = oranje
  herschrijfDagen: 30,
  klantDagen: 60, klantMinBeoordelingen: 3, afwijsOranje: 0.4, afwijsRood: 0.6
};
const DATA = {
  verouderdDagen: 3,
  vertoningenMin: 300, clicksMin: 30, // onder deze aantallen zegt een daling weinig
  dalingOranje: 0.25, dalingRood: 0.5, clicksDalingOranje: 0.3
};
const KLANT = { reviewWachtDagen: 7, loginDagen: 30 };

const BLOG = { recentDagen: 120, indexatieDagen: 21, minWoorden: 500, afbeeldingDagen: 60, steekproefDagen: 30, steekproefAantal: 3 };

const TABELLEN = {
  kwaliteit: process.env.N8N_BLOG_KWALITEIT_TABLE_ID || 'MhwS0Xor195VzQZP',
  overzicht: process.env.N8N_PRESTATIES_OVERZICHT_TABLE_ID || 'caOsvqDNlG79IjTA',
  clients: process.env.N8N_CLIENTS_TABLE_ID || '42vYfT6ktan72bpa',
  inventaris: process.env.N8N_CONTENT_INVENTORY_TABLE_ID || 'NamGvL5UcQVHgZ7F',
  indexatie: process.env.N8N_PRESTATIES_INDEXATIE_TABLE_ID || 'OCXbGmfnEipDHU9b'
};

const NIVEAU_GEWICHT = { rood: 3, oranje: 2, info: 1 };
const SOORT_VOLGORDE = { techniek: 0, kwaliteit: 1, blog: 2, data: 3, klant: 4 };

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
  return signalen.slice().sort((a, b) => (NIVEAU_GEWICHT[b.niveau] - NIVEAU_GEWICHT[a.niveau]) || ((SOORT_VOLGORDE[a.soort] || 0) - (SOORT_VOLGORDE[b.soort] || 0)));
}

function zelfdeKlant(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function binnenDagen(datum, dagen, nu) {
  if (!datum) return false;
  const t = new Date(String(datum).length === 10 ? datum + 'T12:00:00Z' : datum).getTime();
  return !Number.isNaN(t) && nu - t <= dagen * DAG;
}

function kort(tekst, max = 160) {
  const t = String(tekst || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 3).trim() + '...' : t;
}

// Kwaliteit uit blog_kwaliteit. rijen: alleen de rijen van deze klant.
function kwaliteitSignalen(rijen, nu) {
  const signalen = [];
  const voeg = (niveau, tekst, details) => signalen.push({ soort: 'kwaliteit', niveau, tekst, details: details || [] });
  const niet = (r) => /niet geslaagd/i.test(String(r.uitkomst || ''));

  const qa = rijen.filter((r) => r.gebeurtenis === 'qa_gate' && niet(r) && binnenDagen(r.datum, KWALITEIT.qaDagen, nu));
  if (qa.length >= KWALITEIT.qaMin) {
    const redenen = [...new Set(qa.map((r) => kort(r.redenen)).filter(Boolean))].slice(0, 3);
    voeg('oranje', `${meervoud(qa.length, 'QA afkeuring', 'QA afkeuringen')} in ${KWALITEIT.qaDagen} dagen, de schrijfstap mist vaker dan normaal`, redenen);
  }

  const herschrijf = rijen.filter((r) => r.gebeurtenis === 'herschrijving_check' && niet(r) && binnenDagen(r.datum, KWALITEIT.herschrijfDagen, nu));
  if (herschrijf.length) voeg('oranje', `${meervoud(herschrijf.length, 'herschrijving na feedback haalde', 'herschrijvingen na feedback haalden')} de controle niet (${KWALITEIT.herschrijfDagen} dagen)`, [...new Set(herschrijf.map((r) => kort(r.redenen)).filter(Boolean))].slice(0, 3));

  const steekproef = rijen.filter((r) => r.gebeurtenis === 'steekproef' && /niet/i.test(String(r.uitkomst || '')) && binnenDagen(r.datum, KWALITEIT.herschrijfDagen, nu));
  if (steekproef.length) voeg('oranje', `${meervoud(steekproef.length, 'blog uit de steekproef is', 'blogs uit de steekproef zijn')} door jou afgekeurd (${KWALITEIT.herschrijfDagen} dagen)`, steekproef.map((r) => kort(`${r.blog_titel || r.blog_id}: ${r.feedback_tekst || 'geen opmerking'}`)));

  const afgewezen = rijen.filter((r) => r.gebeurtenis === 'klant_afgewezen' && binnenDagen(r.datum, KWALITEIT.klantDagen, nu));
  const goedgekeurd = rijen.filter((r) => r.gebeurtenis === 'klant_goedgekeurd' && binnenDagen(r.datum, KWALITEIT.klantDagen, nu));
  const totaal = afgewezen.length + goedgekeurd.length;
  if (totaal >= KWALITEIT.klantMinBeoordelingen) {
    const aandeel = afgewezen.length / totaal;
    if (aandeel >= KWALITEIT.afwijsOranje) {
      const feedback = afgewezen.slice().sort((a, b) => String(b.datum).localeCompare(String(a.datum))).map((r) => kort(r.feedback_tekst)).filter(Boolean).slice(0, 2);
      voeg(aandeel >= KWALITEIT.afwijsRood ? 'rood' : 'oranje', `Klant wees ${afgewezen.length} van ${totaal} blogs af in ${KWALITEIT.klantDagen} dagen (${Math.round(aandeel * 100)}%)`, feedback);
    }
  }
  return signalen;
}

// Data uit Prestaties Overzicht (rij met periode 28 dagen). Geen rij = geen prestatiekoppeling, dan niets.
function dataSignalen(rij, nu) {
  if (!rij) return [];
  const signalen = [];
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const dagen = dagenGeleden(rij.bijgewerkt, nu);
  if (dagen !== null && dagen > DATA.verouderdDagen) {
    signalen.push({ soort: 'techniek', niveau: 'oranje', tekst: `Prestatiedata is ${dagen} dagen niet bijgewerkt (laatste ${datumNl(rij.bijgewerkt)})`, details: [] });
  }
  const verschil = (nuW, vorig) => (vorig ? (nuW - vorig) / vorig : 0);
  const v = num(rij.vertoningen), vv = num(rij.vertoningen_vorig);
  if (v !== null && vv !== null && vv >= DATA.vertoningenMin) {
    const d = verschil(v, vv);
    if (d <= -DATA.dalingOranje) signalen.push({ soort: 'data', niveau: d <= -DATA.dalingRood ? 'rood' : 'oranje', tekst: `Vertoningen in Google ${Math.round(-d * 100)}% lager dan de 28 dagen ervoor (${v.toLocaleString('nl-NL')} tegenover ${vv.toLocaleString('nl-NL')})`, details: [] });
  }
  const c = num(rij.clicks), cv = num(rij.clicks_vorig);
  if (c !== null && cv !== null && cv >= DATA.clicksMin) {
    const d = verschil(c, cv);
    if (d <= -DATA.clicksDalingOranje) signalen.push({ soort: 'data', niveau: d <= -DATA.dalingRood ? 'rood' : 'oranje', tekst: `Clicks uit Google ${Math.round(-d * 100)}% lager dan de 28 dagen ervoor (${c.toLocaleString('nl-NL')} tegenover ${cv.toLocaleString('nl-NL')})`, details: [] });
  }
  return signalen;
}

// Kies uit alle overzichtrijen van een klant de rij van 28 dagen (oude rijen zonder periode_type tellen als 28 dagen).
function overzichtVoorKlant(rijen, naam) {
  const eigen = rijen.filter((r) => zelfdeKlant(r.client_name, naam));
  return eigen.find((r) => r.periode_type === '28d') || eigen.find((r) => !r.periode_type) || null;
}

// Klantgedrag: blogs die lang op de klant wachten en wanneer de klant voor het laatst in het portaal was.
function klantSignalen({ blogs, statussen, reviewEnabled, laatsteLogin, nu }) {
  if (!reviewEnabled) return [];
  const signalen = [];
  const review = (statussen && statussen.review) || 'Ter review';
  const wachten = blogs.filter((b) => b.status === review && b.laatstGewijzigd && nu - new Date(b.laatstGewijzigd).getTime() > KLANT.reviewWachtDagen * DAG);
  if (wachten.length) {
    signalen.push({ soort: 'klant', niveau: 'oranje', tekst: `${meervoud(wachten.length, 'blog wacht', 'blogs wachten')} langer dan ${KLANT.reviewWachtDagen} dagen op goedkeuring van de klant`, details: wachten.map((b) => `${b.titel} (sinds ${datumNl(b.laatstGewijzigd)})`) });
  }
  const dagen = dagenGeleden(laatsteLogin, nu);
  if (dagen !== null && dagen > KLANT.loginDagen) {
    signalen.push({ soort: 'klant', niveau: 'oranje', tekst: `Klant was ${dagen} dagen niet in het portaal (laatste keer ${datumNl(laatsteLogin)})`, details: [] });
  }
  return signalen;
}

// Pad van een URL, zonder domein, kleine letters en zonder slash aan het eind. Zo vinden we dezelfde blog in elke tabel.
function padVan(url) {
  if (!url) return '';
  let pad = String(url).trim();
  try { pad = new URL(pad, 'https://x.nl').pathname; } catch (err) { /* geen geldige URL */ }
  return decodeURIComponent(pad).toLowerCase().replace(/\/+$/, '') || '/';
}

// Controle per gepubliceerde blog van de automation. blogs: Notion samenvattingen. inventaris en indexatie: rijen van deze klant.
function blogInhoudSignalen({ blogs, statussen, inventaris, indexatie, heeftSeoVelden, zonderAfbeelding, nu }) {
  const signalen = [];
  const voeg = (niveau, tekst, details) => signalen.push({ soort: 'blog', niveau, tekst, details: details || [] });
  const gepubliceerd = (statussen && statussen.published) || 'Gepubliceerd';
  const eigen = blogs.filter((b) => b.status === gepubliceerd);
  const recent = eigen.filter((b) => binnenDagen(b.publicatiedatum, BLOG.recentDagen, nu));

  const zonderUrl = recent.filter((b) => !b.liveUrl);
  if (zonderUrl.length) voeg('oranje', `${meervoud(zonderUrl.length, 'gepubliceerde blog heeft', 'gepubliceerde blogs hebben')} geen Live URL in Notion, de metingen kunnen die niet vinden`, zonderUrl.map((b) => b.titel));

  if (heeftSeoVelden) {
    const zonderSeo = recent.filter((b) => !String(b.seoTitle || '').trim() || !String(b.seoDescription || '').trim());
    if (zonderSeo.length) voeg('oranje', `${meervoud(zonderSeo.length, 'blog mist', 'blogs missen')} een SEO titel of omschrijving`, zonderSeo.map((b) => b.titel));
  }

  const perPad = new Map((inventaris || []).map((r) => [padVan(r.pad || r.url), r]));
  const metInventaris = recent.filter((b) => b.liveUrl).map((b) => ({ b, inv: perPad.get(padVan(b.liveUrl)) })).filter((x) => x.inv);
  const zonderLinks = metInventaris.filter((x) => Number(x.inv.links_intern) === 0);
  if (zonderLinks.length) voeg('oranje', `${meervoud(zonderLinks.length, 'blog heeft', 'blogs hebben')} geen enkele interne link`, zonderLinks.map((x) => x.b.titel));
  const kort = metInventaris.filter((x) => x.inv.woorden !== null && x.inv.woorden !== undefined && x.inv.woorden !== '' && Number(x.inv.woorden) < BLOG.minWoorden);
  if (kort.length) voeg('oranje', `${meervoud(kort.length, 'blog is', 'blogs zijn')} korter dan ${BLOG.minWoorden} woorden`, kort.map((x) => `${x.b.titel} (${x.inv.woorden} woorden)`));
  const zonderKoppen = metInventaris.filter((x) => Number(x.inv.koppen) === 0 && x.inv.koppen !== null && x.inv.koppen !== '');
  if (zonderKoppen.length) voeg('oranje', `${meervoud(zonderKoppen.length, 'blog heeft', 'blogs hebben')} geen tussenkoppen`, zonderKoppen.map((x) => x.b.titel));

  if (zonderAfbeelding && zonderAfbeelding.length) voeg('oranje', `${meervoud(zonderAfbeelding.length, 'blog heeft', 'blogs hebben')} geen uitgelichte afbeelding in WordPress`, zonderAfbeelding);

  // Indexatie: geblokkeerd is altijd rood, niet in Google pas na een paar weken oranje.
  const datumPerPad = new Map(eigen.filter((b) => b.liveUrl).map((b) => [padVan(b.liveUrl), b]));
  const geblokkeerd = [];
  const nietInGoogle = [];
  for (const r of indexatie || []) {
    const b = datumPerPad.get(padVan(r.blog_pad || r.blog_url));
    if (!b) continue;
    if (r.status_code === 'geblokkeerd' || r.status_code === 'canonical_probleem') geblokkeerd.push(`${b.titel}: ${r.status_tekst || r.status_code}`);
    else if (['ontdekt_niet_geindexeerd', 'gecrawld_niet_geindexeerd', 'niet_gevonden'].includes(r.status_code)) {
      const dagen = dagenGeleden(b.publicatiedatum, nu);
      if (dagen !== null && dagen >= BLOG.indexatieDagen) nietInGoogle.push(`${b.titel} (${dagen} dagen live)`);
    }
  }
  if (geblokkeerd.length) voeg('rood', `${meervoud(geblokkeerd.length, 'blog is', 'blogs zijn')} geblokkeerd voor Google of heeft een andere hoofdversie`, geblokkeerd);
  if (nietInGoogle.length) voeg('oranje', `${meervoud(nietInGoogle.length, 'blog staat', 'blogs staan')} na ${BLOG.indexatieDagen} dagen nog niet in Google`, nietInGoogle);
  return signalen;
}

// Welke klanten staan in een stuk tekst (invoer van een mislukte stap). Alleen namen van minstens 4 tekens.
function klantenInTekst(tekst, klanten) {
  const t = String(tekst || '').toLowerCase();
  if (!t) return [];
  return klanten.filter((k) => (k.naam && k.naam.length >= 4 && t.includes(k.naam.toLowerCase())) || (k.id && k.id.length >= 4 && t.includes(`"${k.id.toLowerCase()}"`))).map((k) => k.id);
}

// ISO week als sleutel, bijvoorbeeld 2026-W44.
function weekSleutel(nu) {
  const d = new Date(nu);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const jaarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - jaarStart) / DAG + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function hash(tekst) {
  let h = 2166136261;
  for (const c of String(tekst)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Elke week dezelfde 3 blogs (vaste keuze per week), liefst van verschillende klanten.
function kiesSteekproef(kandidaten, week, aantal = BLOG.steekproefAantal) {
  const geschud = kandidaten.slice().sort((a, b) => hash(week + a.blogId) - hash(week + b.blogId));
  const keuze = [];
  for (const k of geschud) if (keuze.length < aantal && !keuze.some((x) => x.klantId === k.klantId)) keuze.push(k);
  for (const k of geschud) if (keuze.length < aantal && !keuze.includes(k)) keuze.push(k);
  return keuze;
}

const KLEUR_WOORD = { rood: 'direct aandacht', oranje: 'let op' };

// Het wekelijkse bericht voor Telegram. Platte tekst, kort, alleen wat afwijkt.
function samenvattingTekst(data, basisUrl) {
  const link = `${String(basisUrl || 'https://portaal.advertisr.nl').replace(/\/+$/, '')}/admin#cockpit`;
  const actief = data.klanten.filter((k) => k.kleur !== 'uit');
  const aandacht = actief.filter((k) => k.kleur === 'rood' || k.kleur === 'oranje');
  const rood = aandacht.filter((k) => k.kleur === 'rood').length;
  const gedeeld = (data.gedeeld && data.gedeeld.signalen) || [];
  const regels = ['Cockpit weekoverzicht', ''];
  if (!aandacht.length && !gedeeld.length) {
    regels.push(`Alle ${actief.length} actieve klanten draaien goed. Niets te doen deze week.`);
  } else {
    regels.push(`${rood} direct aandacht, ${aandacht.length - rood} let op, ${actief.length - aandacht.length} draaien goed.`);
    for (const k of aandacht) {
      const sig = k.signalen.filter((x) => x.niveau !== 'info');
      regels.push('', `${k.naam} (${KLEUR_WOORD[k.kleur]})`);
      sig.slice(0, 3).forEach((x) => regels.push(`• ${x.tekst}`));
      if (sig.length > 3) regels.push(`• en nog ${sig.length - 3}`);
    }
    if (gedeeld.length) {
      regels.push('', 'Gedeelde workflows');
      gedeeld.slice(0, 4).forEach((x) => regels.push(`• ${x.tekst}`));
      if (gedeeld.length > 4) regels.push(`• en nog ${gedeeld.length - 4}`);
    }
  }
  const open = ((data.steekproef && data.steekproef.blogs) || []).filter((b) => !b.oordeel);
  if (open.length) {
    regels.push('', `Steekproef deze week: lees ${meervoud(open.length, 'blog', 'blogs')} en geef je oordeel in de cockpit`);
    open.forEach((b) => regels.push(`• ${b.klantNaam}: ${b.titel}`));
  }
  (data.problemen || []).forEach((p) => regels.push('', `Let op: ${p}`));
  regels.push('', `Open de cockpit: ${link}`);
  return regels.join('\n');
}

// ---- Ophalen ----

// Alle rijen van een n8n data table, met paginering (max 10 x 250).
async function alleRijen(tabelId, maxPaginas = 10) {
  const rijen = [];
  let cursor = '';
  for (let i = 0; i < maxPaginas; i++) {
    const data = await n8nGet(`/data-tables/${tabelId}/rows?limit=250${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    rijen.push(...(data.data || []));
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return rijen;
}

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

// Uitvoeringsdata verandert niet meer, dus de gevonden klanten per uitvoering mogen blijven staan.
const klantenPerUitvoering = new Map();

// De invoer van de mislukte stap: de laatste uitvoer van de stappen die erheen leiden.
function invoerVanMislukteStap(exec) {
  const rd = ((exec.data || {}).resultData) || {};
  const stap = rd.lastNodeExecuted || (rd.error && rd.error.node && rd.error.node.name) || '';
  const verbindingen = ((exec.workflowData || {}).connections) || {};
  const ouders = Object.entries(verbindingen).filter(([, c]) => JSON.stringify(c).includes(`"node":${JSON.stringify(stap)}`)).map(([naam]) => naam);
  const runData = rd.runData || {};
  let tekst = '';
  for (const naam of ouders) {
    const runs = runData[naam] || [];
    const laatste = runs[runs.length - 1];
    if (laatste) tekst += JSON.stringify(laatste.data || {}).slice(0, 200000);
  }
  const eigen = (runData[stap] || [])[(runData[stap] || []).length - 1];
  if (eigen) tekst += JSON.stringify(eigen.data || {}).slice(0, 50000);
  return tekst;
}

async function recenteFouten(workflows, nu, klanten = []) {
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
  // Bij gedeelde workflows ook de andere fouten (max 25): daarmee koppelen we de fout aan de klant.
  const laatste = new Set([...laatstePer.values()].slice(0, 15));
  const gedeeld = fouten.filter((f) => !klantVanWorkflow(f.workflowNaam)).slice(0, 25);
  const ophalen = [...new Set([...laatste, ...gedeeld])];
  await inPartijen(ophalen, 3, async (f) => {
    const bekend = klantenPerUitvoering.get(f.id);
    if (bekend && !laatste.has(f)) { f.klanten = bekend.klanten; return; }
    try {
      const d = await n8nGet(`/executions/${f.id}?includeData=true`);
      const rd = ((d.data || {}).resultData) || {};
      f.bericht = (rd.error && (rd.error.message || rd.error.description)) || '';
      f.node = rd.lastNodeExecuted || (rd.error && rd.error.node && rd.error.node.name) || '';
      if (!klantVanWorkflow(f.workflowNaam)) {
        f.klanten = klantenInTekst(invoerVanMislukteStap(d) + ' ' + f.bericht, klanten);
        klantenPerUitvoering.set(f.id, { klanten: f.klanten });
      }
    } catch (err) { /* zonder melding is de fout er nog steeds */ }
  });
  return fouten;
}

// Uitgelichte afbeelding van recente blogs, via de openbare WordPress REST API (alleen lezen, max 20 blogs per klant).
async function zonderUitgelichteAfbeelding(clientsRij, blogs, statussen, nu) {
  if (!clientsRij || !clientsRij.wp_url) return [];
  const gepubliceerd = (statussen && statussen.published) || 'Gepubliceerd';
  const recent = blogs.filter((b) => b.status === gepubliceerd && /^\d+$/.test(String(b.wordpressPostId || '').trim()) && binnenDagen(b.publicatiedatum, BLOG.afbeeldingDagen, nu)).slice(0, 20);
  if (!recent.length) return [];
  const wp = String(clientsRij.wp_url).trim().replace(/\/+$/, '');
  const type = String(clientsRij.wp_post_type || 'posts').trim() || 'posts';
  const basis = /\/wp-json\//.test(wp) ? wp : `${wp}/wp-json/wp/v2/${type}`;
  const ids = recent.map((b) => String(b.wordpressPostId).trim());
  const res = await fetch(`${basis}?include=${ids.join(',')}&per_page=20&_fields=id,featured_media`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const posts = await res.json();
  if (!Array.isArray(posts)) return [];
  const zonder = new Set(posts.filter((p) => !p.featured_media).map((p) => String(p.id)));
  return recent.filter((b) => zonder.has(String(b.wordpressPostId).trim())).map((b) => b.titel);
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

  const klantNamen = instellingen.map((i) => ({ id: i.id, naam: i.naam }));
  let workflows = [];
  let fouten = [];
  let stil = [];
  try {
    workflows = await alleWorkflows();
    [fouten, stil] = await Promise.all([recenteFouten(workflows, nu, klantNamen), stilgevallenWorkflows(workflows, nu)]);
  } catch (err) {
    problemen.push(`n8n kon niet worden gelezen: ${err.message}`);
  }

  let kwaliteitRijen = [];
  let overzichtRijen = [];
  let clientsRijen = [];
  let inventarisRijen = [];
  let indexatieRijen = [];
  try {
    [kwaliteitRijen, overzichtRijen] = await Promise.all([alleRijen(TABELLEN.kwaliteit), alleRijen(TABELLEN.overzicht)]);
  } catch (err) {
    problemen.push(`Kwaliteit en prestatiedata konden niet worden gelezen: ${err.message}`);
  }
  const clientsFout = await alleRijen(TABELLEN.clients).then((r) => { clientsRijen = r; return ''; }).catch((err) => err.message);
  await Promise.all([
    alleRijen(TABELLEN.inventaris, 30).then((r) => { inventarisRijen = r; }).catch((err) => problemen.push(`content_inventory kon niet worden gelezen: ${err.message}`)),
    alleRijen(TABELLEN.indexatie, 20).then((r) => { indexatieRijen = r; }).catch((err) => problemen.push(`Prestaties Indexatie kon niet worden gelezen: ${err.message}`))
  ]);
  const clientsRijVan = (inst) => clientsRijen.find((r) => String(r.portaal_slug || '').trim() === inst.id) || clientsRijen.find((r) => zelfdeKlant(r.client_name, inst.naam)) || null;
  const steekproefKandidaten = [];

  const klanten = await Promise.all(instellingen.map(async (inst) => {
    const config = getClient(inst.id);
    const rij = { id: inst.id, naam: inst.naam, producten: inst.producten, klantstatus: inst.klantstatus, signalen: [], laatstePublicatie: null };
    if (inst.klantstatus !== 'actief') return { ...rij, kleur: 'uit', samenvatting: inst.klantstatus === 'gepauzeerd' ? 'Gepauzeerd' : 'Beëindigd' };
    if (!heeftBlogr(inst.producten) || !config.databaseId) {
      return { ...rij, kleur: 'groen', samenvatting: 'Alleen Pagr., de blogcontrole is niet van toepassing' };
    }

    let blogsPerMaand = null;
    const clientsRij = clientsRijVan(inst);
    if (!Object.values(EIGEN_WORKFLOWS).includes(inst.id)) {
      try {
        if (clientsFout) throw new Error(clientsFout);
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
      rij.signalen.push(...klantSignalen({ blogs, statussen: config.statusValues || {}, reviewEnabled: inst.reviewEnabled, laatsteLogin: inst.laatsteLogin, nu }));
      const zonderAfbeelding = await zonderUitgelichteAfbeelding(clientsRij, blogs, config.statusValues, nu).catch(() => []);
      rij.signalen.push(...blogInhoudSignalen({
        blogs,
        statussen: config.statusValues || {},
        inventaris: inventarisRijen.filter((r) => zelfdeKlant(r.client_name, inst.naam)),
        indexatie: indexatieRijen.filter((r) => zelfdeKlant(r.client_name, inst.naam)),
        heeftSeoVelden: Boolean(config.fields && config.fields.seoTitle && config.fields.seoDescription),
        zonderAfbeelding,
        nu
      }));
      const gepubliceerd = (config.statusValues && config.statusValues.published) || 'Gepubliceerd';
      blogs.filter((b) => b.status === gepubliceerd && b.liveUrl && binnenDagen(b.publicatiedatum, BLOG.steekproefDagen, nu))
        .forEach((b) => steekproefKandidaten.push({ klantId: inst.id, klantNaam: inst.naam, blogId: b.id, titel: b.titel, url: b.liveUrl, datum: b.publicatiedatum }));
    } catch (err) {
      rij.signalen.push({ soort: 'techniek', niveau: 'rood', tekst: `Notion planning kon niet worden gelezen: ${err.message}`, details: [] });
    }

    rij.signalen.push(...kwaliteitSignalen(kwaliteitRijen.filter((r) => zelfdeKlant(r.klant, inst.naam)), nu));
    rij.signalen.push(...dataSignalen(overzichtVoorKlant(overzichtRijen, inst.naam), nu));
    rij.laatsteLogin = inst.laatsteLogin || '';

    const eigenFouten = fouten.filter((f) => klantVanWorkflow(f.workflowNaam) === inst.id);
    rij.signalen.push(...foutSignalen(eigenFouten, nu));
    rij.signalen.push(...stilSignalen(stil.filter((w) => klantVanWorkflow(w.naam) === inst.id)));
    // Fouten in gedeelde workflows waarbij deze klant in de invoer van de mislukte stap stond.
    const gedeeldVoorKlant = fouten.filter((f) => !klantVanWorkflow(f.workflowNaam) && (f.klanten || []).includes(inst.id));
    rij.signalen.push(...foutSignalen(gedeeldVoorKlant, nu).map((x) => ({ ...x, tekst: `${x.tekst} (gedeelde workflow, bij deze klant)` })));

    rij.signalen = sorteerSignalen(rij.signalen);
    const kleur = kleurVan(rij.signalen);
    return { ...rij, kleur, samenvatting: kleur === 'groen' ? 'Alles draait' : '' };
  }));

  const gedeeldeFouten = fouten.filter((f) => !klantVanWorkflow(f.workflowNaam));
  const gedeeld = sorteerSignalen([
    ...foutSignalen(gedeeldeFouten, nu),
    ...stilSignalen(stil.filter((w) => !klantVanWorkflow(w.naam)))
  ]);

  const week = weekSleutel(nu);
  const oordelen = new Map(kwaliteitRijen.filter((r) => r.gebeurtenis === 'steekproef').map((r) => [r.blog_id, r]));
  const steekproef = {
    week,
    blogs: kiesSteekproef(steekproefKandidaten, week).map((b) => {
      const o = oordelen.get(b.blogId);
      return { ...b, oordeel: o ? (/niet/i.test(o.uitkomst) ? 'niet goed' : 'goed') : '', opmerking: o ? o.feedback_tekst || '' : '' };
    })
  };

  return {
    bijgewerkt: new Date(nu).toISOString(),
    steekproef,
    klanten: sorteerKlanten(klanten),
    gedeeld: { kleur: kleurVan(gedeeld), signalen: gedeeld, workflows: workflows.length },
    problemen
  };
}

let cache = { op: 0, data: null, bezig: null };

// Oordeel over een blog uit de steekproef: een rij in blog_kwaliteit. Een afkeuring wordt een kwaliteitssignaal.
async function bewaarSteekproef({ klantNaam, blogId, titel, oordeel, opmerking }) {
  if (!['goed', 'niet goed'].includes(oordeel)) throw new Error('Oordeel moet goed of niet goed zijn.');
  if (!blogId || !klantNaam) throw new Error('Blog of klant ontbreekt.');
  if (oordeel === 'niet goed' && !String(opmerking || '').trim()) throw new Error('Zet er kort bij wat er niet goed is, dan leert het systeem ervan.');
  const rij = {
    blog_id: String(blogId).slice(0, 200), klant: String(klantNaam).slice(0, 120), workflow: 'cockpit',
    datum: new Date().toISOString().slice(0, 10), gebeurtenis: 'steekproef', uitkomst: oordeel,
    redenen: '', feedback_tekst: String(opmerking || '').trim().slice(0, 1000), feedback_categorie: '',
    revisie_nummer: 0, prompt_versie: '', model: '', blog_titel: String(titel || '').slice(0, 200)
  };
  const res = await fetch(`${N8N_BASE_URL}/api/v1/data-tables/${TABELLEN.kwaliteit}/rows`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': getApiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [rij], returnType: 'count' })
  });
  if (!res.ok) throw new Error(`Opslaan in blog_kwaliteit mislukte (${res.status}): ${(await res.text()).slice(0, 200)}`);
  if (cache.data && cache.data.steekproef) {
    const b = cache.data.steekproef.blogs.find((x) => x.blogId === blogId);
    if (b) { b.oordeel = oordeel; b.opmerking = rij.feedback_tekst; }
  }
  return { ok: true };
}

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
  bewaarSteekproef,
  blogInhoudSignalen,
  klantenInTekst,
  invoerVanMislukteStap,
  kiesSteekproef,
  weekSleutel,
  padVan,
  kwaliteitSignalen,
  dataSignalen,
  klantSignalen,
  overzichtVoorKlant,
  samenvattingTekst,
  sorteerSignalen,
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
