// Design tokens per klant: de enige plek waar merkherkenning (kleur, font) wordt
// vastgelegd. Layoutkwaliteit zelf zit in de blokken/stylesheet, niet hier —
// zie besluit 10 in besluiten.md: merkherkenning en layoutkwaliteit zijn bewust
// gescheiden, klantsite kopieren is niet het doel.
//
// googleFonts (05-09-2026): array met exacte Google Font-familienamen die WERKELIJK op de
// pagina geladen moeten worden (zie style.js). Leeg = er wordt niets extra's geladen (fontHeading/
// fontBody blijven gewoon gelden als CSS-waarde, bv. "inherit" volgt dan het WordPress-thema).
// Zet hier ALLEEN een naam in die aantoonbaar een echte Google Font van de klant is (bv. gevonden
// via huisstijl.js se site-analyse) — nooit een gok, anders laadt de pagina een font die niet
// bestaat of die niet van de klant is.
//
// Nieuwe klant toevoegen = hier een object bijzetten met dezelfde velden.

const defaultTokens = {
  primary: '#0F5257',
  primaryDark: '#0B3D40',
  secondary: '#5EC3B5',
  text: '#1F1F1F',
  textMuted: '#5B5B5B',
  bg: '#FFFFFF',
  bgAlt: '#F6F6F4',
  border: '#E3E1DC',
  maxWidth: '1200px',
  radius: '8px',
  // Vormtaal (25-09-2026): naast kleuren en lettertypes bepalen deze instellingen hoe een klantsite
  // "aanvoelt" (hoofdletter-koppen, kleur van de koppen, vierkante of ronde knoppen, rondingen van
  // kaarten). Aanleiding: een sjabloon voor MAC Bouw had de juiste kleuren en lettertypes maar voelde
  // te zacht en rond, omdat dit nergens vastlag. Leeg laten = geen wijziging voor bestaande klanten
  // (headingColor valt terug op primaryDark, de rondingen op radius, de rest op gewoon).
  // Meten op de echte klantsite (browser, getComputedStyle op h1 tot h3 en knoppen), nooit gokken.
  headingColor: '',
  headingTransform: 'none',
  headingWeight: '700',
  buttonTransform: 'none',
  buttonRadius: '',
  cardRadius: '',
  // Korte beschrijving van de sfeer voor de AI-sjabloonprompt, in gewone taal.
  sfeer: '',
  fontHeading: 'inherit',
  fontBody: 'inherit',
  // fontAccent (21-09-2026, zie besluiten.md "Yikes-lettertype van Roots, precisering"): apart van
  // fontHeading. Sommige klanten gebruiken voor NORMALE koppen (h1-h6, volledige zinnen) hun gewone
  // merklettertype, maar hebben daarnaast een los, decoratief lettertype voor KORTE, vaak
  // hoofdletter-labels/kickers (bv. "WELKOM BIJ" boven een hero-titel) - dat is geen aparte
  // uitzondering maar een bewust ander gebruik. Leeg/ontbrekend = valt terug op fontHeading (geen
  // wijziging t.o.v. bestaand gedrag voor klanten die dit niet hebben). Wordt alleen gebruikt via de
  // losse ".lp-kicker"-hulpklasse (zie style.js), nooit automatisch op h1-h6 zelf.
  fontAccent: '',
  googleFonts: [],
  // customFonts (21-09-2026, zie besluiten.md "Yikes-lettertype van Roots"): net als googleFonts,
  // maar voor een lettertype dat GEEN Google Font is (dus zelf-gehost, via public/fonts/ - zie
  // style.js, renderCustomFontFaces). Leeg = geen wijziging t.o.v. bestaand gedrag. Elk item:
  // { family, bestand, gewicht, stijl }. Zet hier ALLEEN een lettertype dat de klant zelf expliciet
  // heeft aangeleverd (bv. een .ttf-bestand) — nooit een aanname, zelfde principe als googleFonts.
  customFonts: [],
  ctaBg: '#0F5257',
  ctaText: '#FFFFFF',
  // themeOverrideCss (22-09-2026, zie besluiten.md/systeem-logboek.md "WordPress-thema toonde eigen
  // paginatitel"): ontsnappingsluik voor een BEVESTIGDE, klant-specifieke WordPress-thema-
  // eigenaardigheid die niet met de gedeelde regels in style.js is op te lossen (bv. een ander
  // thema dan bb-theme met een vergelijkbaar probleem). Rauwe CSS-tekst, ongewijzigd overgenomen in
  // het <style>-blok — dus zelf verantwoordelijk voor scoping (meestal BEWUST buiten de rootClass,
  // want het gaat per definitie om een thema-element buiten onze eigen wrapper). Leeg (standaard) =
  // geen wijziging t.o.v. bestaand gedrag. Zet hier ALLEEN een regel die eerst live op de echte
  // klantsite is bevestigd (zelfde principe als googleFonts/customFonts hierboven) — nooit een gok.
  themeOverrideCss: ''
};

