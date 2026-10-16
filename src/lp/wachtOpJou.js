// Wat wacht er op Dylan (Pagr., 16-10-2026): pagina's die gecontroleerd moeten worden, mislukte pagina's en
// ideeen van de klant. Dezelfde indeling als de vier standen (src/lp/standen.js).
const { standVan } = require('./standen');

function wachtOpJou(pages, aantalIdeeen) {
  const lijst = pages || [];
  const fout = lijst.filter((p) => p.status === 'Fout' || p.status === 'Afgewezen');
  const controleren = lijst.filter((p) => standVan(p.status) === 'Ter controle');
  const ideeen = Number(aantalIdeeen) || 0;
  return {
    controleren: controleren.map((p) => ({ id: p.id, titel: p.titel })),
    fout: fout.map((p) => ({ id: p.id, titel: p.titel })),
    ideeen,
    totaal: controleren.length + fout.length + ideeen
  };
}

module.exports = { wachtOpJou };
