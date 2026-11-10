// LP Fabriek: schrijfvorm van de klantsite herkennen voor de intake (nieuwe klant).
// Telt op de bestaande teksten van de klant hoe vaak de bedrijfsnaam voorkomt en hoe vaak "wij", "we",
// "ons" en "onze" gebruikt worden. Daarvan komt een VOORSTEL voor profile.schrijfvorm ('wij', 'derde'
// of 'mix'). Dylan ziet het voorstel in de intake en kan het aanpassen. Volledig deterministisch,
// geen AI: tellen is geen interpretatie. Zie klantverhaal.js voor wat elke schrijfvorm betekent.

const { haalSiteTeksten } = require('./siteTeksten');

const WIJ_RE = /\b(wij|we|ons|onze)\b/gi;

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "Hirs Installaties B.V." telt ook als "Hirs Installaties".
function naamVarianten(naam) {
  const kaal = String(naam || '').replace(/\b(b\.?v\.?|v\.?o\.?f\.?|vof|bv)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
  return [...new Set([String(naam || '').trim(), kaal].filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
}

function telNaam(tekst, varianten) {
  if (!varianten.length) return 0;
  const re = new RegExp(varianten.map(escapeRe).join('|'), 'gi');
  return (tekst.match(re) || []).length;
}

function telWijWoorden(tekst) {
  return (tekst.match(WIJ_RE) || []).length;
}

function woorden(tekst) {
  return (tekst.match(/\S+/g) || []).length;
}

// paginas: [{ url, titel, tekst }]. Geeft altijd een object terug.
function analyseerSchrijfvorm(paginas, bedrijfsnaam) {
  const lijst = (paginas || []).filter((p) => p && p.tekst);
  const varianten = naamVarianten(bedrijfsnaam);
  const perPagina = lijst.map((p) => ({
    titel: p.titel || p.url,
    woorden: woorden(p.tekst),
    naam: telNaam(p.tekst, varianten),
    wij: telWijWoorden(p.tekst)
  }));
  const totaalWoorden = perPagina.reduce((s, p) => s + p.woorden, 0);
  const totaalNaam = perPagina.reduce((s, p) => s + p.naam, 0);
  const totaalWij = perPagina.reduce((s, p) => s + p.wij, 0);
  const naamPerPagina = lijst.length ? Math.round((totaalNaam / lijst.length) * 10) / 10 : 0;
  const wijPer1000 = totaalWoorden ? Math.round((totaalWij / totaalWoorden) * 10000) / 10 : 0;

  let schrijfvorm = 'wij';
  let zeker = true;
  let toelichting;
  if (lijst.length < 2 || totaalWoorden < 400) {
    zeker = false;
    toelichting = 'Te weinig tekst op de site om de schrijfwijze te herkennen. Standaard staat op de wij-vorm, kies zelf als de klant het anders wil.';
  } else if (wijPer1000 >= 8 && naamPerPagina <= 1.5) {
    toelichting = `De site schrijft in de wij-vorm (${wijPer1000} keer wij, we, ons of onze per 1000 woorden) en noemt de bedrijfsnaam gemiddeld ${naamPerPagina} keer per pagina.`;
  } else if (naamPerPagina >= 3 && wijPer1000 < 5) {
    schrijfvorm = 'derde';
    toelichting = `De site schrijft over het bedrijf in de derde persoon: de naam staat gemiddeld ${naamPerPagina} keer per pagina en wij, we, ons of onze komt maar ${wijPer1000} keer per 1000 woorden voor.`;
  } else if (naamPerPagina >= 1.5 && wijPer1000 >= 5) {
    schrijfvorm = 'mix';
    toelichting = `De site combineert de bedrijfsnaam (gemiddeld ${naamPerPagina} keer per pagina) met de wij-vorm (${wijPer1000} keer per 1000 woorden).`;
  } else {
    zeker = false;
    toelichting = `Geen duidelijk patroon: de naam staat gemiddeld ${naamPerPagina} keer per pagina en wij komt ${wijPer1000} keer per 1000 woorden voor. Standaard staat op de wij-vorm, kijk zelf even naar de site.`;
  }
  return { schrijfvorm, zeker, toelichting, naamPerPagina, wijPer1000, paginas: perPagina.length, perPagina };
}

// Haalt de teksten van de klantsite op en analyseert ze. Gooit nooit.
async function analyseerSchrijfvormVanSite({ url, bedrijfsnaam, taal }) {
  const res = await haalSiteTeksten({ url, taal: taal || 'nl' });
  if (res.fout && !res.paginas.length) {
    return { schrijfvorm: 'wij', zeker: false, toelichting: `De site kon niet gelezen worden (${res.fout}). Standaard staat op de wij-vorm.`, naamPerPagina: 0, wijPer1000: 0, paginas: 0, perPagina: [] };
  }
  return analyseerSchrijfvorm(res.paginas, bedrijfsnaam);
}

module.exports = { analyseerSchrijfvorm, analyseerSchrijfvormVanSite, naamVarianten };
