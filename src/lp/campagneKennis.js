// Vaste kennis voor het bouwen van campagnepagina's (Bouwen met chat, 24-10-2026).
// Doel: Dylan hoeft bij de start niet steeds uit te leggen hoe een goede conversiepagina eruitziet. Deze tekst gaat bij elk
// chatbericht mee, voor elke klant. Klantspecifieke wensen staan apart in profile.campagneVoorkeuren.
// Bewust geen cijfers of "onderzoek zegt" beweringen: alleen werkwijze die de AI kan toepassen.

const CAMPAGNE_KENNIS = `KENNIS OVER CAMPAGNEPAGINA'S (altijd toepassen)

Wat een campagnepagina is: een pagina voor bezoekers die net op een advertentie klikten. Ze kennen het bedrijf meestal niet,
hebben haast en willen zeker weten dat ze op de goede plek zijn. De pagina heeft een taak: de bezoeker de ene vervolgstap laten zetten.
Het is geen SEO pagina en geen homepage. Schrijf dus niet om gevonden te worden, maar om te overtuigen.

1. Aansluiting op de advertentie (belangrijkste regel)
- De h1 herhaalt de belofte uit de advertentie of het zoekwoord, in de woorden van de bezoeker. Zoekt iemand "aanbouw laten bouwen Bollenstreek", dan staat dat in de kop.
- De eerste zin eronder zegt wat de bezoeker krijgt en wat de volgende stap is.
- Een aanbieding uit de advertentie (gratis opname, vrijblijvende offerte, reactie binnen een werkdag) staat ook boven de scrollgrens, in dezelfde woorden.
- Weet je de advertentietekst of het zoekwoord niet, vraag er dan naar voordat je bouwt, of kies zelf een uitgangspunt en noem dat in je antwoord.

2. Boven de scrollgrens (zichtbaar zonder scrollen, ook op mobiel)
- Kop met de belofte, een korte uitleg, de primaire knop en een reden om te vertrouwen (bijvoorbeeld werkgebied, ervaring of een echte beoordeling).
- Op mobiel moet de knop zichtbaar zijn zonder te scrollen. Houd de hero kort.

3. Een doel, een actie
- Alle knoppen doen hetzelfde en wijzen naar de conversiesectie (id="aanvraag"). Geen tweede doel, geen concurrerende knoppen.
- Herhaal de knop na elk groot onderdeel (bijvoorbeeld na het bewijs en na de werkwijze), met dezelfde tekst of een variant ervan.
- Knoptekst noemt wat de bezoeker krijgt ("Vraag uw offerte aan", "Plan een gratis opname"), niet "Verstuur" of "Klik hier".

4. Vertrouwen en bewijs
- Gebruik alleen bewijs dat echt bestaat in de bronnen: echte reviews, echte projecten, aantal jaren, keurmerken, werkgebied.
- Geen bewijs beschikbaar? Laat het onderdeel weg. Verzin nooit een review, cijfer, garantie of keurmerk.
- Zet het sterkste bewijs hoog op de pagina en een tweede keer vlak voor het formulier.

5. Bezwaren wegnemen
- Denk na over wat de bezoeker tegenhoudt (prijs, gedoe, tijd, betrouwbaarheid, wat gebeurt er na mijn aanvraag) en beantwoord dat concreet.
- Beschrijf wat er na het invullen gebeurt: wie reageert, hoe snel en wat dat kost of niet kost. Alleen als dat uit de bronnen of van Dylan komt.
- Veelgestelde vragen gaan over twijfels voor de aanvraag, niet over uitleg voor zoekmachines.

6. Formulier
- Zo kort mogelijk. Vraag alleen wat nodig is voor een eerste reactie. Elk extra veld kost aanvragen.
- Zet bij het formulier een korte zin die zegt wat er daarna gebeurt.
- Het formulier is {{formulier}} van de klant, je verzint geen eigen velden.

7. Tekst en opbouw
- Schrijf voor een bezoeker die scant: korte alinea's, duidelijke tussenkoppen, voordelen voor de bezoeker voor eigenschappen van het bedrijf.
- Praat over de situatie van de bezoeker ("u wilt meer ruimte in huis"), niet over het bedrijf ("wij zijn al jaren actief").
- Schrap alles wat niet helpt bij de beslissing. Een campagnepagina is korter en gerichter dan een dienstenpagina.
- Geen menu en geen links naar andere pagina's of andere diensten, zodat de bezoeker niet wegdwaalt.

8. Wat je niet doet
- Geen SEO teksten, geen lange uitleg over het vak, geen opsomming van alle diensten van het bedrijf.
- Geen verzonnen urgentie ("nog maar 2 plekken") en geen claims zonder bron.
- Geen stockachtige algemeenheden zoals "kwaliteit staat bij ons voorop".

KANAAL (pas de pagina aan op waar de bezoeker vandaan komt)
- Google Ads zoeken: de bezoeker zoekt actief en wil snel een oplossing. Kop = het zoekwoord. Direct bewijs en een korte weg naar de aanvraag.
- Meta Ads: de bezoeker werd onderbroken tijdens het scrollen. Begin bij de herkenbare situatie of het probleem, dan de oplossing. Meer beeld, meer overtuigen, laagdrempelige actie.
- LinkedIn Ads: zakelijke bezoeker, vaak een beslisser. Zakelijke toon, concreet resultaat, bewijs van vergelijkbare klanten, een duidelijke volgende stap zoals een gesprek of download.
- Onbekend kanaal: vraag het, of ga uit van Google zoeken.`;