const clientTokens = {
  roots: {
    ...defaultTokens,
    primary: '#f2d233',
    primaryDark: '#111111',
    secondary: '#84c6e8',
    text: '#222222',
    bg: '#ffffff',
    bgAlt: '#f6f6f6',
    maxWidth: '1240px',
    ctaBg: '#111111',
    ctaText: '#f2d233',
    // fontHeading/fontBody (08-09-2026): bevestigd door Dylan zelf via de Computed-tab in de
    // browser devtools op hostelroots.nl (zie besluiten.md, "Lettertype overnemen van de
    // klantsite"). De cascade toont "Ubuntu", sans-serif voor de ALGEMENE h1-h6-regel EN voor body
    // — dat is het echte, sitebrede basislettertype, ook voor koppen.
    //
    // googleFonts WEL gevuld (bijgesteld 08-09-2026): eerst leeg gelaten in de aanname dat het
    // Roots-thema Ubuntu zelf al overal laadt, maar dat geldt alleen BINNEN de echte WordPress-
    // pagina — in een los voorbeeldscherm (of andere context buiten hostelroots.nl) heeft de
    // browser geen toegang tot dat zelf-gehoste lettertypebestand en valt stilzwijgend terug op
    // een systeemfont. Ubuntu is zelf ook gewoon een publiek, bestaand Google Font (los van hoe
    // Roots 'm host), dus laten we 'm voortaan altijd zelf laden — dat werkt dan overal
    // betrouwbaar, ongeacht de context waarin de pagina bekeken wordt.
    //
    // fontAccent = Yikes (21-09-2026, precisering op 21-09-2026 met devtools-bewijs van Dylan):
    // Marion (Hostel Roots) heeft het echte lettertype-bestand aangeleverd. Eerst per ongeluk breed
    // op fontHeading gezet (alle h1-h3), maar Dylan controleerde vervolgens zelf de cascade in de
    // devtools op TWEE concrete elementen: de grote "Comfy like a hotel..."-kop (een h6 in een
    // rich-text-module) rendert gewoon Ubuntu, terwijl het korte "WELKOM BIJ"-label (een h3 met
    // class ".fl-heading", een Beaver Builder Heading-module) wél degelijk Yikes rendert (bevestigd
    // via "Gerenderde lettertypen": PostScript-naam YikesMedium, Netwerkresource, 10 gliefen — dus
    // écht geladen, geen fallback). De cascade zelf bevestigt de regel: ".fl-heading { font-family:
    // Yikes, "Comic Sans MS" }" wint van de algemene "h1,h2,h3,h4,h5,h6 { font-family: Ubuntu }"
    // puur op CSS-specificiteit (class > tag), voor precies dat ene type element.
    // Conclusie: Yikes is dus GEEN algemeen koppenlettertype maar een bewust, apart gebruikt
    // decoratief accentlettertype voor korte, hoofdletter-labels/kickers. Vandaar hier fontAccent in
    // plaats van fontHeading — zie style.js voor de ".lp-kicker"-hulpklasse die fontAccent gebruikt.
    // Dit was EERDER (08-09-2026) nog aangezien voor een bug/placeholder-instelling op de Roots-site
    // zelf — dat klopte dus ook al niet (zie de correctie in besluiten.md), en nu is ook de PRECIEZE
    // manier waarop Roots het gebruikt vastgesteld, niet alleen dát het een echt lettertype is.
    // Belangrijk: dit is een KLEIN, decoratief lettertype (86 glyphs) — geen accenten (é/ë/ï/etc),
    // geen dubbele punt/puntkomma, geen eurotekentje. Elk ontbrekend teken valt automatisch (per
    // teken, niet per element) terug op het volgende font in de stack, dus Ubuntu — vandaar Ubuntu
    // als expliciete tweede naam in fontAccent in plaats van meteen sans-serif.
    fontHeading: "'Ubuntu', sans-serif",
    fontBody: "'Ubuntu', sans-serif",
    fontAccent: "'Yikes', 'Ubuntu', sans-serif",
    googleFonts: ['Ubuntu'],
    customFonts: [
      { family: 'Yikes', bestand: 'yikes-medium.ttf', gewicht: 500, stijl: 'normal' }
    ]
  },
  // MAC Bouw (25-09-2026): waarden uit het huisstijlvoorstel in de intake (knop "Analyseer huisstijl"
  // op https://mac-bouw.nl/, door Dylan bekeken voor het verzenden). Jost is een publiek Google Font
  // en staat daarom ook in googleFonts, anders laadt het niet buiten de eigen WordPress-pagina
  // (zie checkFontLoadConsistency hieronder). Gecorrigeerd op 25-09-2026 na meting in de browser op
  // mac-bouw.nl (getComputedStyle + geladen fonts): body en paragrafen zijn Jost (400, 16px, #777777),
  // alle koppen (h2, 48px 600, hero 90px 700) en knoppen (700, hoofdletters) zijn Titillium Web. Het
  // eerste huisstijlvoorstel gaf Jost voor alles, dat klopte niet voor de koppen.
  macbouw: {
    ...defaultTokens,
    primary: '#0e7bba',
    primaryDark: '#083d59',
    secondary: '#ff6600',
    text: '#0c0a0a',
    textMuted: '#777777',
    bg: '#ffffff',
    // bgAlt en border gecorrigeerd op 25-09-2026: het huisstijlvoorstel gaf #eae2e2 (een rozige tint) maar die
    // kleur staat nergens als vlak op mac-bouw.nl. Gemeten op de site: wit, lichtgrijs #f6f6f6 (vlakken en
    // formuliervelden) en donkere tinten (#3f444b, #151515). Rand: #eaecf1 komt uit de formulier-CSS van de site.
    bgAlt: '#f6f6f6',
    border: '#eaecf1',
    maxWidth: '1200px',
    radius: '8px',
    fontHeading: "'Titillium Web', sans-serif",
    fontBody: "'Jost', sans-serif",
    googleFonts: ['Jost', 'Titillium Web'],
    // Vormtaal, gemeten op mac-bouw.nl op 25-09-2026 (getComputedStyle): koppen bijna zwart (h1 #000000,
    // h2 #0c0a0a), hoofdletters, gewicht 600 (hero 700), knoppen hoofdletters gewicht 700 en vierkant (0px).
    headingColor: '#0c0a0a',
    headingTransform: 'uppercase',
    headingWeight: '600',
    buttonTransform: 'uppercase',
    buttonRadius: '0px',
    cardRadius: '2px',
    sfeer: 'Stoer, strak en betrouwbaar, passend bij een aannemer: rechte lijnen, (bijna) vierkante hoeken, ' +
      'koppen en knoppen in hoofdletters, veel witruimte en weinig decoratie. Animaties subtiel houden. ' +
      'Kleur: blauw is de hoofdkleur (knoppen, iconen, links). Oranje (var(--lp-secondary)) komt op de klantsite ' +
      'alleen voor als accent in een wisselend woord in de hero en bij hover, dus gebruik oranje spaarzaam: ' +
      'hooguit een onderstreping of een enkel kopwoord per pagina, NIET voor iconen, sterren, stapnummers of ' +
      'grote vlakken. Achtergronden zijn wit of lichtgrijs (var(--lp-bg-alt)), nooit gekleurde of roze vlakken.',
    ctaBg: '#0e7bba',
    ctaText: '#ffffff'
  }
  // jmb: { ... } — toevoegen zodra JMB aan de beurt is (bouwstap 5).
};

