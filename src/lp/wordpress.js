// LP Fabriek: publiceert een pagina naar WordPress via de REST API,
// server-naar-server (dus geen last van het browserpaneel-probleem uit
// Stap 1, zie besluiten.md "Opgelost: de 401-puzzel..."). Gebruikt de
// wpautop-fix (wrapForWordPress) uit render.js.
//
// BELANGRIJK — veiligheidsgrens: dit endpoint zet ALTIJD status "draft".
// Een pagina echt live zetten (WordPress status "publish", plus de
// eenmalige "SWP Builder"-klik, zie besluiten.md) blijft een bewuste,
// handmatige stap door Dylan/Marc. Er is bewust geen functie in deze tool
// die status "publish" zet — "niets gaat live zonder dat jij het ziet".

const { wrapForWordPress } = require('./render');
const { stripHtml } = require('./utils');

function getWpConfig(profile) {
  const url = process.env[profile.wordpress.urlEnv];
  const username = process.env[profile.wordpress.usernameEnv];
  const appPassword = process.env[profile.wordpress.appPasswordEnv];
  if (!url || !username || !appPassword) {
    throw new Error(
      `WordPress-gegevens ontbreken voor klant "${profile.id}". Zet ${profile.wordpress.urlEnv}, ` +
        `${profile.wordpress.usernameEnv} en ${profile.wordpress.appPasswordEnv} in de environment variables.`
    );
  }
  return { url: url.replace(/\/$/, ''), username, appPassword };
}

function authHeader(username, appPassword) {
  return 'Basic ' + Buffer.from(`${username}:${appPassword}`).toString('base64');
}

// SEO plugins bewaren de metatitel en metabeschrijving als post meta. Welke sleutels, hangt van de plugin af
// (profile.seo.plugin in het klantprofiel).
const SEO_META_SLEUTELS = {
  yoast: { titel: '_yoast_wpseo_title', beschrijving: '_yoast_wpseo_metadesc' },
  rankmath: { titel: 'rank_math_title', beschrijving: 'rank_math_description' },
  seopress: { titel: '_seopress_titles_title', beschrijving: '_seopress_titles_desc' }
};

function seoSleutels(profile) {
  const plugin = String((profile && profile.seo && profile.seo.plugin) || '').toLowerCase().replace(/[^a-z]/g, '');
  return SEO_META_SLEUTELS[plugin] || null;
}

