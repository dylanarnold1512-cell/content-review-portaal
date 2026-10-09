// Prestaties per klant, opnieuw opgezet (v2). De data komt uit drie n8n Data
// Tables die de workflow "BA - BCU - Prestatie Sync v2" dagelijks vult:
//   Prestaties Blogs     (1 rij per blog: 28 dagen, vorige 28 dagen, hoofdkeyword positie)
//   Prestaties Weken     (1 rij per week: echte weektotalen uit Search Console)
//   Prestaties Overzicht (1 rij per klant: totalen, periode, en het veld toelichting)
// Het portaal leest die tabellen via de n8n public API, net als het
// Kennisdocument. Alle duiding (samenvatting, kansen, aandachtspunten,
// statusbadges) wordt hier met vaste regels berekend uit de cijfers. Er wordt
// dus niets verzonnen: elke zin is terug te voeren op een getal in de tabel.

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const TABLES = {
  blogs: process.env.N8N_PRESTATIES_BLOGS_TABLE_ID || 'HfpN6rbJMStyOvyj',
  weken: process.env.N8N_PRESTATIES_WEKEN_TABLE_ID || 'oAD7tfxMzT8hWsao',
  overzicht: process.env.N8N_PRESTATIES_OVERZICHT_TABLE_ID || 'caOsvqDNlG79IjTA',
  indexatie: process.env.N8N_PRESTATIES_INDEXATIE_TABLE_ID || 'OCXbGmfnEipDHU9b',
  conversies: process.env.N8N_PRESTATIES_CONVERSIES_TABLE_ID || 'ZO8PIIwot7d0ODgX',
  kansen: process.env.N8N_PRESTATIES_KANSEN_TABLE_ID || 'C0ASGyrj8nT1zXOS'
};

// Periodes die de sync opslaat (kolom periode_type). Rijen van voor de
// periodekeuze hebben geen periode_type en tellen als 28 dagen.
const PERIODES = {
  '28d': { label: 'Laatste 28 dagen', korte: 'de afgelopen 28 dagen' },
  '90d': { label: 'Laatste 3 maanden', korte: 'de afgelopen 3 maanden' },
  maand: { label: 'Vorige kalendermaand', korte: 'de vorige kalendermaand' }
};
const STANDAARD_PERIODE = '28d';

function kiesPeriode(waarde) {
  return Object.prototype.hasOwnProperty.call(PERIODES, waarde) ? waarde : STANDAARD_PERIODE;
}

// Kiest de rijen van de gevraagde periode. Voor 28d vallen we terug op oude
// rijen zonder periode_type, maar alleen als er geen echte 28d rijen zijn.
function rijenVanPeriode(rijen, periode) {
  const exact = rijen.filter((r) => r.periode_type === periode);
  if (exact.length || periode !== STANDAARD_PERIODE) return exact;
  return rijen.filter((r) => !r.periode_type);
}

// Drempels voor de vaste regels. Op een plek gezet zodat ze makkelijk te
// tunen zijn zonder de logica te herschrijven.
const REGELS = {
  kansPositieVan: 8,
  kansPositieTot: 20,
  kansMinVertoningen: 30,
  nieuwTotDagen: 14,
  aandachtVanafDagen: 21,
  hoofdwoordNietGevondenMinVertoningen: 50,
  hoofdwoordNietGevondenMinDagen: 28,
  kleinAantalVertoningen: 100,
  maxInzichten: 15
};

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, de Prestaties kunnen niet bij n8n.');
  return key;
}

