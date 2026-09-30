// LP Fabriek: WordPress kloon (30-09-2026).
// Een pagina in WordPress (bv. Marions Breda pagina op hostelroots.nl, gebouwd met Beaver Builder) wordt via
// n8n 1 op 1 gekloond, waarna alleen de inhoud (teksten, links, foto's) wordt vervangen. Dit is een tweede
// route naast de sjablonen met slots: die bouwen eigen HTML, dit hergebruikt de layout van de klantsite zelf.
//
// Onderdelen:
// - WordPress kant: het PHP fragment "LP Fabriek WP kloon" (Code Snippets op de klantsite), met de endpoints
//   /wp-json/lpfabriek/v1/velden en /kloon. Zie kennisbank claude/lp-fabriek-wp-kloon.md.
// - n8n kant: webhook "LP Fabriek: WordPress kloon" (env LP_KLOON_WEBHOOK_URL, LP_KLOON_WEBHOOK_KEY en
//   optioneel LP_KLOON_WEBHOOK_HEADER, standaard X-LP-Key). De webhook roept de WordPress endpoints aan.
// - Hier: velden leesbaar labelen, een veilig verzoek bouwen, het antwoord normaliseren en AI teksten voorstellen.
//
// Veiligheidsgrens (zelfde als wordpress.js): een kloon wordt ALTIJD een concept. Er is bewust geen optie om
// direct te publiceren.

const MODULE_LABELS = {
  heading: 'Kop',
  'rich-text': 'Tekst',
  button: 'Knop',
  photo: 'Foto',
  'info-box': 'Kaart',
  'info-list': 'Lijst',
  row: 'Rij',
  column: 'Kolom',
  'column-group': 'Kolommen'
};

const PAD_LABELS = {
  heading: 'Kop',
  text: 'Tekst',
  title: 'Titel',
  heading_prefix: 'Regel boven de titel (bv. prijs)',
  cta_text: 'Linktekst',
  btn_text: 'Knoptekst',
  btn_link: 'Knoplink',
  link: 'Link',
  photo: 'Foto',
  bg_image: 'Achtergrondfoto',
  alt: 'Alt tekst',
  'data.alt': 'Alt tekst van de foto',
  list_item_title: 'Titel',
  list_item_link: 'Link'
};

function padLabel(pad) {
  const lijst = /^\w+\.(\d+)\.(\w+)$/.exec(pad);
  if (lijst) return `Item ${Number(lijst[1]) + 1}: ${PAD_LABELS[lijst[2]] || lijst[2]}`;
  return PAD_LABELS[pad] || pad;
}

