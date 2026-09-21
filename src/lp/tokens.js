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
  fontHeading: 'inherit',
  fontBody: 'inherit',
  googleFonts: [],
  // customFonts (21-09-2026, zie besluiten.md "Yikes-lettertype van Roots"): net als googleFonts,
  // maar voor een lettertype dat GEEN Google Font is (dus zelf-gehost, via public/fonts/ - zie
  // style.js, renderCustomFontFaces). Leeg = geen wijziging t.o.v. bestaand gedrag. Elk item:
  // { family, bestand, gewicht, stijl }. Zet hier ALLEEN een lettertype dat de klant zelf expliciet
  // heeft aangeleverd (bv. een .ttf-bestand) — nooit een aanname, zelfde principe als googleFonts.
  customFonts: [],
  ctaBg: '#0F5257',
  ctaText: '#FFFFFF'
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
    // klantsite"). De cascade toont "Ubuntu", sans-serif TWEE keer onafhankelijk van elkaar (de
    // regel voor h1-h6 EN de regel voor body) — dat is het echte, sitebrede lettertype. Een
    // los .fl-heading-element (een Beaver Builder-heading-module) laat daarnaast "Yikes", "Comic
    // Sans MS" zien, met hogere specificiteit dan de h1-h6-regel — dat is een bug/placeholder-
    // waarde op de Roots-site ZELF (buiten dit systeem, zie het gesprek met Dylan), niet het
    // echte merklettertype.
    //
    // googleFonts WEL gevuld (bijgesteld 08-09-2026): eerst leeg gelaten in de aanname dat het
    // Roots-thema Ubuntu zelf al overal laadt, maar dat geldt alleen BINNEN de echte WordPress-
    // pagina — in een los voorbeeldscherm (of andere context buiten hostelroots.nl) heeft de
    // browser geen toegang tot dat zelf-gehoste lettertypebestand en valt stilzwijgend terug op
    // een systeemfont. Ubuntu is zelf ook gewoon een publiek, bestaand Google Font (los van hoe
    // Roots 'm host), dus laten we 'm voortaan altijd zelf laden — dat werkt dan overal
    // betrouwbaar, ongeacht de context waarin de pagina bekeken wordt.
    // Yikes (21-09-2026): Marion (Hostel Roots) heeft het echte lettertype-bestand aangeleverd dat
    // op de klantsite voor koppen wordt gebruikt (bv. de "ROOTS"-wordmark en decoratieve koppen,
    // zie besluiten.md "Yikes-lettertype van Roots"). Dit was EERDER (08-09-2026) aangezien voor een
    // losse bug/placeholder-waarde op een enkel Beaver Builder-element ("Yikes"/"Comic Sans MS" op
    // .fl-heading) - dat bleek dus GEEN bug maar het echte, bewust gekozen decoratieve koppenfont.
    // Correctie: die eerdere conclusie staat verderop in besluiten.md, deze regel hier is de huidige
    // stand van zaken.
    // Belangrijk: dit is een KLEIN, decoratief lettertype (86 glyphs) — geen accenten (é/ë/ï/etc),
    // geen dubbele punt/puntkomma, geen eurotekentje. Elk ontbrekend teken valt automatisch (per
    // teken, niet per element) terug op het volgende font in de stack, dus Ubuntu — vandaar Ubuntu
    // als expliciete tweede naam in fontHeading in plaats van meteen sans-serif, zodat een
    // ontbrekend teken in een kop zo min mogelijk opvalt.
    fontHeading: "'Yikes', 'Ubuntu', sans-serif",
    fontBody: "'Ubuntu', sans-serif",
    googleFonts: ['Ubuntu'],
    customFonts: [
      { family: 'Yikes', bestand: 'yikes-medium.ttf', gewicht: 500, stijl: 'normal' }
    ]
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
  ['fontHeading', 'fontBody'].forEach((veld) => {
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
