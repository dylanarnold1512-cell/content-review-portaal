// Pagr. stap 12 (14-10-2026): de AI als begeleider bij het maken van een pagina en een sjabloon.
// De beheerder beschrijft in gewone woorden wat hij wil, de AI kiest het sjabloon, de titel en de invoer en legt uit
// waarom. Alles blijft aanpasbaar. Hier zit alleen de logica om het antwoord van de AI te controleren en schoon te maken.

const VISUELE_RICHTINGEN = ['dynamisch-modern', 'fotografie-gedreven', 'icoon-gedreven-zakelijk', 'minimalistisch-tekstueel'];

function maakSlug(tekst) {
  return String(tekst || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function schoneTekst(t, max = 300) {
  return String(t == null ? '' : t).replace(/\s+/g, ' ').replace(/[–—]/g, ',').trim().slice(0, max);
}

// Prompt voor een nieuwe pagina. sjablonen = [{ blueprintId, naam, invoerVelden:[{key,label,verplicht,voorbeeld}] }].
function bouwPaginaPrompt({ klantNaam, klantTekst, onderwerp, sjablonen, bestaandeTitels, gepland }) {
  const systeem = `Je bent begeleider voor een bureau dat landingspagina's maakt voor lokale bedrijven in Nederland.
De beheerder beschrijft in gewone woorden welke pagina hij wil. Jij kiest het best passende sjabloon, bedenkt een titel en vult de invoervelden in.
Regels:
- Kies alleen een sjabloon uit de lijst. Kies het sjabloon dat het beste past bij het soort pagina.
- Gebruik alleen feiten die uit de gegevens van de klant of uit de beschrijving blijken. Laat een veld leeg als je het niet zeker weet. Verzin niets.
- Maak geen titel die al bestaat. De titel is kort, bevat het zoekwoord (dienst en eventueel plaats) en is geen reclamezin.
- Leg in "waarom" in een of twee korte zinnen in gewone taal uit waarom je dit sjabloon en deze titel koos, en noem een tip als iets de pagina sterker maakt.
- Schrijf geen streepjes en geen emoticons.
Antwoord als JSON: {"blueprintId":"...","titel":"...","slug":"...","invoer":{"veldsleutel":"waarde"},"waarom":"...","tip":"... of leeg"}`;
  const sjabLijst = sjablonen.map((s) => `- ${s.blueprintId}: ${s.naam}. Velden: ${(s.invoerVelden || []).map((v) => `${v.key} (${v.label}${v.verplicht ? ', verplicht' : ''})`).join('; ') || 'geen'}`).join('\n');
  const user = `Klant: ${klantNaam}
${klantTekst ? `Gegevens van de klant:\n${klantTekst}\n` : ''}
Beschikbare sjablonen:
${sjabLijst}

Bestaande pagina's (niet opnieuw maken): ${(bestaandeTitels || []).join('; ') || 'geen'}
${gepland && gepland.length ? `Geplande pagina's uit het plan: ${gepland.join('; ')}\n` : ''}
Beschrijving van de beheerder: ${onderwerp}`;
  return { systeem, user };
}

// Controleert het AI antwoord: alleen een bestaand sjabloon, alleen bekende velden, schone slug en titel.
function schoonPaginaAdvies(ruw, sjablonen, bestaandeTitels) {
  const r = ruw && typeof ruw === 'object' ? ruw : {};
  const sjab = sjablonen.find((s) => s.blueprintId === r.blueprintId) || null;
  const velden = new Set(((sjab && sjab.invoerVelden) || []).map((v) => v.key));
  const invoer = {};
  if (r.invoer && typeof r.invoer === 'object') {
    for (const [k, v] of Object.entries(r.invoer)) {
      if (velden.has(k) && v != null && String(v).trim()) invoer[k] = schoneTekst(v, 500);
    }
  }
  const titel = schoneTekst(r.titel, 120);
  const bestaat = (bestaandeTitels || []).some((t) => String(t).toLowerCase().trim() === titel.toLowerCase());
  return {
    blueprintId: sjab ? sjab.blueprintId : '',
    titel,
    slug: maakSlug(r.slug || titel),
    invoer,
    waarom: schoneTekst(r.waarom, 400),
    tip: schoneTekst(r.tip, 300),
    waarschuwing: bestaat ? 'Er bestaat al een pagina met deze titel. Pas de titel aan.' : (sjab ? '' : 'De AI kon geen passend sjabloon kiezen. Kies er zelf een.')
  };
}

async function adviesNieuwePagina({ klantNaam, klantTekst, onderwerp, sjablonen, bestaandeTitels, gepland, aiFn }) {
  const tekst = String(onderwerp || '').trim();
  if (tekst.length < 3) throw new Error('Beschrijf in een paar woorden welke pagina je wilt.');
  if (!sjablonen || !sjablonen.length) throw new Error('Deze klant heeft nog geen actief sjabloon. Maak eerst een sjabloon bij Sjablonen.');
  const { systeem, user } = bouwPaginaPrompt({ klantNaam, klantTekst, onderwerp: tekst, sjablonen, bestaandeTitels, gepland });
  const ruw = await aiFn({ systemPrompt: systeem, userPrompt: user, reasoningEffort: 'low' });
  return schoonPaginaAdvies(ruw, sjablonen, bestaandeTitels);
}

// Prompt voor een nieuw sjabloon. onderdelen = [{ key, label }].
function bouwSjabloonPrompt({ klantNaam, klantTekst, doel, onderdelen, bestaandeSjablonen }) {
  const systeem = `Je bent begeleider voor een bureau dat landingspagina's maakt voor lokale bedrijven in Nederland.
De beheerder wil een nieuw sjabloon (een herbruikbare opzet voor een soort pagina). Jij bepaalt wat voor soort pagina het is, welke vaste onderdelen erbij horen, welke visuele richting past en wat het doel van de bezoeker is.
Regels:
- Kies onderdelen alleen uit de lijst. Kies er drie tot zes die echt bijdragen aan het doel van dit soort pagina.
- Kies de visuele richting uit: ${VISUELE_RICHTINGEN.join(', ')}.
- Bedenk een korte naam voor het sjabloon (twee tot vier woorden) die verschilt van de bestaande sjablonen.
- Leg in "waarom" in twee of drie korte zinnen in gewone taal uit waarom deze keuzes passen bij de klant en het doel.
- Schrijf geen streepjes en geen emoticons.
Antwoord als JSON: {"naam":"...","paginatype":"...","onderdelen":["sleutel"],"visueleRichting":"...","conversiedoel":"...","wens":"... of leeg","waarom":"..."}`;
  const user = `Klant: ${klantNaam}
${klantTekst ? `Gegevens van de klant:\n${klantTekst}\n` : ''}
Beschikbare onderdelen: ${onderdelen.map((o) => `${o.key} (${o.label})`).join(', ')}
Bestaande sjablonen van deze klant: ${(bestaandeSjablonen || []).join('; ') || 'geen'}

Wat de beheerder wil: ${doel}`;
  return { systeem, user };
}

function schoonSjabloonAdvies(ruw, onderdelen, bestaandeSjablonen) {
  const r = ruw && typeof ruw === 'object' ? ruw : {};
  const geldig = new Set(onderdelen.map((o) => o.key));
  const gekozen = [...new Set(Array.isArray(r.onderdelen) ? r.onderdelen.filter((k) => geldig.has(k)) : [])];
  const naam = schoneTekst(r.naam, 80);
  const bestaat = (bestaandeSjablonen || []).some((t) => String(t).toLowerCase().trim() === naam.toLowerCase());
  return {
    naam: bestaat ? `${naam} 2` : naam,
    paginatype: schoneTekst(r.paginatype, 120),
    onderdelen: gekozen,
    visueleRichting: VISUELE_RICHTINGEN.includes(r.visueleRichting) ? r.visueleRichting : '',
    conversiedoel: schoneTekst(r.conversiedoel, 160),
    wens: schoneTekst(r.wens, 400),
    waarom: schoneTekst(r.waarom, 500)
  };
}

async function adviesNieuwSjabloon({ klantNaam, klantTekst, doel, onderdelen, bestaandeSjablonen, aiFn }) {
  const tekst = String(doel || '').trim();
  if (tekst.length < 3) throw new Error('Beschrijf in een paar woorden voor welk soort pagina dit sjabloon is.');
  const { systeem, user } = bouwSjabloonPrompt({ klantNaam, klantTekst, doel: tekst, onderdelen, bestaandeSjablonen });
  const ruw = await aiFn({ systemPrompt: systeem, userPrompt: user, reasoningEffort: 'low' });
  return schoonSjabloonAdvies(ruw, onderdelen, bestaandeSjablonen);
}

// Verbeterpunten voor een bestaand sjabloon: de AI kijkt mee en geeft hooguit vier concrete punten. Elk punt bevat een
// opdracht die met een klik naar de bestaande "pas aan" functie kan.
// Met schermafbeeldingen (de browser maakt ze van het voorbeeld, 16-10-2026) beoordeelt de AI eerst de uitstraling
// (ontwerp). Zonder afbeeldingen kan dat niet betrouwbaar uit alleen code, dan blijft het bij inhoud en structuur.
function bouwVerbeterPrompt({ klantNaam, naam, html, css, conversiedoel, aantalBeelden = 0 }) {
  const metBeeld = aantalBeelden > 0;
  const ontwerpBlok = metBeeld
    ? `Je krijgt ook schermafbeeldingen van het voorbeeld: eerst de desktopversie (van boven naar beneden, in stukken), daarna het begin van de mobiele versie.
BEOORDEEL EERST DE LOOK AND FEEL en geef daar de meeste punten over (soort "ontwerp"). Kijk naar:
- de eerste indruk bovenin (hero) op desktop en mobiel: is meteen duidelijk wat de pagina biedt en wat de volgende stap is
- ritme tussen de secties: afwisseling van lichte en getinte vlakken, te veel of te weinig lucht tussen secties
- witruimte en uitlijning binnen een sectie, kaarten en rasters die ongelijk of krap staan
- contrast en leesbaarheid van tekst, koppen en knoppen op hun achtergrond
- hiërarchie: welke kop of knop valt op, valt het juiste element op, is er een duidelijk hoofdknop
- beeldgebruik: ruimte voor foto's, verhoudingen, hoe beelden en tekst naast elkaar staan
- mobiel: tekstgrootte, knopgrootte, kolommen die onder elkaar horen te staan
Een ontwerppunt noemt de plek (bijvoorbeeld "de sectie met de drie kaarten") en wat er zichtbaar mis is. Verzin geen problemen die je niet op de afbeelding ziet.
Daarna mag je maximaal een punt geven over inhoud, structuur of vindbaarheid (soort "inhoud"), alleen als het echt iets oplevert.`
    : `Je ziet alleen de code, niet hoe de pagina eruitziet. Geef daarom geen oordeel over kleur, uitstraling of spacing. Geef punten over inhoud, structuur, conversie en vindbaarheid (soort "inhoud").`;
  const systeem = `Je bent adviseur voor een bureau dat landingspagina's maakt voor lokale bedrijven in Nederland.
Je krijgt de HTML en CSS van een sjabloon. Geef maximaal vier concrete verbeterpunten die de pagina mooier, duidelijker en sterker laten converteren.
${ontwerpBlok}
Regels:
- Elk punt is klein en uitvoerbaar. Geen algemene adviezen zoals "maak het mooier" of "gebruik meer kleur".
- "soort" is "ontwerp" of "inhoud".
- "uitleg" legt in een zin in gewone taal uit wat je ziet of mist en waarom het punt helpt.
- "opdracht" is de instructie die een ontwerper zou kunnen uitvoeren, in een of twee zinnen, bijvoorbeeld "Geef de sectie met de kaarten meer ruimte boven en onder en maak de kaarten even hoog".
- Houd de huisstijlkleuren van de klant aan, stel geen nieuwe kleuren voor.
- Als het sjabloon al goed is, geef dan minder punten of een lege lijst.
- Schrijf geen streepjes en geen emoticons.
Antwoord als JSON: {"punten":[{"soort":"ontwerp","titel":"...","uitleg":"...","opdracht":"..."}]}`;
  const user = `Klant: ${klantNaam}
Sjabloon: ${naam}
${conversiedoel ? `Doel van de bezoeker: ${conversiedoel}\n` : ''}
HTML:
${String(html || '').slice(0, 14000)}

CSS:
${String(css || '').slice(0, 6000)}`;
  return { systeem, user };
}

function schoonVerbeterpunten(ruw) {
  const lijst = ruw && Array.isArray(ruw.punten) ? ruw.punten : [];
  return lijst
    .map((p) => ({
      soort: p && p.soort === 'ontwerp' ? 'ontwerp' : 'inhoud',
      titel: schoneTekst(p && p.titel, 90),
      uitleg: schoneTekst(p && p.uitleg, 260),
      opdracht: schoneTekst(p && p.opdracht, 400)
    }))
    .filter((p) => p.titel && p.opdracht)
    .slice(0, 4);
}

async function adviesVerbeterpunten({ klantNaam, naam, blueprint, conversiedoel, beelden, aiFn }) {
  const bp = blueprint || {};
  if (!bp.htmlTemplate || !String(bp.htmlTemplate).trim()) throw new Error('Dit sjabloon heeft nog geen opzet om te beoordelen.');
  const lijstBeelden = Array.isArray(beelden) ? beelden : [];
  const { systeem, user } = bouwVerbeterPrompt({ klantNaam, naam, html: bp.htmlTemplate, css: bp.cssTemplate, conversiedoel, aantalBeelden: lijstBeelden.length });
  const ruw = await aiFn({ systemPrompt: systeem, userPrompt: user, beelden: lijstBeelden, reasoningEffort: 'low' });
  return schoonVerbeterpunten(ruw);
}

// Onderwerp van een sjabloon invullen (16-10-2026): de gebruiker typt alleen "dakkapellen", de AI leest wat de klantsite
// daarover vertelt en schrijft op basis daarvan waar de pagina's rekening mee moeten houden. Alleen wat in de bronteksten staat.
function bouwFocusVoorstelPrompt({ klantNaam, onderwerp, siteTeksten }) {
  const systeem = `Je helpt een bureau dat landingspagina's maakt voor lokale bedrijven in Nederland.
Je krijgt een onderwerp en de teksten van de website van de klant. Schrijf waar landingspagina's over dit onderwerp rekening mee moeten houden, zodat een tekstschrijver ze goed kan maken.
Regels:
- Gebruik alleen wat in de bronteksten staat. Verzin geen diensten, regels, prijzen, levertijden of aantallen.
- "onderwerp" is het onderwerp in een korte nette vorm, bijvoorbeeld "Dakkapellen plaatsen en renoveren".
- "instructie" is een lopende tekst van drie tot zes korte zinnen: voor wie de pagina is, welke soorten of onderdelen de klant noemt, wat de werkwijze is, welke voordelen de klant zelf noemt en wat de pagina niet moet beloven.
- Staat er in de bronteksten weinig of niets over dit onderwerp, zeg dat dan in "opmerking" en houd de instructie kort en algemeen.
- Schrijf geen streepjes en geen emoticons.
Antwoord als JSON: {"onderwerp":"...","instructie":"...","opmerking":"..."}`;
  const user = `Klant: ${klantNaam}
Onderwerp: ${onderwerp}

Bronteksten van de website van de klant:
${String(siteTeksten || '').slice(0, 30000) || '(geen bronteksten beschikbaar)'}`;
  return { systeem, user };
}

function schoonFocusVoorstel(ruw, onderwerpInvoer) {
  const r = ruw && typeof ruw === 'object' ? ruw : {};
  return {
    onderwerp: schoneTekst(r.onderwerp, 120) || schoneTekst(onderwerpInvoer, 120),
    instructie: schoneTekst(r.instructie, 1200),
    opmerking: schoneTekst(r.opmerking, 300)
  };
}

async function adviesFocus({ klantNaam, onderwerp, siteTeksten, aiFn }) {
  const o = schoneTekst(onderwerp, 120);
  if (o.length < 3) throw new Error('Vul eerst in waar de pagina\'s over gaan, bijvoorbeeld "Dakkapellen".');
  const { systeem, user } = bouwFocusVoorstelPrompt({ klantNaam, onderwerp: o, siteTeksten });
  const ruw = await aiFn({ systemPrompt: systeem, userPrompt: user, reasoningEffort: 'low' });
  const voorstel = schoonFocusVoorstel(ruw, o);
  if (!String(siteTeksten || '').trim() && !voorstel.opmerking) voorstel.opmerking = 'De website van de klant kon niet gelezen worden, dit voorstel is dus algemeen.';
  return voorstel;
}

module.exports = {
  VISUELE_RICHTINGEN, maakSlug, bouwPaginaPrompt, schoonPaginaAdvies, adviesNieuwePagina,
  bouwSjabloonPrompt, schoonSjabloonAdvies, adviesNieuwSjabloon,
  bouwVerbeterPrompt, schoonVerbeterpunten, adviesVerbeterpunten,
  bouwFocusVoorstelPrompt, schoonFocusVoorstel, adviesFocus
};