function korteTekst(waarde, max = 40) {
  const kaal = String(waarde || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return kaal.length > max ? kaal.slice(0, max - 1) + '…' : kaal;
}

// Zet de ruwe velden van het WordPress endpoint om naar een lijst met leesbare labels en een groepsnaam
// per blok ("Kaart 2: Economy Private Rooms"). Volgorde blijft die van de pagina.
function labelVelden(velden) {
  const teller = {};
  const groepNaam = new Map();
  const uit = [];
  for (const v of Array.isArray(velden) ? velden : []) {
    if (!v || !v.node || !v.pad) continue;
    if (!groepNaam.has(v.node)) {
      const basis = MODULE_LABELS[v.module] || v.module || 'Onderdeel';
      teller[basis] = (teller[basis] || 0) + 1;
      groepNaam.set(v.node, { basis: `${basis} ${teller[basis]}`, titel: '' });
    }
    const groep = groepNaam.get(v.node);
    if (!groep.titel && v.soort === 'tekst') groep.titel = korteTekst(v.waarde);
    uit.push({
      id: `${v.node}|${v.pad}`,
      node: v.node,
      pad: v.pad,
      module: v.module || '',
      soort: v.soort,
      waarde: v.waarde,
      label: padLabel(v.pad),
      // Standaard aan voor de AI: korte koppen en lopende tekst. Prijzen, knoppen en lijsten laten we bewust met rust.
      standaardAi: v.soort === 'tekst' && (v.module === 'heading' || v.module === 'rich-text')
    });
  }
  for (const v of uit) {
    const groep = groepNaam.get(v.node);
    v.groep = groep.titel ? `${groep.basis}: ${groep.titel}` : groep.basis;
  }
  return uit;
}

function schoneSlug(slug) {
  return String(slug || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Bouwt het verzoek voor de n8n webhook. Alleen velden met een echte wijziging worden meegestuurd.
// status is altijd "draft", wat de aanroeper ook vraagt.
function bouwKloonVerzoek({ bron, titel, slug, seoPlugin, metaTitel, metaBeschrijving, velden, zoekvervang, dryRun }) {
  const bronId = Number(bron);
  if (!Number.isInteger(bronId) || bronId <= 0) throw new Error('Bronpagina ontbreekt of is geen geldig paginanummer.');
  const naam = String(titel || '').trim();
  if (!naam) throw new Error('Titel ontbreekt.');

  const opgeschoondeVelden = [];
  for (const v of Array.isArray(velden) ? velden : []) {
    if (!v || !v.node || !v.pad) continue;
    if (v.attachment !== undefined && v.attachment !== null && v.attachment !== '') {
      const id = Number(v.attachment);
      if (!Number.isInteger(id) || id <= 0) throw new Error(`Ongeldig mediabestand bij veld ${v.node} ${v.pad}.`);
      opgeschoondeVelden.push({ node: String(v.node), pad: String(v.pad), attachment: id });
    } else if (typeof v.waarde === 'string') {
      opgeschoondeVelden.push({ node: String(v.node), pad: String(v.pad), waarde: v.waarde });
    }
  }
  const opgeschoondeZoek = (Array.isArray(zoekvervang) ? zoekvervang : [])
    .filter((z) => z && typeof z.zoek === 'string' && z.zoek.trim() !== '')
    .map((z) => ({ zoek: z.zoek, vervang: typeof z.vervang === 'string' ? z.vervang : '' }));

  const verzoek = {
    modus: 'kloon',
    bron: bronId,
    titel: naam,
    slug: schoneSlug(slug || naam),
    status: 'draft',
    velden: opgeschoondeVelden,
    zoekvervang: opgeschoondeZoek,
    dry_run: Boolean(dryRun)
  };
  if (seoPlugin && (metaTitel || metaBeschrijving)) {
    verzoek.seo = { plugin: seoPlugin, titel: metaTitel || '', beschrijving: metaBeschrijving || '' };
  }
  return verzoek;
}

function webhookConfig(env = process.env) {
  const url = env.LP_KLOON_WEBHOOK_URL;
  const key = env.LP_KLOON_WEBHOOK_KEY;
  if (!url || !key) {
    throw new Error('LP_KLOON_WEBHOOK_URL en LP_KLOON_WEBHOOK_KEY ontbreken in de environment variables (Render). Zie kennisbank claude/lp-fabriek-wp-kloon.md.');
  }
  return { url, key, header: env.LP_KLOON_WEBHOOK_HEADER || 'X-LP-Key' };
}

async function roepWebhook(body, { fetchFn = fetch, env = process.env } = {}) {
  const { url, key, header } = webhookConfig(env);
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [header]: key },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`n8n webhook gaf een fout (${res.status}): ${(data && (data.message || data.error)) || res.statusText}`);
  }
  // Een WordPress fout komt door de webhook heen als gewoon antwoord met code en message.
  if (data && data.code && data.message && data.ok === undefined && data.dry_run === undefined) {
    throw new Error(`WordPress: ${data.message}`);
  }
  return data;
}

