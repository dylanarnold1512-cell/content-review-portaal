// LP Fabriek: site-analyse voor de klant-intake (nieuwe klant toevoegen). Zusje van huisstijl.js
// (dat kleuren/lettertype analyseert) — dit bestand analyseert dezelfde website op de dingen die
// tot nu toe telkens pas ACHTERAF handmatig ontdekt werden zodra er iets miste op een gegenereerde
// pagina (zie besluiten.md, "Boekingslink zelf opgezocht" — de Mews-link bij Roots werd pas na een
// klacht van Dylan gevonden door de site handmatig te bekijken): contactgegevens, de belangrijkste
// call-to-action/boekingsknop (en of die naar de eigen site of een extern boekingssysteem wijst),
// en of er ALGEMEEN een formulier op de site staat (niet alleen Contact Form 7/Gravity Forms — elk
// <form>-element telt, met plugin-naam erbij als die herkenbaar is, zie besluiten.md 05-09-2026).
//
// Zelfde filosofie als huisstijl.js: een lichte, regex-gebaseerde parser (geen HTML-parser-
// dependency) haalt RUWE aanwijzingen op, een AI-voorstel maakt daar bruikbare, geciteerde feiten
// van — Dylan ziet en past het voorstel aan voordat het ergens wordt opgeslagen (bronprincipe,
// besluit 8), dit bestand verzint of committeert niets definitiefs.
//
// Formulierdetectie is een uitzondering op "AI maakt er een voorstel van": een <form>-element vinden
// is een pure ja/nee-constatering zonder ruimte voor interpretatie, dus dat gaat NIET door de AI-stap
// (die zou een gevonden formulier kunnen missen of een niet-gevonden formulier kunnen verzinnen) —
// de ruwe, deterministische detectie hieronder is zelf al het eindresultaat voor formulieren.

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