// wpPaginaId meegeven = bestaande conceptpagina bijwerken, anders wordt een
// nieuwe conceptpagina aangemaakt. Geeft { id, link, seo } terug.
//
// SEO (25-09-2026): naast titel en inhoud sturen we de slug en (als de klant een bekende SEO plugin heeft)
// de metatitel en metabeschrijving mee. WordPress negeert stilzwijgend post meta die niet voor de REST API
// is geregistreerd, en de meeste SEO plugins (ook Yoast) doen dat standaard NIET. Daarom lezen we de
// pagina na het opslaan terug en melden we eerlijk of de SEO velden echt zijn opgeslagen. Zie
// SEO_REST_SNIPPET hieronder voor de code die de klantsite daarvoor nodig heeft.
async function pushDraft({ profile, wpPaginaId, titel, html, slug, metaTitel, metaBeschrijving }) {
  const { url, username, appPassword } = getWpConfig(profile);
  const endpoint = wpPaginaId
    ? `${url}/wp-json/wp/v2/pages/${wpPaginaId}`
    : `${url}/wp-json/wp/v2/pages`;

  const sleutels = seoSleutels(profile);
  const gewenstMeta = {};
  if (sleutels && metaTitel) gewenstMeta[sleutels.titel] = metaTitel;
  if (sleutels && metaBeschrijving) gewenstMeta[sleutels.beschrijving] = metaBeschrijving;

  const body = { title: titel, content: wrapForWordPress(html), status: 'draft' };
  if (slug) body.slug = slug;
  if (Object.keys(gewenstMeta).length) body.meta = gewenstMeta;

  const res = await fetch(endpoint, {
    method: 'POST', // WordPress' REST API gebruikt POST voor zowel aanmaken als bijwerken.
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(username, appPassword)
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || res.statusText;
    throw new Error(`WordPress-fout (${res.status}): ${message}`);
  }

  const seo = await controleerSeoOpslag({ url, username, appPassword, id: data.id, gewenstMeta, slug });
  return { id: data.id, link: data.link, seo };
}

async function controleerSeoOpslag({ url, username, appPassword, id, gewenstMeta, slug }) {
  if (!Object.keys(gewenstMeta).length) {
    return { status: 'niet_van_toepassing', melding: 'Geen SEO plugin ingesteld voor deze klant, metatitel en metabeschrijving zijn niet naar WordPress gestuurd.' };
  }
  try {
    const res = await fetch(`${url}/wp-json/wp/v2/pages/${id}?context=edit&_fields=id,slug,meta`, {
      headers: { Authorization: authHeader(username, appPassword) }
    });
    const data = await res.json().catch(() => ({}));
    const meta = (data && data.meta) || {};
    const ontbrekend = Object.entries(gewenstMeta).filter(([k, v]) => meta[k] !== v).map(([k]) => k);
    if (ontbrekend.length) {
      return {
        status: 'niet_opgeslagen',
        melding: 'De metatitel en/of metabeschrijving zijn NIET in WordPress opgeslagen: de SEO plugin laat dit niet toe via de REST API. ' +
          'Voeg op de klantsite het korte codefragment toe (zie de kennisbank, SEO_REST_SNIPPET) of vul ze handmatig in bij Yoast.',
        ontbrekend
      };
    }
    return { status: 'opgeslagen', melding: 'Metatitel en metabeschrijving zijn opgeslagen in de SEO plugin.', slug: data.slug || slug };
  } catch (err) {
    return { status: 'niet_gecontroleerd', melding: `SEO velden konden niet worden gecontroleerd: ${err.message}` };
  }
}

// PHP-fragment voor de KLANTSITE (Code Snippets plugin of functions.php van het kindthema) dat de SEO velden
// via de REST API beschrijfbaar maakt, alleen voor gebruikers die pagina's mogen bewerken. Zonder dit slaat
// Yoast de metatitel en metabeschrijving niet op via onze publicatie.
const SEO_REST_SNIPPET = `add_action('init', function () {
  $velden = ['_yoast_wpseo_title', '_yoast_wpseo_metadesc', 'rank_math_title', 'rank_math_description', '_seopress_titles_title', '_seopress_titles_desc'];
  foreach ($velden as $veld) {
    register_post_meta('page', $veld, [
      'show_in_rest' => true, 'single' => true, 'type' => 'string',
      'auth_callback' => function () { return current_user_can('edit_pages'); }
    ]);
  }
});`;

// Verwijdert een pagina uit WordPress. Gebruikt bewust GEEN force=true —
// de pagina gaat naar de WordPress-prullenbak (30 dagen recover baar via
// WordPress zelf), net zoals sjablonen in Notion op "Gearchiveerd" gezet
// worden in plaats van echt weg te gooien. Zie ook de veiligheidsgrens
// hierboven bij pushDraft: net als publiceren blijft ook verwijderen iets
// wat je bewust vanuit het portaal doet, met een bevestiging in de UI.
async function deletePage({ profile, wpPaginaId }) {
  const { url, username, appPassword } = getWpConfig(profile);
  const res = await fetch(`${url}/wp-json/wp/v2/pages/${wpPaginaId}`, {
    method: 'DELETE',
    headers: { Authorization: authHeader(username, appPassword) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || res.statusText;
    throw new Error(`WordPress-fout bij verwijderen (${res.status}): ${message}`);
  }
  return data;
}

// Doorzoekt de WordPress-mediabibliotheek van de klant (besluit 7,
// besluiten.md: "Beeld: WordPress mediabibliotheek met zoekfunctie, Dylan
// kiest zelf per blok"). Alleen lezen, geen upload — Dylan/Marc uploaden
// foto's gewoon zoals altijd in wp-admin, dit doorzoekt alleen wat er al
// staat zodat je niet hoeft te wisselen tussen het portaal en wp-admin om
// een afbeelding-URL voor een slot te vinden.
// Formaten die zowel gewoon in een browser tonen als door OpenAI's beeldherkenning worden
// geaccepteerd (zie besluiten.md n.a.v. de "invalid_image_format"-fout) — een enkel oud
// bestand in een ander formaat (svg/bmp/heic/pdf) in de mediabibliotheek van de klant mag
// nooit de hele foto-keuze laten vastlopen.
const ONDERSTEUNDE_AFBEELDING_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

async function searchMedia({ profile, search, page, perPage }) {
  const { url, username, appPassword } = getWpConfig(profile);
  const huidigePagina = Number(page) > 0 ? Number(page) : 1;
  const aantalPerPagina = Number(perPage) > 0 ? Number(perPage) : 60; // WP's maximum is 100
  const params = new URLSearchParams({
    per_page: String(aantalPerPagina),
    page: String(huidigePagina),
    _fields: 'id,source_url,alt_text,title,media_details,mime_type'
  });
  if (search) params.set('search', search);
  const res = await fetch(`${url}/wp-json/wp/v2/media?${params.toString()}`, {
    headers: { Authorization: authHeader(username, appPassword) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || res.statusText;
    throw new Error(`WordPress-fout bij mediabibliotheek doorzoeken (${res.status}): ${message}`);
  }
  const items = (Array.isArray(data) ? data : [])
    .filter((item) => ONDERSTEUNDE_AFBEELDING_MIMETYPES.has(item.mime_type))
    .map((item) => ({
      id: item.id,
      url: item.source_url,
      alt: item.alt_text || '',
      titel: item.title?.rendered || '',
      thumbnail: item.media_details?.sizes?.thumbnail?.source_url || item.source_url
    }));
  // Let op: de X-WP-Total(Pages) headers hieronder tellen alle mediabestanden (dus ook een
  // enkel uitgefilterd bestand), de "Meer laden"-paginering kan daardoor een fractie
  // optimistischer tellen dan wat er echt te zien is — geen praktisch probleem gebleken.
  // WordPress geeft het totaal aantal items en pagina's mee in de headers,
  // zo weet de frontend of "Meer laden" nog zin heeft.
  return {
    items,
    page: huidigePagina,
    totalPages: Number(res.headers.get('X-WP-TotalPages')) || huidigePagina,
    total: Number(res.headers.get('X-WP-Total')) || items.length
  };
}

// Uploadt een nieuwe foto vanaf Dylan's eigen computer rechtstreeks naar de
// WordPress-mediabibliotheek van de klant (aanvulling op searchMedia
// hierboven, dat alleen kon zoeken in wat er al stond). WordPress accepteert
// de ruwe bestandsbytes hier zonder multipart-formulier, zolang je de
// bestandsnaam meegeeft via de Content-Disposition header.
async function uploadMedia({ profile, filename, contentType, buffer }) {
  const { url, username, appPassword } = getWpConfig(profile);
  const veiligeNaam = (filename || 'upload').replace(/"/g, '');
  const res = await fetch(`${url}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(username, appPassword),
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${veiligeNaam}"`
    },
    body: buffer
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || res.statusText;
    throw new Error(`WordPress-fout bij uploaden (${res.status}): ${message}`);
  }
  return {
    id: data.id,
    url: data.source_url,
    alt: data.alt_text || '',
    titel: data.title?.rendered || '',
    thumbnail: data.media_details?.sizes?.thumbnail?.source_url || data.source_url
  };
}

// Haalt ALLE gepubliceerde pagina's van de klant hun eigen live WordPress-site op (niet te
// verwarren met de Notion "Landingspagina's"-database, die alleen LP Fabriek-pagina's bijhoudt).
// Gebruikt voor interne linksuggesties: zo kan de AI ook verwijzen naar bestaande site-pagina's
// (home, kamers, contact, enzovoort) die nooit via LP Fabriek zijn aangemaakt, en verzint 'ie
// nooit zelf een URL - elke kandidaat komt rechtstreeks uit WordPress zelf. Alleen lezen.
async function listSitePages({ profile, maxPaginas }) {
  const { url, username, appPassword } = getWpConfig(profile);
  const limiet = Number(maxPaginas) > 0 ? Number(maxPaginas) : 200;
  const alleItems = [];
  let huidigePagina = 1;
  for (;;) {
    const params = new URLSearchParams({
      per_page: '100',
      page: String(huidigePagina),
      status: 'publish',
      _fields: 'id,link,title,excerpt'
    });
    const res = await fetch(`${url}/wp-json/wp/v2/pages?${params.toString()}`, {
      headers: { Authorization: authHeader(username, appPassword) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.message || res.statusText;
      throw new Error(`WordPress-fout bij ophalen site-pagina's (${res.status}): ${message}`);
    }
    const items = Array.isArray(data) ? data : [];
    for (const item of items) {
      alleItems.push({
        id: item.id,
        url: item.link,
        titel: item.title?.rendered || '',
        omschrijving: stripHtml(item.excerpt?.rendered || '', 200)
      });
    }
    const totalPages = Number(res.headers.get('X-WP-TotalPages')) || huidigePagina;
    if (huidigePagina >= totalPages || alleItems.length >= limiet) break;
    huidigePagina += 1;
  }
  return alleItems.slice(0, limiet);
}

module.exports = {
  SEO_META_SLEUTELS,
  SEO_REST_SNIPPET,
  seoSleutels,
  pushDraft,
  deletePage,
  searchMedia,
  uploadMedia,
  listSitePages
};
