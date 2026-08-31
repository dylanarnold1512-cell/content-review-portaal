// Blueprint "Roots Event": paginatype voor event-gerelateerde landingspagina's
// (bijv. "Overnachten tijdens [event] in Tilburg"). Gebaseerd op de Excel-
// analyse: één pagina kan aan meerdere events hangen (many-to-one), dus het
// invoerformulier vraagt naar de PAGINA, met events als los veld erbij.

const blueprint = {
  id: 'roots-event',
  naam: 'Roots - Event overnachtingspagina',
  clientId: 'roots',

  // Velden die het formulier (bouwstap 4) uitvraagt, direct afgeleid van de
  // kolommen in Hostel_Roots Event planning 2026.xlsx.
  invoerVelden: [
    { key: 'landingspaginaTitel', label: 'Landingspagina titel', verplicht: true },
    { key: 'events', label: 'Gekoppelde events (1 of meer)', verplicht: true },
    { key: 'categorie', label: 'Categorie', verplicht: true },
    { key: 'eventStart', label: 'Event start', verplicht: false },
    { key: 'eventEind', label: 'Event eind', verplicht: false },
    { key: 'lpLiveDatum', label: 'LP live datum (4 weken vooraf)', verplicht: true },
    { key: 'adsActief', label: 'Ads actief hierop?', verplicht: false },
    { key: 'inputRoots', label: 'Input Roots (ruwe tekst/notities van de klant)', verplicht: true }
  ],

  // Verplichte blokken, in weergavevolgorde. Optionele blokken mogen ontbreken
  // als de feitensheet er geen input voor heeft.
  verplichteBlokken: ['hero', 'usp-grid', 'praktisch', 'links', 'cta'],
  optioneleBlokken: ['intro', 'doelgroep', 'stappen', 'faq', 'reviews', 'bewijs'],

  // Uniciteitsbudget (besluiten.md: "elke blueprint krijgt een uniciteits-
  // budget"): minimaal dit aantal event-specifieke, unieke feiten moet in de
  // pagina staan, anders is de content te generiek/te gelijk aan een andere
  // eventpagina.
  uniciteitsbudget: {
    minimumUniekeFeiten: 3,
    // Feiten die NOOIT als "uniek" tellen, ook al staan ze in de tekst — dit
    // zijn de vaste Roots-feiten die op elke pagina mogen terugkomen.
    uitgeslotenVanUniciteit: ['adres-receptie', 'adres-tiny-house', 'telefoon']
  },

  // Interne links (besluit 9): alleen met reden, geen automatische opvulling.
  linkRegels: {
    minimumInterneLinks: 3,
    minimumNaarZusterpaginas: 2,
    reasonRequired: true
  },

  ctaRegel: {
    verplicht: true,
    voorbeeldLabel: 'Bekijk kamers',
    hrefStandaard: '/rooms/'
  },

  seoRegels: {
    metaTitleMin: 50,
    metaTitleMax: 60,
    metaDescriptionMin: 140,
    metaDescriptionMax: 160,
    keywordInEersteWoorden: 100,
    exactEenH1: true
  }
};

module.exports = blueprint;