function normaliseerAntwoord(data) {
  const d = data || {};
  return {
    dryRun: Boolean(d.dry_run),
    ok: Boolean(d.ok),
    id: d.id || null,
    url: d.url || '',
    bewerkUrl: d.bewerk_url || '',
    builderUrl: d.builder_url || '',
    slug: d.slug || '',
    status: d.status || '',
    wijzigingen: Number(d.wijzigingen) || 0,
    seo: d.seo || '',
    waarschuwingen: Array.isArray(d.waarschuwingen) ? d.waarschuwingen : []
  };
}

async function haalVelden({ bron }, opties) {
  const bronId = Number(bron);
  if (!Number.isInteger(bronId) || bronId <= 0) throw new Error('Bronpagina ontbreekt of is geen geldig paginanummer.');
  const data = await roepWebhook({ modus: 'velden', bron: bronId }, opties);
  if (!data || !Array.isArray(data.velden)) throw new Error('Onverwacht antwoord van WordPress: geen velden ontvangen.');
  return {
    bron: bronId,
    titel: data.titel || '',
    slug: data.slug || '',
    url: data.url || '',
    modules: data.modules || {},
    velden: labelVelden(data.velden)
  };
}

// Lijst van eerder gemaakte klonen. WordPress merkt elke kloon (meta _lpfabriek_kloon), de lijst komt dus uit
// WordPress zelf en klopt ook als een pagina daar is gepubliceerd of verwijderd. De webhook heeft hiervoor geen
// aparte modus nodig: bron "klonen" op de velden route geeft de lijst.
const STATUS_NAMEN = { draft: 'Concept', publish: 'Live', pending: 'In afwachting', private: 'Privé', future: 'Gepland' };

function normaliseerKlonen(data) {
  const lijst = data && Array.isArray(data.klonen) ? data.klonen : null;
  if (!lijst) throw new Error('Onverwacht antwoord van WordPress: geen lijst met klonen. Is het bijgewerkte PHP fragment geplaatst?');
  return lijst.map((k) => ({
    id: Number(k.id) || 0,
    titel: String(k.titel || '(zonder titel)'),
    slug: String(k.slug || ''),
    status: String(k.status || ''),
    statusNaam: STATUS_NAMEN[k.status] || String(k.status || ''),
    datum: String(k.datum || ''),
    bron: Number(k.bron) || 0,
    bronTitel: String(k.bron_titel || ''),
    url: String(k.url || ''),
    bewerkUrl: String(k.bewerk_url || ''),
    builderUrl: String(k.builder_url || '')
  }));
}

async function haalKlonen(opties) {
  return normaliseerKlonen(await roepWebhook({ modus: 'velden', bron: 'klonen' }, opties));
}

async function maakKloon(invoer, opties) {
  const verzoek = bouwKloonVerzoek(invoer);
  return normaliseerAntwoord(await roepWebhook(verzoek, opties));
}

// Telt de HTML tags per soort, om te zien of de AI de opmaak van een tekst heeft laten staan.
function telTags(html) {
  const tellingen = {};
  for (const m of String(html || '').matchAll(/<\s*(\/?)\s*([a-z0-9]+)/gi)) {
    const sleutel = `${m[1] ? '/' : ''}${m[2].toLowerCase()}`;
    tellingen[sleutel] = (tellingen[sleutel] || 0) + 1;
  }
  return tellingen;
}

function controleerHtmlStructuur(oud, nieuw) {
  const a = telTags(oud);
  const b = telTags(nieuw);
  const sleutels = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const s of sleutels) if ((a[s] || 0) !== (b[s] || 0)) return false;
  return true;
}

