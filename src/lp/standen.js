// De vier standen van een landingspagina zoals Dylan en de klant ze zien (Pagr., 14-10-2026). De negen statussen in
// Notion blijven ongewijzigd. Dezelfde indeling staat in public/lp-werkplaats.js voor het beheerscherm.
const STAND = {
  'Idee': 'Gepland',
  'Formulier ingevuld': 'In de maak',
  'Feitensheet ter review': 'Ter controle',
  'Content klaar': 'Ter controle',
  'Ter review': 'Ter controle',
  'Goedgekeurd': 'Ter controle',
  'Afgewezen': 'In de maak',
  'Fout': 'In de maak',
  'Gepubliceerd': 'Live'
};
function standVan(status) { return STAND[status] || 'In de maak'; }
module.exports = { STAND, standVan };
