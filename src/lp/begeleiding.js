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

// Verbeterpunten voor een bestaand sjabloon: de AI kijkt mee en geeft hooguit drie concrete punten. Elk punt bevat een
// opdracht die met een klik naar de bestaande "pas aan" functie kan.
function bouwVerbeterPrompt({ klantNaam, naam, html, css, conversiedoel }) {
  const systeem = `Je bent adviseur voor een bureau dat landingspagina's maakt voor lokale bedrijven in Nederland.
Je krijgt de HTML en CSS van een sjabloon. Geef maximaal drie concrete verbeterpunten die de pagina beter laten converteren, beter leesbaar maken of sterker maken voor Google en AI antwoorden.
Regels:
- Elk punt is klein en uitvoerbaar. Geen algemene adviezen.
- "uitleg" legt in een zin in gewone taal uit waarom het punt helpt.
- "opdracht" is de instructie die een ontwerper zou kunnen uitvoeren, in een of twee zinnen, bijvoorbeeld "Zet de knop Offerte aanvragen ook onder de eerste tekst".
- Als het sjabloon al goed is, geef dan minder punten of een lege lijst.
- Schrijf geen streepjes en geen emoticons.
Antwoord als JSON: {"punten":[{"titel":"...","uitleg":"...","opdracht":"..."}]}`;
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
    .map((p) => ({ titel: schoneTekst(p && p.titel, 90), uitleg: schoneTekst(p && p.uitleg, 260), opdracht: schoneTekst(p && p.opdracht, 400) }))
    .filter((p) => p.titel && p.opdracht)
    .slice(0, 3);
}

async function adviesVerbeterpunten({ klantNaam, naam, blueprint, conversiedoel, aiFn }) {
  const bp = blueprint || {};
  if (!bp.htmlTemplate || !String(bp.htmlTemplate).trim()) throw new Error('Dit sjabloon heeft nog geen opzet om te beoordelen.');
  const { systeem, user } = bouwVerbeterPrompt({ klantNaam, naam, html: bp.htmlTemplate, css: bp.cssTemplate, conversiedoel });
  const ruw = await aiFn({ systemPrompt: systeem, userPrompt: user, reasoningEffort: 'low' });
  return schoonVerbeterpunten(ruw);
}

module.exports = {
  VISUELE_RICHTINGEN, maakSlug, bouwPaginaPrompt, schoonPaginaAdvies, adviesNieuwePagina,
  bouwSjabloonPrompt, schoonSjabloonAdvies, adviesNieuwSjabloon,
  bouwVerbeterPrompt, schoonVerbeterpunten, adviesVerbeterpunten
};