const CAMPAGNE_START = `CAMPAGNESTART
Voor je een nieuwe pagina bouwt, moet je deze vijf dingen weten: kanaal (Google, Meta of LinkedIn), doel (offerte, contact, afspraak, aankoop of download), doelgroep, aanbieding en de advertentietekst of het zoekwoord.
- Haal wat je kunt uit de klantgegevens, de site, het klantverhaal en wat Dylan al zei. Vraag alleen wat echt ontbreekt, hooguit twee vragen tegelijk.
- Weet je genoeg om een verstandige eerste versie te maken, bouw dan meteen en zeg welke uitgangspunten je koos, zodat Dylan kan bijsturen.
- Zijn kanaal en advertentietekst of zoekwoord allebei onbekend, stel dan eerst die vraag (actie "geen").`;

const KOP_ALTERNATIEF = `ALTERNATIEVE KOP
Bij elke nieuwe opbouw ("bouw") geef je in "kopAlternatief" een tweede h1 met een andere invalshoek (bijvoorbeeld resultaat in plaats van probleem, of de aanbieding vooraan), zodat Dylan kan testen. Alleen de tekst, geen uitleg. Gebruik dezelfde feiten.`;

const ONTHOUD_REGEL = `VOORKEUREN ONTHOUDEN
Zegt Dylan iets dat voor deze klant altijd moet gelden bij campagnepagina's ("bij MAC Bouw is het doel altijd een offerte", "noem nooit prijzen", "altijd de telefoon in de hero"), zet het dan als korte zin in "onthoud". Zeg in je antwoord dat je het onthoudt. Zet er niets in dat alleen voor deze ene pagina geldt en niets wat je zelf bedacht hebt.`;

function bouwCampagneVoorkeurenBlok(voorkeuren) {
  const lijst = (Array.isArray(voorkeuren) ? voorkeuren : []).map((v) => String(v || '').trim()).filter(Boolean).slice(0, 20);
  if (!lijst.length) return '';
  return `VASTE VOORKEUREN VAN DYLAN VOOR DEZE KLANT (gelden voor elke campagnepagina, volg ze):\n${lijst.map((v) => `- ${v}`).join('\n')}`;
}

// Voegt nieuwe voorkeuren toe aan de bestaande, zonder dubbelen (hoofdletterongevoelig), maximaal 20.
function voegVoorkeurenToe(bestaand, nieuw) {
  const uit = (Array.isArray(bestaand) ? bestaand : []).map((v) => String(v || '').trim()).filter(Boolean);
  const gezien = new Set(uit.map((v) => v.toLowerCase()));
  for (const v of (Array.isArray(nieuw) ? nieuw : [])) {
    const s = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!s || gezien.has(s.toLowerCase())) continue;
    gezien.add(s.toLowerCase());
    uit.push(s);
  }
  return uit.slice(-20);
}

// ---- Een paginabouwer met twee soorten (24-10-2026) ----
// Nieuwe pagina krijgt de keuze SEO/GEO of campagne. Een campagnepagina gebruikt het vaste campagnesjabloon van de klant
// (blueprintId "campagne", een keer gemaakt en door Dylan goedgekeurd) en dezelfde schrijfroute als een SEO pagina,
// maar met deze regels in plaats van de SEO/GEO regels. Header, footer en indexering blijven gelijk (besluit Dylan).