function bouwAiPrompt({ opdracht, feiten, nietToegestaan, toonNotitie, velden }) {
  const systemPrompt = [
    'Je schrijft de teksten van een NIEUWE pagina op basis van een bestaande pagina van dezelfde klant. De opmaak (kleuren, blokken) blijft gelijk, alleen de tekst verandert.',
    'Regels:',
    '1. Behoud de HTML structuur van elke tekst exact: dezelfde tags, dezelfde style attributen, dezelfde volgorde. Vervang alleen de zichtbare woorden. Een tekst zonder HTML blijft tekst zonder HTML.',
    '2. Verzin geen feiten. Gebruik alleen wat in FEITEN staat of wat al in de huidige tekst stond en niet aan de oude plaats of het oude onderwerp hangt.',
    '3. Prijzen, adressen, tijden, aantallen en namen van kamers laat je ongewijzigd, tenzij ze in FEITEN anders staan.',
    '4. Geen nieuwe links, geen nieuwe URL\'s. Behoud bestaande links in de tekst zoals ze zijn.',
    '5. Schrijf in het Nederlands, in eenvoudige woorden en korte zinnen. Geen overdreven marketingtaal.',
    'Antwoord uitsluitend met JSON in dit formaat: {"velden":[{"id":"...","waarde":"..."}]}. Gebruik precies de id\'s die je krijgt, en geef alleen velden terug die je hebt aangepast.'
  ].join('\n');
  const userPrompt = JSON.stringify({
    opdracht,
    toon: toonNotitie || '',
    nietToegestaan: nietToegestaan || [],
    FEITEN: (feiten || []).map((f) => ({ label: f.label, waarde: f.waarde })),
    velden: velden.map((v) => ({ id: v.id, label: `${v.groep}, ${v.label}`, huidig: v.huidig }))
  }, null, 2);
  return { systemPrompt, userPrompt };
}

// Vraagt de AI om nieuwe teksten voor de geselecteerde velden. Geeft { voorstellen, waarschuwingen } terug.
// Een voorstel dat de HTML structuur wijzigt krijgt een waarschuwing (niet geweigerd, Dylan beoordeelt).
async function stelInhoudVoor({ opdracht, feiten, nietToegestaan, toonNotitie, velden, callAi }) {
  if (!String(opdracht || '').trim()) throw new Error('Vul in waar de nieuwe pagina over gaat.');
  const teVullen = (Array.isArray(velden) ? velden : []).filter((v) => v && v.id && typeof v.huidig === 'string' && v.huidig.trim());
  if (!teVullen.length) throw new Error('Geen tekstvelden geselecteerd.');
  const ai = callAi || require('./ai').callOpenAi;
  const { systemPrompt, userPrompt } = bouwAiPrompt({ opdracht, feiten, nietToegestaan, toonNotitie, velden: teVullen });
  const antwoord = await ai({ systemPrompt, userPrompt });
  const perId = new Map(teVullen.map((v) => [v.id, v]));
  const voorstellen = [];
  const waarschuwingen = [];
  for (const item of Array.isArray(antwoord && antwoord.velden) ? antwoord.velden : []) {
    const bron = perId.get(item && item.id);
    if (!bron || typeof item.waarde !== 'string' || !item.waarde.trim()) continue;
    if (!controleerHtmlStructuur(bron.huidig, item.waarde)) {
      waarschuwingen.push(`${bron.groep}, ${bron.label}: de opmaak (HTML) van de tekst is anders dan het origineel. Controleer dit veld.`);
    }
    voorstellen.push({ id: item.id, waarde: item.waarde });
  }
  const ontbrekend = teVullen.length - voorstellen.length;
  if (ontbrekend > 0) waarschuwingen.push(`${ontbrekend} veld(en) heeft de AI niet aangepast, die blijven zoals ze waren.`);
  return { voorstellen, waarschuwingen };
}

module.exports = {
  labelVelden,
  schoneSlug,
  bouwKloonVerzoek,
  webhookConfig,
  roepWebhook,
  normaliseerAntwoord,
  haalVelden,
  haalKlonen,
  normaliseerKlonen,
  maakKloon,
  controleerHtmlStructuur,
  bouwAiPrompt,
  stelInhoudVoor
};
