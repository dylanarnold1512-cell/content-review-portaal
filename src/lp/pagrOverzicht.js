// Pagr. overzicht (Werkplaats fase 2, 23-10-2026): een rij per klant met alles wat Dylan moet weten, zonder Notion of
// AI, zodat het testbaar is. De route in src/routes/lp.js haalt de pagina's op en geeft ze hier door.
const { standVan } = require('./standen');
const { huidigeMaand, volgendeMaand, aantalDezeMaand, maandNaam } = require('./maandplan');

// Pagina's die in deze maand live kwamen (live datum, anders aanmaakdatum).
function livePerMaand(paginas, maand) {
  return (paginas || []).filter((p) => p.status === 'Gepubliceerd' && huidigeMaand(new Date(p.liveDatum || p.aangemaakt || 0)) === maand).length;
}
const { AUTO_LIVE_MIN_LIVE } = require('./klaarVoorLive');

// soort 'pagr' = klant betaalt voor Pagr. 'eigen' = alleen interne automatisering (eigen werk van Dylan).
function bouwKlantRij({ id, naam, soort, product, paginameting, google, paginasPerMaand, autoLive, autoPlan, pages, tel, nu }) {
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
    id, naam, soort, product: product || '',
    live, klaar, controleren, fout, inDeMaak: Math.max(0, inDeMaak),
    gepland: Math.max(0, idee - wachtend),
    voorstellen: t.voorstellen || 0,
    ideeen: t.ideeen || 0,
    dezeMaand: { gemaakt: aantalDezeMaand(lijst, maand), live: livePerMaand(lijst, maand), doel, voorstellen: perMaand[maand] || 0 },
    google: googleTekst({ paginameting, google, live: lijst.filter((p) => p.status === 'Gepubliceerd'), nu }),
    activiteit: bouwActiviteit(lijst, t, maandNaam(volgende)),
    volgendeMaand: { voorstellen: perMaand[volgende] || 0 },
    autoLive: { aan: autoLive === true, live, nodig: AUTO_LIVE_MIN_LIVE, actief: autoLive === true && live >= AUTO_LIVE_MIN_LIVE },
    autoPlan: { aan: autoPlan === true, live, nodig: AUTO_LIVE_MIN_LIVE, actief: autoPlan === true && live >= AUTO_LIVE_MIN_LIVE },
    laatst: laatstGewijzigd,
    wacht: controleren + fout + klaar + (t.voorstellen || 0) + (t.ideeen || 0)
  };
}

// Hoeveel activiteit het systeem de afgelopen 7 dagen liet zien, alle klanten.
function bouwVanzelf(rijen, nu) {
  const grens = new Date((nu || new Date()).getTime() - 7 * 86400000).toISOString();
  return (rijen || []).reduce((n, r) => n + (r.activiteit || []).filter((a) => String(a.op) >= grens).length, 0);
}

// Totalen voor de kerncijfers en de inbox. Alleen klanten met soort 'pagr' tellen mee in de afspraak.
function bouwTotalen(rijen) {
  const pagr = (rijen || []).filter((r) => r.soort === 'pagr');
  const som = (veld) => pagr.reduce((n, r) => n + (r[veld] || 0), 0);
  return {
    klanten: pagr.length,
    gemaakt: pagr.reduce((n, r) => n + r.dezeMaand.gemaakt, 0),
    live: pagr.reduce((n, r) => n + r.dezeMaand.live, 0),
    vanzelf: bouwVanzelf(pagr),
    doel: pagr.reduce((n, r) => n + r.dezeMaand.doel, 0),
    voorstellen: som('voorstellen'),
    klaar: som('klaar'),
    controleren: som('controleren'),
    fout: som('fout'),
    ideeen: som('ideeen'),
    wacht: som('wacht')
  };
}

// Wat deed het systeem? Afgeleid uit de status en de laatste wijziging per pagina (geen aparte opslag), nieuwste eerst.
function bouwActiviteit(pages, tel, maand) {
  const tekst = {
    'Gepubliceerd': 'staat live op de website.',
    'Klaar voor live': 'is geschreven en schoon door de controle.',
    'Content klaar': 'is geschreven en wacht op jouw controle.',
    'Ter review': 'staat als concept in WordPress.',
    'Fout': 'schrijven mislukt, staat bij Wacht op jou.'
  };
  const uit = [];
  (pages || []).forEach((p) => {
    const t = tekst[p.status];
    if (!t || !p.laatstGewijzigd) return;
    uit.push({ op: p.status === 'Gepubliceerd' && p.liveDatum ? p.liveDatum : p.laatstGewijzigd, tekst: `${p.titel || '(zonder titel)'} ${t}` });
  });
  const voorstellen = (tel && tel.voorstellen) || 0;
  if (voorstellen) {
    const op = (pages || []).filter((p) => p.status === 'Idee').map((p) => p.laatstGewijzigd).filter(Boolean).sort().pop();
    if (op) uit.push({ op, tekst: `Plan voor ${maand || 'de volgende maand'} klaargezet: ${voorstellen} ${voorstellen === 1 ? 'voorstel' : 'voorstellen'}, wacht op jouw akkoord.` });
  }
  return uit.sort((a, b) => String(b.op).localeCompare(String(a.op))).slice(0, 8);
}

// Google van de klant in een zin: totaal over alle pagina's of de reden waarom er nog niets is.
function googleTekst({ paginameting, google, live, nu }) {
  if (!paginameting) return 'Paginameting staat uit';
  if (google && google.beschikbaar) {
    const perUrl = Object.values(google.perUrl || {});
    if (perUrl.length) {
      const v = perUrl.reduce((n, g) => n + (g.vertoningen || 0), 0);
      const k = perUrl.reduce((n, g) => n + (g.klikken || 0), 0);
      return `${v} vertoningen, ${k} klikken`;
    }
  }
  const laatste = (live || []).map((p) => p.liveDatum).filter(Boolean).sort().pop();
  const dagen = laatste ? Math.floor(((nu || new Date()) - new Date(laatste)) / 86400000) : null;
  if (dagen != null && dagen < 7) return 'Cijfers na 7 dagen';
  return live && live.length ? 'Nog geen cijfers' : 'Nog niets live';
}

module.exports = { bouwKlantRij, bouwTotalen, bouwActiviteit, googleTekst };
