// Feitenbibliotheek Hostel Roots: elk feit heeft een eigen bron (besluit 8 in
// besluiten.md). Feiten zonder bron horen hier niet in. Dit bestand voedt de
// "praktisch"- en "doelgroep"-blokken, en dient als basis voor de feitensheet
// die per pagina wordt goedgekeurd.
//
// Bron voor de adres/tijden-feiten: live voettekst van hostelroots.nl,
// gecontroleerd op 31-08-2026.

const feiten = [
  {
    id: 'adres-receptie',
    label: 'Adres receptie',
    waarde: 'Stationsstraat 41, 5038 EC Tilburg',
    bron: 'hostelroots.nl, voettekst, gecontroleerd 31-08-2026'
  },
  {
    id: 'adres-tiny-house',
    label: 'Adres Tiny House',
    waarde: 'Wagenstraat 11, 5041 AX Tilburg',
    bron: 'hostelroots.nl, voettekst, gecontroleerd 31-08-2026'
  },
  {
    id: 'openingstijden-receptie',
    label: 'Openingstijden receptie',
    waarde: 'Zondag t/m woensdag 08:30-20:30, donderdag t/m zaterdag 08:30-22:00',
    bron: 'hostelroots.nl, voettekst, gecontroleerd 31-08-2026'
  },
  {
    id: 'check-in',
    label: 'Check-in tijden',
    waarde: 'Zondag t/m woensdag 15:30-20:30, donderdag t/m zaterdag 15:30-22:00',
    bron: 'hostelroots.nl, voettekst, gecontroleerd 31-08-2026'
  },
  {
    id: 'check-out',
    label: 'Check-out tijden',
    waarde: 'Dagelijks vanaf 07:00',
    bron: 'hostelroots.nl, voettekst, gecontroleerd 31-08-2026'
  },
  {
    id: 'telefoon',
    label: 'Telefoonnummer',
    waarde: '+31 6 52 30 85 18',
    bron: 'hostelroots.nl, voettekst, gecontroleerd 31-08-2026'
  }
  // Aanvullen per pagina met event-specifieke feiten uit de feitensheet —
  // dit bestand is de vaste basis, niet de volledige lijst per pagina.
];

function getFeit(id) {
  return feiten.find((f) => f.id === id);
}

module.exports = { feiten, getFeit };
