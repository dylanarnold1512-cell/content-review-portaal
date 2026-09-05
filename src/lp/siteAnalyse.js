// LP Fabriek: site-analyse voor de klant-intake (nieuwe klant toevoegen). Zusje van huisstijl.js
// (dat kleuren/lettertype analyseert) — dit bestand analyseert dezelfde website op de dingen die
// tot nu toe telkens pas ACHTERAF handmatig ontdekt werden zodra er iets miste op een gegenereerde
// pagina (zie besluiten.md, "Boekingslink zelf opgezocht" — de Mews-link bij Roots werd pas na een
// klacht van Dylan gevonden door de site handmatig te bekijken): contactgegevens, de belangrijkste
// call-to-action/boekingsknop (en of die naar de eigen site of een extern boekingssysteem wijst),
// en of er een herkenbaar WordPress-formulierenplugin (Contact Form 7, Gravity Forms) op de site
// staat.
//
// Zelfde filosofie als huisstijl.js: een lichte, regex-gebaseerde parser (geen HTML-parser-
// dependency) haalt RUWE aanwijzingen op, een AI-voorstel maakt daar bruikbare, geciteerde feiten
// van — Dylan ziet en past het voorstel aan voordat het ergens wordt opgeslagen (bronprincipe,
// besluit 8), dit bestand verzint of committeert niets definitiefs.

const { callOpenAi } = require('./ai');
const { extractStructureOutline } = require('./referenceFetch');

const FETCH_TIMEOUT_MS = 8000;

