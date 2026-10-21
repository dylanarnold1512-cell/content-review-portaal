// LP Fabriek: harde tekstcontrole na het schrijven (21-10-2026). Mechanisch, geen AI.
// Vangt wat een klant nooit mag zien: hij of hem over de eigenaar, stijve "Wie ..." zinnen, getallen die niet in de
// feiten staan, ervaringsclaims, superlatieven en reviews die de klant niet bevestigd heeft.
// De punten hebben dezelfde vorm als die van verhaal.redactieControle, zodat de automatische herschrijfronde ze oppakt.

const verhaal = require('./verhaal');

const FAQ_SLOT_RE = /^(faq|vragen|question)/i;
const REVIEW_SLOT_RE = /^(reviews?|testimonials?)/i;
const HIJ_RE = /\b(hij|hem)\b/i;
const WIE_RE = /(^|[.!?]\s+)Wie\s/;
const SUPERLATIEF_RE = /\b(de beste|het beste van|beste van (?:de )?(?:regio|stad)|nummer (?:1|één|een)|marktleider|goedkoopste|ongeëvenaard|unieke kwaliteit|topkwaliteit)\b/i;
const ERVARING_RE = /\b(jarenlange ervaring|ruime ervaring|decennia(?:lang)?|honderden (?:tevreden )?klanten|duizenden (?:tevreden )?klanten)\b/i;

function normaalGetal(s) {
  return String(s).replace(/[.\s]/g, '').replace(',', '.');
}

// Alle getallen van 10 of meer (of met decimalen) in een tekst, genormaliseerd.
function getallenIn(tekst) {
  const uit = [];
  const re = /\d[\d.,]*/g;
  let m;
  while ((m = re.exec(String(tekst || ''))) !== null) {
    const n = normaalGetal(m[0].replace(/[.,]+$/, ''));
    const waarde = Number(n);
    if (Number.isNaN(waarde)) continue;
    if (waarde < 10 && !/[.,]/.test(m[0].replace(/[.,]+$/, ''))) continue;
    uit.push({ ruw: m[0].replace(/[.,]+$/, ''), n });
  }
  return uit;
}

function tekstControle(slotData, opties) {
  const o = opties || {};
  const punten = [];
  const velden = verhaal.tekstVelden(slotData);
  if (!velden.length) return punten;
  const uniek = (l) => [...new Set(l)];

  // 1. Hij of hem over de eigenaar (alleen bij klanten die in de derde persoon schrijven).
  if (o.derdePersoon) {
    const hits = velden.filter((v) => HIJ_RE.test(v.tekst));
    if (hits.length) {
      const m = hits[0].tekst.match(HIJ_RE);
      punten.push({
        soort: 'toon',
        tekst: `Er staat "${m[0]}" over de eigenaar of het bedrijf, bij ${verhaal.leesbaar(hits[0].pad)}. Gebruik de naam van de eigenaar of het bedrijf, of schrijf het om zonder voornaamwoord.`,
        slots: uniek(hits.map((h) => h.slot)),
        aanwijzing: 'Gebruik nergens "hij" of "hem" over de eigenaar of het bedrijf. Schrijf met de voornaam, de bedrijfsnaam of "je" en laat het voornaamwoord weg.'
      });
    }
  }

  // 2. Stijve zinnen die met "Wie" beginnen, buiten de veelgestelde vragen.
  const wie = velden.filter((v) => !FAQ_SLOT_RE.test(v.slot) && WIE_RE.test(v.tekst));
  if (wie.length) {
    punten.push({
      soort: 'toon',
      tekst: `Een zin begint met "Wie ...", bij ${verhaal.leesbaar(wie[0].pad)}. Dat leest stijf. Spreek de bezoeker aan met "je".`,
      slots: uniek(wie.map((h) => h.slot)),
      aanwijzing: 'Begin geen zin met "Wie". Spreek de bezoeker direct aan met "je", bijvoorbeeld "Wil je ... dan ..."'
    });
  }

  // 3. Getallen die niet in de feiten of de invoer staan.
  if (o.toegestaneTekst !== undefined) {
    const toegestaan = new Set(getallenIn(o.toegestaneTekst).map((g) => g.n));
    const vreemd = [];
    for (const v of velden) {
      for (const g of getallenIn(v.tekst)) {
        if (!toegestaan.has(g.n)) vreemd.push({ ...g, veld: v });
      }
    }
    if (vreemd.length) {
      punten.push({
        soort: 'claim',
        tekst: `Er staat een getal dat niet in de feiten staat: ${uniek(vreemd.map((g) => g.ruw)).slice(0, 4).join(', ')} (bij ${verhaal.leesbaar(vreemd[0].veld.pad)}).`,
        slots: uniek(vreemd.map((g) => g.veld.slot)),
        aanwijzing: `Haal getallen weg die niet in de feiten staan (${uniek(vreemd.map((g) => g.ruw)).slice(0, 4).join(', ')}). Gebruik alleen aantallen, prijzen en jaren uit de feiten. Mag het getal niet, schrijf het dan zonder getal.`
      });
    }
  }

  // 4. Superlatieven en ervaringsclaims die niet onderbouwd zijn.
  const claims = velden.filter((v) => SUPERLATIEF_RE.test(v.tekst) || ERVARING_RE.test(v.tekst));
  if (claims.length) {
    const m = claims[0].tekst.match(SUPERLATIEF_RE) || claims[0].tekst.match(ERVARING_RE);
    punten.push({
      soort: 'claim',
      tekst: `Er staat een claim die niet te bewijzen is: "${m[0]}" (bij ${verhaal.leesbaar(claims[0].pad)}).`,
      slots: uniek(claims.map((c) => c.slot)),
      aanwijzing: 'Haal superlatieven en ervaringsclaims weg ("de beste", "jarenlange ervaring", "honderden klanten"). Beschrijf in plaats daarvan wat de bezoeker concreet krijgt.'
    });
  }

  // 5. Reviews terwijl de klant ze niet bevestigd heeft.
  if (o.reviewsBevestigd === false) {
    const reviewSlots = Object.keys(slotData || {}).filter((k) => REVIEW_SLOT_RE.test(k) && Array.isArray(slotData[k]) && slotData[k].length);
    if (reviewSlots.length) {
      punten.push({
        soort: 'claim',
        tekst: 'De pagina bevat reviews, maar de klant heeft nog geen reviews bevestigd. Haal ze weg of laat de klant ze eerst bevestigen.',
        slots: reviewSlots,
        aanwijzing: 'Reviews mogen niet op de pagina staan zolang de klant ze niet bevestigd heeft.'
      });
    }
  }
  return punten;
}

module.exports = { tekstControle, getallenIn };
