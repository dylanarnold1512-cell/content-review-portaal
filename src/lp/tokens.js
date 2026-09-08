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
    fontHeading: "'Ubuntu', sans-serif",
    fontBody: "'Ubuntu', sans-serif",
    googleFonts: ['Ubuntu']
  }
  // jmb: { ... } — toevoegen zodra JMB aan de beurt is (bouwstap 5).
};

function getTokens(clientId) {
  return clientTokens[clientId] || defaultTokens;
}

module.exports = { defaultTokens, clientTokens, getTokens };