async function n8nRows(tableId, filterObj, limit) {
  const filter = encodeURIComponent(JSON.stringify(filterObj));
  const res = await fetch(`${N8N_BASE_URL}/api/v1/data-tables/${tableId}/rows?limit=${limit}&filter=${filter}`, {
    headers: { 'X-N8N-API-KEY': getApiKey(), 'Content-Type': 'application/json' }
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (err) {
    // niet JSON, alleen relevant als res.ok ook false is
  }
  if (!res.ok) throw new Error(`n8n data table gaf een fout (${res.status}): ${data.message || raw || res.statusText}`);
  return data.data || [];
}

function perKlant(klantNaam) {
  return { type: 'and', filters: [{ columnName: 'client_name', condition: 'eq', value: klantNaam }] };
}

// Geeft null terug als de sync voor deze klant nog niet heeft gedraaid, zodat
// het portaal dan gewoon de oude weergave kan tonen.
async function getPrestatiesData(klantNaam, periodeKeuze) {
  const periode = kiesPeriode(periodeKeuze);
  const [overzichtAlle, blogsAlle, weken, indexatie, conversies, kansenRijen] = await Promise.all([
    n8nRows(TABLES.overzicht, perKlant(klantNaam), 20),
    n8nRows(TABLES.blogs, perKlant(klantNaam), 250),
    n8nRows(TABLES.weken, perKlant(klantNaam), 60),
    // Indexatie is een extra. Ontbreekt de tabel of de data, dan werkt de rest gewoon.
    n8nRows(TABLES.indexatie, perKlant(klantNaam), 250).catch(() => []),
    n8nRows(TABLES.conversies, perKlant(klantNaam), 250).catch(() => []),
    // Kansen zijn een extra. Ontbreekt de tabel of de data, dan gelden de oude regels.
    n8nRows(TABLES.kansen, perKlant(klantNaam), 100).catch(() => [])
  ]);
  const overzichtRijen = rijenVanPeriode(overzichtAlle, periode);
  if (!overzichtRijen.length) return null;
  const blogs = rijenVanPeriode(blogsAlle, periode);
  return { overzicht: overzichtRijen[0], blogs, weken, indexatie, conversies, kansenRijen, periode };
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const nl = (n) => Number(n).toLocaleString('nl-NL');
const nl1 = (n) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function dagenTussen(vanIso, totIso) {
  const a = new Date(vanIso + 'T00:00:00Z').getTime();
  const b = new Date(totIso + 'T00:00:00Z').getTime();
  return Math.floor((b - a) / 86400000);
}

function datumKort(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// "Pagina 1", "Pagina 2", "Pagina 3 of verder" op basis van een positie.
function positieLabel(pos) {
  if (pos === null || pos === undefined) return null;
  if (pos <= 10) return 'Pagina 1';
  if (pos <= 20) return 'Pagina 2';
  return 'Pagina 3 of verder';
}

function parseZoekwoorden(tekst) {
  try {
    const lijst = JSON.parse(tekst || '[]');
    return Array.isArray(lijst) ? lijst : [];
  } catch (err) {
    return [];
  }
}

// De hoofdtaal van de blogs is bij alle huidige klanten Nederlands.
const TAAL_NAMEN = { hoofd: 'Nederlands', nl: 'Nederlands', en: 'Engels', fr: 'Frans', es: 'Spaans', de: 'Duits', pl: 'Pools', cs: 'Tsjechisch', it: 'Italiaans', pt: 'Portugees', da: 'Deens', sv: 'Zweeds', no: 'Noors', fi: 'Fins', ro: 'Roemeens', hu: 'Hongaars', sk: 'Slowaaks' };
function taalNaam(code) {
  const c = String(code || '').toLowerCase();
  return TAAL_NAMEN[c] || TAAL_NAMEN[c.split('-')[0]] || c.toUpperCase();
}
function parseTalen(tekst) {
  try {
    const lijst = JSON.parse(tekst || '[]');
    if (!Array.isArray(lijst) || lijst.length < 2) return [];
    return lijst.map((t) => ({
      code: String(t.taal || '').toLowerCase(),
      taal: taalNaam(t.taal),
      vertoningen: Number(t.i) || 0,
      clicks: Number(t.c) || 0,
      paginaweergaven: t.gv === null || t.gv === undefined ? null : Number(t.gv) || 0
    }));
  } catch (err) {
    return [];
  }
}

function verschilTekst(nu, vorig, eenheid) {
  if (vorig === null || vorig === undefined) return null;
  const delta = nu - vorig;
  if (delta === 0) return `gelijk aan de periode ervoor`;
  const woord = delta > 0 ? 'meer' : 'minder';
  return `${nl(Math.abs(delta))} ${woord} dan de periode ervoor (${nl(vorig)})`;
}

function bouwPrestaties({ overzicht, blogs, weken, indexatie, conversies, kansenRijen, periode: periodeKeuze }, vandaagIso) {
  const periodeType = kiesPeriode(periodeKeuze);
  const vandaag = vandaagIso || new Date().toISOString().slice(0, 10);
  const o = overzicht || {};
  const periodeEind = o.periode_eind || vandaag;

  const convPerPad = {};
  (conversies || []).forEach((r) => { if (r.blog_pad) convPerPad[r.blog_pad] = r; });
  const indexPerPad = {};
  (indexatie || []).forEach((r) => { if (r.blog_pad) indexPerPad[r.blog_pad] = r; });

  // 1. Per blog
  const blogRijen = (blogs || []).map((b) => {
    const ix = indexPerPad[b.blog_pad];
    const cv = convPerPad[b.blog_pad];
    const leeftijd = b.publicatiedatum ? Math.max(0, dagenTussen(b.publicatiedatum, vandaag)) : null;
    const vertoningen = num(b.vertoningen) || 0;
    const clicks = num(b.clicks) || 0;
    const hkPos = num(b.hk_positie);
    let status;
    if (leeftijd !== null && leeftijd < REGELS.nieuwTotDagen) {
      status = { code: 'nieuw', label: 'Nieuw: Google ontdekt deze pagina nog' };
    } else if (clicks > 0) {
      status = { code: 'clicks', label: 'Krijgt bezoekers uit Google' };
    } else if (vertoningen > 0) {
      status = { code: 'getoond', label: 'Wordt getoond in Google' };
    } else {
      status = { code: 'nietgetoond', label: 'Nog niet getoond in Google' };
    }
    let hoofdwoordTekst;
    if (!b.hoofdkeyword) hoofdwoordTekst = null;
    else if (hkPos !== null) hoofdwoordTekst = `${positieLabel(hkPos)} (positie ${nl1(hkPos)})`;
    else if (vertoningen > 0) hoofdwoordTekst = 'Nog niet zichtbaar voor dit zoekwoord';
    else hoofdwoordTekst = 'Nog geen meting';
    return {
      gedrag: cv
        ? {
            sessiesGoogle: num(cv.sessies_google),
            betrokkenSeconden: num(cv.betrokken_seconden),
            leads: num(cv.leads),
            boekingen: num(cv.boekingen),
            omzet: num(cv.omzet),
            doorkliksContact: num(cv.doorkliks_contact),
            doorkliksBoeken: num(cv.doorkliks_boeken)
          }
        : null,
      indexatie: ix ? { code: ix.status_code, tekst: ix.status_tekst, laatstGecrawld: ix.laatst_gecrawld || '' } : null,
      titel: b.titel || '(geen titel)',
      cluster: b.cluster || '',
      url: b.blog_url || '',
      publicatiedatum: b.publicatiedatum || '',
      leeftijdDagen: leeftijd,
      status,
      hoofdwoord: b.hoofdkeyword || '',
      hoofdwoordTekst,
      hkPositie: hkPos,
      hkPositieVorig: num(b.hk_positie_vorig),
      hkVertoningen: num(b.hk_vertoningen) || 0,
      vertoningen,
      vertoningenVorig: num(b.vertoningen_vorig) || 0,
      clicks,
      clicksVorig: num(b.clicks_vorig) || 0,
      paginaweergaven: num(b.paginaweergaven),
      talen: parseTalen(b.talen),
      zoekwoorden: parseZoekwoorden(b.zoekwoorden)
        .slice(0, 5)
        .map((z) => ({ q: z.q, c: z.c || 0, i: z.i || 0, p: z.p, label: positieLabel(z.p) }))
    };
  });
  blogRijen.sort((a, b) => b.vertoningen - a.vertoningen || (a.leeftijdDagen ?? 0) - (b.leeftijdDagen ?? 0));

  // 2. Totalen
  const vertoningen = num(o.vertoningen) || 0;
  const vertoningenVorig = num(o.vertoningen_vorig);
  const clicks = num(o.clicks) || 0;
  const clicksVorig = num(o.clicks_vorig);
  const paginaweergaven = num(o.paginaweergaven);

  // Gemiddelde positie van de hoofdzoekwoorden, gewogen op vertoningen, en
  // voor de vergelijking alleen over blogs die in beide periodes een positie hebben.
  const metHk = blogRijen.filter((b) => b.hkPositie !== null && b.hkVertoningen > 0);
  const gewogen = (lijst, veld) => {
    const w = lijst.reduce((s, b) => s + b.hkVertoningen, 0);
    return w > 0 ? lijst.reduce((s, b) => s + b[veld] * b.hkVertoningen, 0) / w : null;
  };
  const hkNu = gewogen(metHk, 'hkPositie');
  const beide = metHk.filter((b) => b.hkPositieVorig !== null);
  const hkVergNu = gewogen(beide, 'hkPositie');
  const hkVergVorig = gewogen(beide, 'hkPositieVorig');

  const totalen = {
    vertoningen,
    vertoningenVorig,
    clicks,
    clicksVorig,
    paginaweergaven,
    hkPositie: hkNu,
    hkPositieLabel: positieLabel(hkNu),
    hkPositieVerbetering: hkVergNu !== null && hkVergVorig !== null ? hkVergVorig - hkVergNu : null,
    blogsGepubliceerd: num(o.blogs_gepubliceerd) || 0,
    blogsPipeline: num(o.blogs_pipeline) || 0,
    talen: (() => {
      const kaart = new Map();
      blogRijen.forEach((b) => (b.talen || []).forEach((t) => { if (!kaart.has(t.code)) kaart.set(t.code, t.taal); }));
      if (kaart.size < 2) return [];
      return [...kaart.entries()].map(([code, label]) => ({ code, label })).sort((a, c) => (a.code === 'hoofd' ? -1 : c.code === 'hoofd' ? 1 : a.label.localeCompare(c.label, 'nl')));
    })(),
    blogsGemeten: blogRijen.length,
    blogsGetoond: blogRijen.filter((b) => b.vertoningen > 0).length
  };

  const somG = (veld) => blogRijen.reduce((t, b) => t + ((b.gedrag && b.gedrag[veld]) || 0), 0);
  totalen.conversies = blogRijen.some((b) => b.gedrag)
    ? {
        sessiesGoogle: somG('sessiesGoogle'),
        leads: somG('leads'),
        boekingen: somG('boekingen'),
        omzet: somG('omzet'),
        doorkliks: somG('doorkliksContact') + somG('doorkliksBoeken')
      }
    : null;

  // 3. Samenvatting in gewone taal
  const periodeTekst = o.periode_start ? `${datumKort(o.periode_start)} tot en met ${datumKort(periodeEind)}` : PERIODES[periodeType].korte;
  const samenvatting = [];
  if (vertoningen === 0) {
    samenvatting.push(`In ${PERIODES[periodeType].korte} (${periodeTekst}) is nog geen enkele blog getoond in Google.`);
  } else {
    const verg = verschilTekst(vertoningen, vertoningenVorig);
    samenvatting.push(
      `In ${PERIODES[periodeType].korte} (${periodeTekst}) stonden jullie blogs ${nl(vertoningen)} keer in de zoekresultaten van Google${verg ? `, ${verg}` : ''}.`
    );
  }
  if (clicks === 0) {
    samenvatting.push('Nog niemand klikte vanuit Google door naar een blog.');
  } else {
    const verg = verschilTekst(clicks, clicksVorig);
    samenvatting.push(`${nl(clicks)} ${clicks === 1 ? 'bezoeker klikte' : 'bezoekers klikten'} vanuit Google door naar een blog${verg ? `, ${verg}` : ''}.`);
  }
  if (totalen.blogsGemeten > 0) {
    samenvatting.push(`${totalen.blogsGetoond} van de ${totalen.blogsGemeten} blogs wordt al getoond in Google.`);
  }
  if (vertoningen < REGELS.kleinAantalVertoningen) {
    samenvatting.push('Het gaat om kleine aantallen, dus verschillen zeggen nog weinig.');
  }

  // 4. Inzichten met vaste regels
  const goed = [];
  const kansen = [];
  const aandacht = [];
  const cap = (lijst) => lijst.slice(0, REGELS.maxInzichten);

  // Kansen: zoekwoorden net buiten pagina 1
  const kansLijst = [];
  for (const b of blogRijen) {
    for (const z of b.zoekwoorden) {
      if (z.p !== null && z.p >= REGELS.kansPositieVan && z.p <= REGELS.kansPositieTot && z.i >= REGELS.kansMinVertoningen) {
        kansLijst.push({ blog: b, z });
      }
    }
  }
  kansLijst.sort((a, b) => b.z.i - a.z.i);
  const kansenUitTabel = (kansenRijen || []).filter((r) => r.soort === 'verbeteren' || r.soort === 'nieuw_onderwerp');
  if (kansenUitTabel.length) {
    // Uitlegbare kansen uit de sync: de teksten staan al klaar, hier alleen ordenen.
    const rang = { hoog: 0, middel: 1, laag: 2 };
    const soortRang = { verbeteren: 0, nieuw_onderwerp: 1 };
    const gesorteerd = kansenUitTabel.slice().sort(
      (a, b) =>
        (soortRang[a.soort] - soortRang[b.soort]) ||
        ((rang[a.prioriteit] ?? 3) - (rang[b.prioriteit] ?? 3)) ||
        ((num(b.vertoningen) || 0) - (num(a.vertoningen) || 0))
    );
    for (const r of gesorteerd) {
      kansen.push({
        soort: r.soort,
        soortLabel: r.soort === 'verbeteren' ? 'Bestaande blog verbeteren' : 'Nieuw onderwerp',
        prioriteit: r.prioriteit || 'laag',
        zoekwoord: r.zoekwoord || '',
        blogTitel: r.blog_titel || '',
        signaal: r.signaal || '',
        waarom: r.waarom || '',
        actie: r.actie || '',
        onderbouwing: r.onderbouwing || '',
        titel: r.signaal || '',
        tekst: ''
      });
    }
  } else {
    for (const k of cap(kansLijst)) {
      kansen.push({
        titel: `"${k.z.q}" staat op positie ${nl1(k.z.p)}`,
        tekst: `${nl(k.z.i)} vertoningen in de blog "${k.blog.titel}". Dit zoekwoord staat vlak achter pagina 1.`,
        actie: 'Advertisr beoordeelt of deze blog kan worden aangevuld. Bestaande blogs worden niet automatisch aangepast.'
      });
    }
  }

  // Aandacht: oudere blogs zonder vertoningen
  const nietGetoond = blogRijen.filter((b) => b.status.code === 'nietgetoond' && b.leeftijdDagen !== null && b.leeftijdDagen >= REGELS.aandachtVanafDagen);
  nietGetoond.sort((a, b) => b.leeftijdDagen - a.leeftijdDagen);
  const indexActie = {
    geindexeerd: 'Wij kijken naar het zoekwoord en de inhoud van deze blog.',
    ontdekt_niet_geindexeerd: 'Wij vragen indexering aan bij Google. Daarna kan het enkele dagen tot weken duren.',
    gecrawld_niet_geindexeerd: 'Wij beoordelen of de inhoud sterker kan en vragen indexering opnieuw aan.',
    niet_gevonden: 'Wij vragen indexering aan en controleren de sitemap.',
    geblokkeerd: 'Wij lossen de blokkade zo snel mogelijk op.',
    canonical_probleem: 'Wij controleren welke pagina Google als hoofdversie ziet.'
  };
  const indexZin = {
    geindexeerd: 'De pagina staat wel in Google.',
    ontdekt_niet_geindexeerd: 'Google kent de pagina, maar heeft hem nog niet bekeken.',
    gecrawld_niet_geindexeerd: 'Google heeft de pagina bekeken, maar nog niet opgenomen.',
    niet_gevonden: 'Google kent de pagina nog niet.'
  };
  for (const b of cap(nietGetoond)) {
    const code = b.indexatie && b.indexatie.code;
    aandacht.push({
      titel: `"${b.titel}" is nog niet getoond`,
      tekst: `De blog staat ${nl(b.leeftijdDagen)} dagen live zonder vertoningen in Google.${indexZin[code] ? ' ' + indexZin[code] : ''}`,
      actie: indexActie[code] || 'Controleren of Google de pagina heeft gevonden en of er interne links naartoe wijzen.'
    });
  }
  // Pagina's die voor Google geblokkeerd zijn of een andere hoofdversie hebben, ongeacht leeftijd. Deze staan bovenaan.
  const aandachtBlok = [];
  for (const b of blogRijen) {
    if (!b.indexatie || (b.indexatie.code !== 'geblokkeerd' && b.indexatie.code !== 'canonical_probleem')) continue;
    if (nietGetoond.includes(b)) continue;
    aandachtBlok.push({
      titel: `"${b.titel}": ${b.indexatie.tekst.charAt(0).toLowerCase()}${b.indexatie.tekst.slice(1)}`,
      tekst: 'Dit kan de vindbaarheid van de blog in de weg zitten.',
      actie: indexActie[b.indexatie.code]
    });
  }
  // Aandacht: hoofdzoekwoord niet gevonden terwijl de blog wel getoond wordt
  const hkMist = blogRijen.filter(
    (b) => b.hoofdwoord && b.hkPositie === null && b.vertoningen >= REGELS.hoofdwoordNietGevondenMinVertoningen && (b.leeftijdDagen || 0) >= REGELS.hoofdwoordNietGevondenMinDagen
  );
  for (const b of hkMist) {
    const top = b.zoekwoorden[0];
    aandacht.push({
      titel: `"${b.titel}" wordt op andere woorden gevonden`,
      tekst: `De blog is ${nl(b.vertoningen)} keer getoond, maar niet voor het hoofdzoekwoord "${b.hoofdwoord}".${top ? ` Het meest getoonde zoekwoord is "${top.q}".` : ''}`,
      actie: 'Beoordelen of het hoofdzoekwoord of de tekst moet worden bijgesteld.'
    });
  }

  // Goed nieuws
  if (clicks > 0 && (clicksVorig === 0 || clicksVorig === null)) {
    goed.push({ titel: 'Eerste clicks vanuit Google', tekst: `${nl(clicks)} ${clicks === 1 ? 'click' : 'clicks'} in deze periode, tegenover 0 in de periode ervoor.` });
  }
  const opPagina1 = blogRijen.filter((b) => b.hkPositie !== null && b.hkPositie <= 10).sort((a, b) => a.hkPositie - b.hkPositie);
  for (const b of opPagina1) {
    goed.push({ titel: `"${b.hoofdwoord}" staat op pagina 1`, tekst: `Positie ${nl1(b.hkPositie)} in de blog "${b.titel}".` });
  }
  const verbeterd = blogRijen
    .filter((b) => b.hkPositie !== null && b.hkPositieVorig !== null && b.hkPositieVorig - b.hkPositie >= 3 && b.hkPositie > 10)
    .sort((a, b) => (b.hkPositieVorig - b.hkPositie) - (a.hkPositieVorig - a.hkPositie));
  for (const b of verbeterd) {
    goed.push({ titel: `"${b.hoofdwoord}" is gestegen`, tekst: `Van positie ${nl1(b.hkPositieVorig)} naar ${nl1(b.hkPositie)}.` });
  }
  if (vertoningenVorig !== null && vertoningenVorig > 0 && vertoningen > vertoningenVorig * 1.2) {
    goed.push({ titel: 'Meer vertoningen dan de periode ervoor', tekst: `${nl(vertoningen)} tegenover ${nl(vertoningenVorig)}.` });
  }

  // 5. Weken
  const wekenUit = (weken || [])
    .map((w) => ({
      start: w.week_start,
      eind: w.week_eind,
      volledig: Boolean(w.volledig),
      clicks: num(w.clicks) || 0,
      vertoningen: num(w.vertoningen) || 0,
      nieuw: (() => {
        try {
          const l = JSON.parse(w.nieuwe_blogs || '[]');
          return Array.isArray(l) ? l : [];
        } catch (err) {
          return [];
        }
      })()
    }))
    .sort((a, b) => (a.start < b.start ? -1 : 1));

  return {
    periode: { start: o.periode_start || null, eind: periodeEind },
    periodeType,
    periodeOpties: Object.keys(PERIODES).map((k) => ({ code: k, label: PERIODES[k].label })),
    kansenPeriode: kansenUitTabel.length ? { start: kansenUitTabel[0].periode_start || null, eind: kansenUitTabel[0].periode_eind || null } : null,
    laatstBijgewerkt: o.bijgewerkt || null,
    toelichting: (o.toelichting || '').trim(),
    samenvatting,
    totalen,
    inzichten: { goed: cap(goed), kansen, aandacht: aandachtBlok.concat(aandacht) },
    weken: wekenUit,
    blogs: blogRijen
  };
}

async function getPrestaties(klantNaam, periode) {
  const data = await getPrestatiesData(klantNaam, periode);
  if (!data) return null;
  return bouwPrestaties(data);
}

module.exports = { getPrestaties, bouwPrestaties, positieLabel, REGELS, PERIODES, kiesPeriode, rijenVanPeriode };
