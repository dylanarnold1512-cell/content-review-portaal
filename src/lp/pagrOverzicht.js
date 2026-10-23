// Pagr. overzicht (Werkplaats fase 2, 23-10-2026): een rij per klant met alles wat Dylan moet weten, zonder Notion of
// AI, zodat het testbaar is. De route in src/routes/lp.js haalt de pagina's op en geeft ze hier door.
const { standVan } = require('./standen');
const { huidigeMaand, volgendeMaand, aantalDezeMaand } = require('./maandplan');
const { AUTO_LIVE_MIN_LIVE } = require('./klaarVoorLive');

// soort 'pagr' = klant betaalt voor Pagr. 'eigen' = alleen interne automatisering (eigen werk van Dylan).
function bouwKlantRij({ id, naam, soort, paginasPerMaand, autoLive, pages, tel, nu }) {
  const lijst = pages || [];
  const t = tel || { ideeen: 0, voorstellen: 0, voorstellenPerMaand: {} };
  const maand = huidigeMaand(nu);
  const volgende = volgendeMaand(maand);
  const perMaand = t.voorstellenPerMaand || {};
  const idee = lijst.filter((p) => p.status === 'Idee').length;
  const wachtend = (t.voorstellen || 0) + (t.ideeen || 0);
  const live = lijst.filter((p) => p.status === 'Gepubliceerd').length;
  const klaar = lijst.filter((p) => p.status === 'Klaar voor live').length;
  const controleren = lijst.filter((p) => standVan(p.status) === 'Ter controle').length;
  const fout = lijst.filter((p) => p.status === 'Fout' || p.status === 'Afgewezen').length;
  const inDeMaak = lijst.filter((p) => standVan(p.status) === 'In de maak').length - fout;
  const laatstGewijzigd = lijst.map((p) => p.laatstGewijzigd).filter(Boolean).sort().pop() || null;
  const doel = Number(paginasPerMaand) || 0;
  return {
    id, naam, soort,
    live, klaar, controleren, fout, inDeMaak: Math.max(0, inDeMaak),
    gepland: Math.max(0, idee - wachtend),
    voorstellen: t.voorstellen || 0,
    ideeen: t.ideeen || 0,
    dezeMaand: { gemaakt: aantalDezeMaand(lijst, maand), doel, voorstellen: perMaand[maand] || 0 },
    volgendeMaand: { voorstellen: perMaand[volgende] || 0 },
    autoLive: { aan: autoLive === true, live, nodig: AUTO_LIVE_MIN_LIVE, actief: autoLive === true && live >= AUTO_LIVE_MIN_LIVE },
    laatst: laatstGewijzigd,
    wacht: controleren + fout + klaar + (t.voorstellen || 0) + (t.ideeen || 0)
  };
}

// Totalen voor de kerncijfers en de inbox. Alleen klanten met soort 'pagr' tellen mee in de afspraak.
function bouwTotalen(rijen) {
  const pagr = (rijen || []).filter((r) => r.soort === 'pagr');
  const som = (veld) => pagr.reduce((n, r) => n + (r[veld] || 0), 0);
  return {
    klanten: pagr.length,
    gemaakt: pagr.reduce((n, r) => n + r.dezeMaand.gemaakt, 0),
    doel: pagr.reduce((n, r) => n + r.dezeMaand.doel, 0),
    voorstellen: som('voorstellen'),
    klaar: som('klaar'),
    controleren: som('controleren'),
    fout: som('fout'),
    ideeen: som('ideeen'),
    wacht: som('wacht')
  };
}

module.exports = { bouwKlantRij, bouwTotalen };