const CAMPAGNE_BLUEPRINT = 'campagne';
// Een klant kan meerdere campagnesjablonen hebben: "campagne", "campagne-2", "campagne-3" enzovoort (24-10-2026).
function isCampagneBlueprintId(id) {
  return id === CAMPAGNE_BLUEPRINT || /^campagne-\d+$/.test(String(id || ''));
}
function volgendeCampagneBlueprintId(bestaandeIds) {
  const gebruikt = new Set((bestaandeIds || []).map(String));
  if (!gebruikt.has(CAMPAGNE_BLUEPRINT)) return CAMPAGNE_BLUEPRINT;
  let n = 2;
  while (gebruikt.has(`${CAMPAGNE_BLUEPRINT}-${n}`)) n += 1;
  return `${CAMPAGNE_BLUEPRINT}-${n}`;
}
const KANALEN = { google: 'Google Ads (zoeken)', meta: 'Meta Ads (Facebook en Instagram)', linkedin: 'LinkedIn Ads' };

function schoonKanaal(k) {
  const s = String(k || '').toLowerCase();
  return KANALEN[s] ? s : '';
}

// De campagnegegevens van een pagina, of null bij een SEO/GEO pagina.
function campagneVan(page) {
  const invoer = (page && page.invoer) || {};
  const isCampagne = invoer._soort === 'campagne' || (page && isCampagneBlueprintId(page.blueprint));
  if (!isCampagne) return null;
  return {
    kanaal: schoonKanaal(invoer._kanaal) || 'google',
    zoekwoord: String(invoer._zoekwoord || '').trim(),
    aanbieding: String(invoer._aanbieding || '').trim()
  };
}

// Invoervelden voor een nieuwe campagnepagina (begin met _, dan tellen ze niet als sjabloonveld).
function campagneInvoer({ kanaal, zoekwoord, aanbieding } = {}) {
  return {
    _soort: 'campagne',
    _kanaal: schoonKanaal(kanaal) || 'google',
    _zoekwoord: String(zoekwoord || '').trim().slice(0, 500),
    _aanbieding: String(aanbieding || '').trim().slice(0, 300)
  };
}

function bouwCampagneBlok(campagne, voorkeuren) {
  if (!campagne) return '';
  const regels = [
    `Kanaal: ${KANALEN[campagne.kanaal] || KANALEN.google}`,
    campagne.zoekwoord ? `Zoekwoord of advertentietekst waar de bezoeker op klikte: ${campagne.zoekwoord}` : 'Zoekwoord of advertentietekst: niet opgegeven. Het onderwerp hieronder is een opdracht aan jou en geen tekst om over te nemen. Bedenk zelf de belofte die een bezoeker van deze dienst aanspreekt, in zijn woorden.',
    campagne.aanbieding ? `Aanbieding uit de advertentie (noem die boven de scrollgrens, in dezelfde woorden): ${campagne.aanbieding}` : 'Aanbieding: geen aparte aanbieding opgegeven, verzin er geen.'
  ];
  const vk = bouwCampagneVoorkeurenBlok(voorkeuren);
  return `\n\nDEZE PAGINA IS EEN CAMPAGNEPAGINA:\n${regels.map((r) => `- ${r}`).join('\n')}${vk ? `\n\n${vk}` : ''}`;
}

const CAMPAGNE_SJABLOON_REGELS = `DIT SJABLOON IS EEN CAMPAGNEPAGINA (geen SEO pagina). Het is het vaste sjabloon voor alle advertentiepagina's van deze klant (Google Ads, Meta Ads, LinkedIn Ads).
${CAMPAGNE_KENNIS}

OPBOUW VAN HET SJABLOON (in deze volgorde):
1. Hero: h1, korte uitleg, een slot voor een aanbieding of belofte naast de knop (heroAanbieding), de primaire knop (lp-cta-button naar #aanvraag) en een foto. Op mobiel staat de knop boven de scrollgrens.
2. Vertrouwensbalk direct onder de hero: drie of vier korte punten (lijst).
3. Herkenbare situaties of wat de bezoeker krijgt (lijst met icoon, titel, tekst).
4. Bewijs: projecten of foto's van eigen werk, met een knop naar #aanvraag eronder.
5. Werkwijze in drie tot vijf stappen (lijst), met een knop naar #aanvraag eronder.
6. Reviews (lijst met naam en tekst). Dit onderdeel moet leeg kunnen blijven.
7. Twijfels weg: drie tot vijf vragen met antwoord (lijst).
8. Conversiesectie met id="aanvraag": kop, korte intro, een zin wat er na het versturen gebeurt (naAanvraagTekst) en de marker {{formulier}} op de volle breedte.
Geen menu, geen links naar andere pagina's, GEEN slot "linksItems" en geen linkRegels. Geen antwoordblok voor zoekmachines en geen adresblok.
Er is precies een h1. Alle knoppen gebruiken hetzelfde slot ctaLabel en ctaHref, of een eigen labelslot met href "#aanvraag".
Het sjabloon heeft GEEN invoervelden voor kanaal, zoekwoord, belofte of dienst: die komen uit het formulier waarmee de pagina wordt gemaakt. Maak dus nooit invoerVelden aan voor advertentiekanaal, belofte of dienst.
Opmaak van de hero: de tekstkolom en de fotokolom staan naast elkaar in een grid met minmax(0, 1fr) voor beide kolommen, zodat tekst nooit onder of over de foto loopt. De h1 gebruikt font-size: clamp(2rem, 4.2vw, 3.3rem) met overflow-wrap: break-word. Een accentregel onder de h1 is even groot als de h1 of kleiner en breekt netjes af op de breedte van de kolom.
De kicker en de h1 zijn aparte slots met aparte tekst. De knoptekst (ctaLabel) staat nooit in het kopaccent.`;

