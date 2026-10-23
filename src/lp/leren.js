// Leren van live pagina's (23-10-2026). Twee dingen, allebei zonder extra handwerk:
// 1. Voorbeelden: de nieuwe pagina volgt niet een pagina maar maximaal drie goedgekeurde, live pagina's van de klant.
// 2. Correcties: wat Dylan in een tekst aanpast, onthoudt het systeem per klant en past het bij de volgende pagina toe.
const verhaal = require('./verhaal');

const MAX_VOORBEELDEN = 3;
const MAX_CORRECTIES = 20;
// Feiten, reviews en projecten komen uit de bron. Een aanpassing daarvan zegt niets over schrijfstijl.
const NIET_LEREN = /^(reviewItems|practicalItems|projectItems|linksItems|offerItems)/;

const norm = (id) => String(id || '').replace(/-/g, '');
const spatie = (t) => String(t || '').replace(/\s+/g, ' ').trim();

// De hoofdpagina (ingesteld of meest recent live) eerst, daarna de meest recente live pagina's met inhoud, maximaal drie in totaal.
// De pagina die nu geschreven wordt telt nooit mee.
function kiesVoorbeelden({ hoofd, kandidaten, paginaId, max = MAX_VOORBEELDEN }) {
  const heeft = (z) => z && z.content && z.content.slotData && norm(z.id) !== norm(paginaId);
  const uit = [];
  if (heeft(hoofd)) uit.push(hoofd);
  (kandidaten || [])
    .filter((z) => heeft(z) && z.status === 'Gepubliceerd' && !uit.some((u) => norm(u.id) === norm(z.id)))
    .sort((a, b) => String(b.laatstGewijzigd).localeCompare(String(a.laatstGewijzigd)))
    .forEach((z) => { if (uit.length < max) uit.push(z); });
  return uit;
}

// Welke teksten zijn veranderd tussen twee versies van dezelfde pagina? Alleen echte tekst, geen links, plaatjes of feiten.
function verschillen(oudSlotData, nieuwSlotData) {
  const oud = {};
  verhaal.tekstVelden(oudSlotData).forEach((v) => { oud[v.pad] = v.tekst; });
  const uit = [];
  verhaal.tekstVelden(nieuwSlotData).forEach((v) => {
    if (NIET_LEREN.test(v.pad)) return;
    const voor = spatie(oud[v.pad]);
    const na = spatie(v.tekst);
    if (!voor || !na || voor === na) return;
    uit.push({ pad: v.pad, voor: voor.slice(0, 400), na: na.slice(0, 400) });
  });
  return uit;
}

// Nieuwe correcties bij de bestaande: dezelfde plek op dezelfde pagina houdt het oorspronkelijke "voor" en krijgt het nieuwste "na".
// Zo staat er na meerdere aanpassingen van een zin een keer: wat de AI schreef en wat het uiteindelijk werd.
function voegToe(bestaand, nieuwe, { pagina, datum } = {}) {
  const lijst = (Array.isArray(bestaand) ? bestaand : []).map((c) => ({ ...c }));
  (nieuwe || []).forEach((n) => {
    const i = lijst.findIndex((c) => c.pagina === pagina && c.pad === n.pad);
    if (i >= 0) {
      lijst[i].na = n.na;
      lijst[i].datum = datum;
      if (spatie(lijst[i].voor) === spatie(lijst[i].na)) lijst.splice(i, 1);
    } else {
      lijst.push({ datum, pagina, pad: n.pad, voor: n.voor, na: n.na });
    }
  });
  return lijst.slice(-MAX_CORRECTIES);
}

// Opschonen van wat uit Notion of het scherm komt.
function schoonCorrecties(v) {
  const t = (x, max) => spatie(x).slice(0, max);
  return (Array.isArray(v) ? v : []).slice(-MAX_CORRECTIES).map((c) => ({
    datum: t(c && c.datum, 10), pagina: t(c && c.pagina, 80), pad: t(c && c.pad, 80), voor: t(c && c.voor, 400), na: t(c && c.na, 400)
  })).filter((c) => c.voor && c.na && c.voor !== c.na);
}

// Het blok voor de schrijfopdracht.
function bouwCorrectiesBlok(correcties) {
  const lijst = schoonCorrecties(correcties);
  if (!lijst.length) return '';
  return `\n\nCORRECTIES VAN DE OPDRACHTGEVER OP EERDERE TEKSTEN VAN DEZE KLANT (voor: wat de AI schreef, na: wat de opdrachtgever er van maakte):
${lijst.map((c, i) => `${i + 1}. voor: ${c.voor}\n   na: ${c.na}`).join('\n')}

Leer van deze correcties. Zie je een patroon (een woord, een manier om het bedrijf te noemen, een zinsbouw, iets dat eruit moest), pas dat dan toe in alles wat je schrijft. Neem de zinnen zelf niet over: het gaat om de soort aanpassing.`;
}

module.exports = { MAX_VOORBEELDEN, MAX_CORRECTIES, kiesVoorbeelden, verschillen, voegToe, schoonCorrecties, bouwCorrectiesBlok };