// Bekende WordPress-formulierenplugins laten een herkenbaar spoor achter in de GERENDERDE HTML —
// zichtbaar zonder WP-admin-toegang nodig te hebben. Dit is bewust een ruime, uitbreidbare lijst
// (niet alleen Contact Form 7/Gravity Forms, zie besluiten.md 05-09-2026: Dylan wil dat elk soort
// formulier gevonden wordt, niet alleen deze twee) — maar een <form> zonder herkend spoor telt óók
// mee, met "plugin: null", zodat een formulier nooit onopgemerkt blijft puur omdat de plugin niet in
// dit lijstje staat.
const BEKENDE_FORMULIER_PLUGINS = [
  { plugin: 'Contact Form 7', re: /wpcf7-f(\d+)/ },
  { plugin: 'Gravity Forms', re: /gform_wrapper_(\d+)/ },
  { plugin: 'Gravity Forms', re: /\bgform_(\d+)\b/ },
  { plugin: 'WPForms', re: /wpforms-form-(\d+)/ },
  { plugin: 'WPForms', re: /id=["']wpforms-(\d+)["']/ },
  { plugin: 'Ninja Forms', re: /nf-form-(\d+)-cont/ },
  { plugin: 'Formidable Forms', re: /id=["']frm_form_(\d+)_container["']/ },
  { plugin: 'Elementor Forms', re: /elementor-widget-form/, geenId: true },
  { plugin: 'Jetpack/Contact Form (Jetpack)', re: /wp-block-jetpack-contact-form/, geenId: true },
  { plugin: 'Fluent Forms', re: /ff-el-form-(?:top|bottom)|fluentform_(\d+)/ }
];

function herkenFormulierPlugin(formulierHtml) {
  for (const kandidaat of BEKENDE_FORMULIER_PLUGINS) {
    const m = formulierHtml.match(kandidaat.re);
    if (m) {
      return { plugin: kandidaat.plugin, formulierId: kandidaat.geenId ? null : (m[1] || null) };
    }
  }
  return null;
}

const VELD_NAAM_RE = /<(?:input|textarea|select)\b[^>]*\bname=["']([^"']+)["']/gi;

function vindVeldNamen(formulierHtml) {
  const namen = new Set();
  let m;
  VELD_NAAM_RE.lastIndex = 0;
  while ((m = VELD_NAAM_RE.exec(formulierHtml))) {
    // Verborgen WordPress/plugin-interne velden (nonce, actie, honeypot e.d.) zijn ruis voor Dylan -
    // die wil weten WELKE gegevens een bezoeker invult, niet de technische velden eromheen.
    if (/^(_wpnonce|_wp_http_referer|action|nonce|_charset_|.*honeypot.*)$/i.test(m[1])) continue;
    namen.add(m[1]);
  }
  return [...namen].slice(0, 20);
}

// Vindt ELK <form>-element op de pagina (algemene detectie, niet beperkt tot specifieke plugins) en
// levert per gevonden formulier: de herkende plugin (of null als er geen bekend spoor is - dan is er
// nog steeds een formulier gevonden, alleen de naam ervan is onbekend) en de zichtbare veldnamen, zodat
// Dylan altijd kan zien dat er een formulier staat, ook als het een plugin is die niet in de lijst
// hierboven staat.
function detecteerFormulieren(html) {
  const matches = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) || [];
  return matches.slice(0, 5).map((formulierHtml) => {
    const herkend = herkenFormulierPlugin(formulierHtml);
    return {
      plugin: herkend ? herkend.plugin : null,
      formulierId: herkend ? herkend.formulierId : null,
      velden: vindVeldNamen(formulierHtml)
    };
  });
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
    formulieren: detecteerFormulieren(gecombineerdeHtml),
    structuur: extractStructureOutline(html)
  };
}

function buildFeitenSystemPrompt() {
  return `Je analyseert RUWE, automatisch geextraheerde gegevens over de website van een nieuwe klant
voor de LP Fabriek (telefoonnummer-kandidaten, knoppen/links met hun href en of die naar de eigen
site of een externe site wijst, en een structuuroverzicht). Op basis daarvan stel je concrete FEITEN
voor (zelfde vorm als het bestaande feiten-bestand: label, waarde, bron) en een voorstel voor de
hoofd-CTA/boekingsactie.

Let op: welke formulieren er op de site staan wordt AL apart en volledig deterministisch gedetecteerd
(niet door jou) - daar hoef je niets over te zeggen of te verzinnen, die informatie krijg je alleen ter
context.

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
- Stel niet meer dan 8 feiten voor, en alleen dingen die voor LANDINGSPAGINA-CONTENT bruikbaar zijn
  (adres, openingstijden, telefoon, dat soort dingen) — geen algemene marketingtekst.

Antwoord ALLEEN met een JSON-object met exact drie velden, geen tekst erbuiten:
{
  "feitenVoorstel": [ { "label": string, "waarde": string, "bron": string } ],
  "ctaVoorstel": { "gevonden": boolean, "label": string, "href": string, "extern": boolean, "opmerking": string },
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

Gevonden formulieren (alleen ter context, hoef je niets mee te doen):
${JSON.stringify(ruweData.formulieren, null, 2)}

Structuuroverzicht van de homepage:
${JSON.stringify(ruweData.structuur, null, 2)}
${ruweData.contactFout ? `\n(Contactpagina ${ruweData.contactUrl} kon niet opgehaald worden: ${ruweData.contactFout})` : ''}`;

  const result = await callOpenAi({ systemPromt: buildFeitenSystemPrompt(), userPrompt });
  if (!result || !Array.isArray(result.feitenVoorstel)) {
    throw new Error('AI-antwoord miste het verwachte veld "feitenVoorstel".');
  }
  return {
    feitenVoorstel: result.feitenVoorstel,
    ctaVoorstel: result.ctaVoorstel || { gevonden: false },
    // Formulieren komen rechtstreeks van de deterministische detectie, NIET van de AI (zie
    // toelichting bovenaan dit bestand) - zo kan de AI een gevonden formulier niet missen of een
    // niet-bestaand formulier verzinnen.
    formulieren: ruweData.formulieren,
    twijfels: Array.isArray(result.twijfels) ? result.twijfels : [],
    ruweData
  };
}

module.exports = {
  buildFeitenVoorstel,
  verzamelRuweSiteData,
  vindTelefoonKandidaten,
  vindKnoppenEnLinksMetHref,
  detecteerFormulieren
};