function getTokens(clientId) {
  return clientTokens[clientId] || defaultTokens;
}

// Zelfcontrole (08-09-2026, zie besluiten.md "Zelfcontrole inbouwen"): mechanische check die het
// exacte foutpatroon van de Roots-lettertypebug afvangt VOORDAT die opnieuw kan sluipen. Een custom
// lettertype (dus geen "inherit" en geen generiek systeemfont) hoort altijd ook in googleFonts te
// staan, anders wordt 'm buiten de eigen WordPress-pagina van de klant niet geladen en valt de
// browser stilzwijgend terug op iets anders. Puur mechanisch, geen AI-oordeel nodig.
const GENERIEKE_FONTS = new Set([
  'inherit', 'initial', 'unset', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
  '-apple-system', 'blinkmacsystemfont', 'arial', 'helvetica', 'helvetica neue', 'verdana',
  'tahoma', 'geneva', 'georgia', 'times new roman', 'times', 'courier new', 'courier',
  'trebuchet ms', 'segoe ui'
]);

function eersteFontNaam(cssWaarde) {
  if (!cssWaarde) return null;
  const eerste = String(cssWaarde).split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  return eerste || null;
}

function checkFontLoadConsistency(tokens) {
  const problemen = [];
  const googleFontsLower = (tokens.googleFonts || []).map((naam) => String(naam).toLowerCase());
  // customFonts (21-09-2026, zie de Yikes-toevoeging hierboven): een zelf-gehost lettertype telt
  // net zo goed als "wordt echt geladen" mee als een Google Font — het wordt alleen via een eigen
  // @font-face geladen (style.js) in plaats van via de Google Fonts <link>.
  const customFontsLower = (Array.isArray(tokens.customFonts) ? tokens.customFonts : [])
    .map((f) => (f && f.family ? String(f.family).toLowerCase() : null))
    .filter(Boolean);
  // fontAccent (21-09-2026, Yikes/Roots-precisering) hoort in dezelfde check: het is ook een
  // CSS-waarde die daadwerkelijk geladen moet zijn, ook al wordt het maar op de losse
  // .lp-kicker-hulpklasse toegepast (zie style.js) in plaats van op h1-h6 zelf.
  ['fontHeading', 'fontBody', 'fontAccent'].forEach((veld) => {
    const naam = eersteFontNaam(tokens[veld]);
    if (!naam) return;
    const naamLower = naam.toLowerCase();
    if (GENERIEKE_FONTS.has(naamLower)) return;
    if (googleFontsLower.includes(naamLower)) return;
    if (customFontsLower.includes(naamLower)) return;
    problemen.push(
      `${veld} staat op een niet-generiek lettertype ("${naam}") dat niet voorkomt in googleFonts of ` +
      'customFonts — wordt dus mogelijk niet geladen buiten de eigen WordPress-pagina van de klant.'
    );
  });
  return problemen;
}

module.exports = { defaultTokens, clientTokens, getTokens, checkFontLoadConsistency };