const CAMPAGNE_CONTENT_REGELS = `DIT IS EEN CAMPAGNEPAGINA, GEEN SEO PAGINA. Schrijf om te overtuigen, niet om gevonden te worden. Deze regels gaan voor op alle andere regels over SEO, zoekmachines, plaatsnamen en interne links.
${CAMPAGNE_KENNIS}

SCHRIJVEN VOOR DEZE CAMPAGNEPAGINA:
- h1: de belofte uit het zoekwoord of de advertentie, in de woorden van de bezoeker. Geen "[Dienst] in [plaats]" patroon tenzij het zoekwoord dat zelf is.
- Herhaal de plaatsnaam niet voor zoekmachines. Noem het werkgebied alleen waar het de bezoeker helpt (vertrouwensbalk of twijfels).
- Vragen: alleen twijfels die een aanvraag tegenhouden (kosten, planning, gedoe, wat gebeurt er na mijn aanvraag). Drie tot vijf vragen, kort antwoord.
- Knopteksten noemen wat de bezoeker krijgt. Gebruik op alle knoppen dezelfde actie.
- Zet geen interne links in de tekst en vul geen linksItems.
- metaTitle en metaDescription: vul ze in binnen de lengte-eisen, gericht op de belofte en de aanbieding, zonder plaatsnaampatroon.

VRIJHEID:
- Jij bepaalt hoe de pagina wordt: invalshoek, wat je noemt en wat je weglaat, de volgorde van de argumenten, de toon en de lengte per onderdeel. Je hoeft niet alle feiten of alle diensten van de klant te gebruiken. Laat een slot leeg of kort als je er geen sterke tekst voor hebt.
- Schrijf zoals een goede copywriter dat met de hand zou doen: natuurlijk, concreet, in de woorden van de bezoeker, zonder opvulzinnen die voor elk bedrijf zouden kunnen gelden.
- Verzin geen harde gegevens (prijzen, jaartallen, aantallen, garanties, adressen, namen van klanten of projecten) die niet in de bronnen staan.`;

// Maakt van een gegenereerd sjabloon een campagnesjabloon: geen interne links, soort vastgelegd.
function maakCampagneBlueprint(blueprint) {
  const bp = { ...(blueprint || {}), templateFormat: 'slots', paginaSoort: 'campagne' };
  // Een linksItems slot dat toch in de HTML staat blijft bestaan (anders breekt het sjabloon), maar is nooit verplicht.
  const inHtml = /linksItems/.test(String(bp.htmlTemplate || ''));
  if (Array.isArray(bp.slots)) bp.slots = bp.slots.filter((s) => s && (s.key !== 'linksItems' || inHtml)).map((s) => (s.key === 'linksItems' ? { ...s, verplicht: false } : s));
  bp.linkRegels = { minimumInterneLinks: 0, minimumNaarZusterpaginas: 0, reasonRequired: false };
  // Kanaal, zoekwoord en aanbieding komen uit het formulier van Nieuwe pagina, niet uit invoervelden van het sjabloon.
  bp.invoerVelden = [];
  return bp;
}

module.exports = {
  CAMPAGNE_KENNIS, CAMPAGNE_START, KOP_ALTERNATIEF, ONTHOUD_REGEL, bouwCampagneVoorkeurenBlok, voegVoorkeurenToe,
  CAMPAGNE_BLUEPRINT, isCampagneBlueprintId, volgendeCampagneBlueprintId, KANALEN, schoonKanaal, campagneVan, campagneInvoer, bouwCampagneBlok,
  CAMPAGNE_SJABLOON_REGELS, CAMPAGNE_CONTENT_REGELS, maakCampagneBlueprint
};