async function fetchText(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LP-Fabriek-site-analyse/1.0)' }
    });
    if (!res.ok) return { ok: false, fout: `HTTP ${res.status}` };
    return { ok: true, text: await res.text(), finalUrl: res.url || url };
  } catch (err) {
    return { ok: false, fout: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(fragment) {
  return fragment.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch (err) {
    return null;
  }
}

function hostnameVan(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch (err) {
    return null;
  }
}

// Nederlandse en internationale telefoonnummers, ruim genoeg om +31/06/0031-varianten en
// tel:-links te dekken. Bewust ruim (liever een keer teveel een kandidaat dan een gemist nummer) —
// de AI-stap hierna beoordeelt of het een echte kandidaat is, en Dylan controleert het voorstel
// sowieso voordat het een feit wordt.
const TELEFOON_RE = /(?:tel:)?(\+?\(?\d{2,4}\)?[\s-]?\d{2,4}[\s-]?\d{2,4}[\s-]?\d{0,4})/g;

function vindTelefoonKandidaten(html) {
  const tekst = stripHtml(html);
  const gevonden = new Set();
  let m;
  TELEFOON_RE.lastIndex = 0;
  while ((m = TELEFOON_RE.exec(tekst))) {
    const kandidaat = m[1].replace(/\s+/g, ' ').trim();
    // Puur ruis wegfilteren: te kort (jaartallen, prijzen) of te lang (per ongeluk aan elkaar
    // geplakte cijferreeksen) is geen telefoonnummer.
    const cijfers = kandidaat.replace(/\D/g, '');
    if (cijfers.length >= 9 && cijfers.length <= 13) gevonden.add(kandidaat);
  }
  return [...gevonden].slice(0, 8);
}

// Zoekwoorden die duiden op de hoofd-CTA/boekingsactie (NL + EN, hostel/hotel-achtige branche maar
// breed genoeg om ook andere klanten te dekken). Losse woordgrens-check op de zichtbare knoptekst.
const CTA_KEYWORD_RE = /\b(boek|reserveer|reservering|book\s*now|reserve|kamer\s*boeken|bestel|inschrijv)/i;

function vindKnoppenEnLinksMetHref(html, baseUrl) {
  const matches = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  const baseHost = hostnameVan(baseUrl);
  const resultaten = [];
  for (const m of matches) {
    const attrs = m[1];
    const tekst = stripHtml(m[2]);
    if (!tekst || tekst.length > 60) continue;
    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = resolveUrl(hrefMatch[1], baseUrl);
    if (!href || /^(javascript|mailto|tel):/i.test(hrefMatch[1])) continue;
    const host = hostnameVan(href);
    resultaten.push({
      tekst,
      href,
      extern: Boolean(baseHost && host && host !== baseHost),
      lijktOpCta: CTA_KEYWORD_RE.test(tekst)
    });
  }
  // CTA-achtige links eerst, dan de rest — scheelt de AI-stap zoeken, en scheelt tokens (we geven
  // maar een beperkt aantal mee).
  resultaten.sort((a, b) => Number(b.lijktOpCta) - Number(a.lijktOpCta));
  return resultaten.slice(0, 40);
}

// Contact Form 7 en Gravity Forms laten allebei een herkenbaar spoor achter in de GERENDERDE HTML
// van een pagina die het formulier bevat (wpcf7-f<ID> resp. gform_wrapper_<ID>/gform_<ID>) — dat is
// zichtbaar zonder WordPress-inlog nodig te hebben, dus dit is met dezelfde lichte parser-aanpak te
// checken als de rest van deze analyse.
function detecteerFormulierPlugin(html) {
  const cf7 = html.match(/wpcf7-f(\d+)/);
  if (cf7) return { plugin: 'Contact Form 7', formulierId: cf7[1] };
  const gform = html.match(/gform_wrapper_(\d+)/) || html.match(/\bgform_(\d+)\b/);
  if (gform) return { plugin: 'Gravity Forms', formulierId: gform[1] };
  return null;
}

// Haalt de homepage (en, indien opgegeven, een contactpagina) op en levert de ruwe bevindingen.
// Een mislukte contactpagina-ophaal blokkeert de rest niet (zelfde aanpak als huisstijl.js).
async function verzamelRuweSiteData(url, contactUrl) {
  const pageRes = await fetchText(url);
  if (!pageRes.ok) {
    return { url, fout: pageRes.fout };
  }
  const html = pageRes.text;

  let contactHtml = '';
  let contactFout = null;
  if (contactUrl && contactUrl.trim()) {
    const contactRes = await fetchText(contactUrl.trim());
    if (contactRes.ok) {
      contactHtml = contactRes.text;
    } else {
      contactFout = contactRes.fout;
    }
  }

  const gecombineerdeHtml = html + '\n' + contactHtml;

  return {
    url,
    contactUrl: contactUrl && contactUrl.trim() ? contactUrl.trim() : null,
    contactFout,
    telefoonKandidaten: vindTelefoonKandidaten(gecombineerdeHtml),
    knoppenEnLinks: vindKnoppenEnLinksMetHref(html, url),
    formulier: detecteerFormulierPlugin(gecombineerdeHtml),
    structuur: extractStructureOutline(html)
  };
}

function buildFeitenSystemPrompt() {
  return `Je analyseert RUWE, automatisch geextraheerde gegevens over de website van een nieuwe klant
voor de LP Fabriek (telefoonnummer-kandidaten, knoppen/links met hun href en of die naar de eigen
site of een externe site wijst, of er een herkenbaar formulierenplugin gevonden is, en een
structuuroverzicht). Op basis daarvan stel je concrete FEITEN voor (zelfde vorm als het bestaande
feiten-bestand: label, waarde, bron), een voorstel voor de hoofd-CTA/boekingsactie, en een
formulier-bevinding.

Regels (bronprincipe, besluit 8 — dit is niet onderhandelbaar):
- Verzin NOOIT een feit dat niet direct uit de aangeleverde data blijkt. Geen adressen verzinnen,
  geen openingstijden verzinnen. Als iets niet duidelijk in de data staat, laat het weg en noem het
  in "twijfels" in plaats van te gokken.
- Elke voorgestelde "bron" moet concreet zijn: "<domein>, <welke pagina>, gecontroleerd <datum van
  vandaag>" — nooit een vage bron als "de website".
- Voor de CTA: kies de link die het meest op een boek/reserveer-actie lijkt (let op "lijktOpCta" en
  "extern" in de aangeleverde knoppen/links). "extern": true betekent meestal een apart
  boekingssysteem (Mews, Cloudbeds, Booking.com e.d.) — dat is een prima en veelvoorkomende
  uitkomst, geen probleem dat opgelost moet worden. Geen enkele link die op een boek-actie lijkt
  gevonden? Zeg dat expliciet, verzin geen link.
- Voor het formulier: als er geen Contact Form 7 of Gravity Forms gevonden is, meld dat gewoon
  ("geen herkenbaar CF7/Gravity Forms-formulier gevonden") in plaats van te verzinnen dat er niets
  is — er kan best een ander, niet-herkenbaar formulierenplugin gebruikt worden.
- Stel niet meer dan 8 feiten voor, en alleen dingen die voor LANDINGSPAGINA-CONTENT bruikbaar zijn
  (adres, openingstijden, telefoon, dat soort dingen) — geen algemene marketingtekst.

Antwoord ALLEEN met een JSON-object met exact vier velden, geen tekst erbuiten:
{
  "feitenVoorstel": [ { "label": string, "waarde": string, "bron": string } ],
  "ctaVoorstel": { "gevonden": boolean, "label": string, "href": string, "extern": boolean, "opmerking": string },
  "formulierVoorstel": { "gevonden": boolean, "plugin": string, "formulierId": string, "opmerking": string },
  "twijfels": [string]
}`;
}

async function buildFeitenVoorstel(referentieUrl, contactUrl) {
  if (!referentieUrl || !referentieUrl.trim()) {
    throw new Error('Vul eerst een referentie-URL (de eigen website van de klant) in.');
  }
  const ruweData = await verzamelRuweSiteData(referentieUrl.trim(), contactUrl);
  if (ruweData.fout) {
    throw new Error(`Kon ${referentieUrl} niet ophalen: ${ruweData.fout}`);
  }

  const vandaag = new Date().toISOString().slice(0, 10);
  const userPrompt = `Website: ${ruweData.url}
Vandaag: ${vandaag}

Telefoonnummer-kandidaten (ruw, kan ruis bevatten):
${JSON.stringify(ruweData.telefoonKandidaten, null, 2)}

Knoppen/links met href (lijktOpCta/extern zijn hints, geen zekerheid):
${JSON.stringify(ruweData.knoppenEnLinks, null, 2)}

Formulierplugin-detectie (null als niets herkend):
${JSON.stringify(ruweData.formulier, null, 2)}

Structuuroverzicht van de homepage:
${JSON.stringify(ruweData.structuur, null, 2)}
${ruweData.contactFout ? `\n(Contactpagina ${ruweData.contactUrl} kon niet opgehaald worden: ${ruweData.contactFout})` : ''}`;

  const result = await callOpenAi({ systemPrompt: buildFeitenSystemPrompt(), userPrompt });
  if (!result || !Array.isArray(result.feitenVoorstel)) {
    throw new Error('AI-antwoord miste het verwachte veld "feitenVoorstel".');
  }
  return {
    feitenVoorstel: result.feitenVoorstel,
    ctaVoorstel: result.ctaVoorstel || { gevonden: false },
    formulierVoorstel: result.formulierVoorstel || { gevonden: false },
    twijfels: Array.isArray(result.twijfels) ? result.twijfels : [],
    ruweData
  };
}

module.exports = {
  buildFeitenVoorstel,
  verzamelRuweSiteData,
  vindTelefoonKandidaten,
  vindKnoppenEnLinksMetHref,
  detecteerFormulierPlugin
};
