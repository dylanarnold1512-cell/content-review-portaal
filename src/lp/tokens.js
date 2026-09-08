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
    // echte merklettertype. googleFonts blijft leeg: Ubuntu wordt hier zelf-gehost door het
    // thema (geen <link>/@import naar fonts.googleapis.com gevonden), dus het is via het
    // WordPress-thema al overal beschikbaar — wij hoeven 'm niet apart te laden.
    fontHeading: "'Ubuntu', sans-serif",
    fontBody: "'Ubuntu', sans-serif"
  }
  // jmb: { ... } — toevoegen zodra JMB aan de beurt is (bouwstap 5).
};

function getTokens(clientId) {
  return clientTokens[clientId] || defaultTokens;
}

module.exports = { defaultTokens, clientTokens, getTokens };
