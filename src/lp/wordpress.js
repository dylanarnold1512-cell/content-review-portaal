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

// wpPaginaId meegeven = bestaande conceptpagina bijwerken, anders wordt een
// nieuwe conceptpagina aangemaakt. Geeft { id, link } terug.
async function pushDraft({ profile, wpPaginaId, titel, html }) {
  const { url, username, appPassword } = getWpConfig(profile);
  const endpoint = wpPaginaId
    ? `${url}/wp-json/wp/v2/pages/${wpPaginaId}`
    : `${url}/wp-json/wp/v2/pages`;

  const res = await fetch(endpoint, {
    method: 'POST', // WordPress' REST API gebruikt POST voor zowel aanmaken als bijwerken.
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(username, appPassword)
    },
    body: JSON.stringify({
      title: titel,
      content: wrapForWordPress(html),
      status: 'draft'
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || res.statusText;
    throw new Error(`WordPress-fout (${res.status}): ${message}`);
  }
  return { id: data.id, link: data.link };
}

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
async function searchMedia({ profile, search }) {
  const { url, username, appPassword } = getWpConfig(profile);
  const params = new URLSearchParams({
    per_page: '20',
    _fields: 'id,source_url,alt_text,title,media_details'
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
  return (Array.isArray(data) ? data : []).map((item) => ({
    id: item.id,
    url: item.source_url,
    alt: item.alt_text || '',
    titel: item.title?.rendered || '',
    thumbnail: item.media_details?.sizes?.thumbnail?.source_url || item.source_url
  }));
}

module.exports = { pushDraft, deletePage, searchMedia };
