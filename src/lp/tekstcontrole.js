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

  // 1b. Personen die nooit genoemd worden (Pagr. schrijft over het bedrijf, niet over de eigenaar).
  const namen = (Array.isArray(o.nietNoemen) ? o.nietNoemen : []).map((n) => String(n || '').trim()).filter(Boolean);
  if (namen.length) {
    const naamRe = new RegExp('\\b(' + namen.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b');
    const hits = velden.filter((v) => naamRe.test(v.tekst));
    if (hits.length) {
      const m = hits[0].tekst.match(naamRe);
      punten.push({
        soort: 'toon',
        tekst: `Er staat de persoonsnaam "${m[1]}" in de tekst, bij ${verhaal.leesbaar(hits[0].pad)}. De pagina gaat over het bedrijf, niet over een persoon.`,
        slots: uniek(hits.map((h) => h.slot)),
        aanwijzing: `Noem nergens de naam ${namen.join(' of ')}. Schrijf over het bedrijf (de bedrijfsnaam, "het bedrijf" of "de installateur"), of schrijf de zin om zodat de bezoeker centraal staat.`
      });
    }
  }

  // 1c. Onvolledige zinnen: een "vraag" die geen vraag is (bijvoorbeeld een zinsdeel met een vraagteken erachter) of een
  // tekst die met een kleine letter begint. De lengte maakt niet uit.
  const VRAAGWOORD_RE = /^(wat|hoe|waarom|wanneer|waar|wie|welke|welk|wanneer|kan|kun|kunnen|ben|bent|is|zijn|moet|moeten|wil|wilt|willen|heb|hebt|heeft|hebben|hoeveel|doe|doet|mag|mogen|zou|zoek|zoekt|ga|gaat|weet|weeg|overweeg|droom|twijfel)\b/i;
  const onvolledig = velden.filter((v) => {
    const t = v.tekst.trim();
    if (!t) return false;
    if (!v.pad.includes('[') && /^[a-zà-ÿ]/.test(t)) return true;
    const eersteZin = t.split(/(?<=[.!?])\s+/)[0];
    return /\?$/.test(eersteZin) && !VRAAGWOORD_RE.test(eersteZin);
  });
  if (onvolledig.length) {
    punten.push({
      soort: 'toon',
      tekst: `Een zin klopt niet of is niet af: "${onvolledig[0].tekst.trim().slice(0, 80)}" (bij ${verhaal.leesbaar(onvolledig[0].pad)}).`,
      slots: uniek(onvolledig.map((k) => k.slot)),
      aanwijzing: 'Schrijf dit veld als een zin die op zichzelf klopt, met een onderwerp en een werkwoord. Een vraagteken hoort alleen achter een echte vraag ("Wil je ... ?", "Hoe ... ?"), niet achter een los zinsdeel.'
    });
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

  // 8. Derde persoon: de bedrijfsnaam is het onderwerp van de pagina. "De installateur" en "het bedrijf" zijn hooguit een
  // afwisseling, en de naam hoort in de belangrijkste onderdelen te staan (SEO en herkenbaarheid).
  if (o.derdePersoon && o.bedrijfsnaam) {
    const naamRegex = new RegExp(String(o.bedrijfsnaam).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi');
    const GENERIEK = /\b(de installateur|het bedrijf|de aannemer|de vakman)\b/gi;
    const tel = (re, t) => (String(t).match(re) || []).length;
    let naamTotaal = 0;
    let generiek = 0;
    const metGeneriek = [];
    velden.forEach((v) => {
      naamTotaal += tel(naamRegex, v.tekst);
      const g = tel(GENERIEK, v.tekst);
      generiek += g;
      if (g) metGeneriek.push(v.slot);
    });
    if (naamTotaal < 5 || generiek > naamTotaal) {
      punten.push({
        soort: 'toon',
        tekst: `De bedrijfsnaam "${o.bedrijfsnaam}" staat ${naamTotaal} keer op de pagina en "de installateur" of "het bedrijf" ${generiek} keer. De naam moet het onderwerp zijn.`,
        slots: uniek(metGeneriek).slice(0, 8),
        aanwijzing: `Gebruik de bedrijfsnaam "${o.bedrijfsnaam}" als onderwerp van de zin in de hero of het antwoordblok, de intro, waarom, de werkwijze en de projecten. Vervang "de installateur" en "het bedrijf" door de naam. Een afwisseling met "het bedrijf" mag af en toe, maar nooit vaker dan de naam zelf.`
      });
    }
  }

  // 10. Lengte volgt het goedgekeurde voorbeeld: een kop, label of intro die minder dan de helft zo lang is als op het
  // voorbeeld wordt uitgebreid. Alleen losse tekstvelden, zodat een kortere dienstnaam geen fout oplevert.
  if (o.voorbeeldSlotData && typeof o.voorbeeldSlotData === 'object') {
    const WOORDEN = (t) => String(t).trim().split(/\s+/).filter(Boolean).length;
    const kort = [];
    for (const [key, ref] of Object.entries(o.voorbeeldSlotData)) {
      if (typeof ref !== 'string' || typeof slotData[key] !== 'string') continue;
      if (/^(meta|cta)|(Href|Src|Alt)$/i.test(key)) continue;
      const rw = WOORDEN(ref);
      const nw = WOORDEN(slotData[key]);
      if (rw >= 8 && nw < rw * 0.5) kort.push({ key, nw, rw });
    }
    if (kort.length) {
      punten.push({
        soort: 'toon',
        tekst: `Deze velden zijn veel korter dan op het goedgekeurde voorbeeld: ${kort.map((k) => `${k.key} (${k.nw} woorden, voorbeeld ${k.rw})`).join(', ')}.`,
        slots: kort.map((k) => k.key),
        aanwijzing: `Schrijf deze velden even uitgebreid als op het goedgekeurde voorbeeld, met dezelfde opbouw: ${kort.map((k) => `${k.key} ongeveer ${k.rw} woorden`).join(', ')}. Vul aan met feiten over deze dienst en plaats, zonder te verzinnen.`
      });
    }
  }

  // 9. De veelgestelde vragen mogen niet leeg of bijna leeg zijn.
  if (Array.isArray(slotData.faqItems) && slotData.faqItems.length < 4) {
    punten.push({
      soort: 'inhoud',
      tekst: `Er staan maar ${slotData.faqItems.length} veelgestelde vragen op de pagina.`,
      slots: ['faqItems'],
      aanwijzing: 'Schrijf zes veelgestelde vragen met antwoord, alleen over het onderwerp van deze pagina. Haal ze uit de feiten, de bronteksten en de zoekvragen. Een antwoord mag feiten van de pagina gebruiken, maar in eigen woorden en met een eigen invalshoek.'
    });
  }
  return punten;
}

// Laatste vangnet: namen van personen die de klant niet genoemd wil hebben worden mechanisch vervangen door de bedrijfsnaam.
// Werkt op alle tekstvelden, ook alt-teksten en meta, behalve links en afbeeldingsbronnen. Geeft het aantal vervangingen terug.
function scrubPersoonsnamen(slotData, { nietNoemen, bedrijfsnaam } = {}) {
  const namen = (Array.isArray(nietNoemen) ? nietNoemen : []).map((n) => String(n || '').trim()).filter(Boolean);
  const bedrijf = String(bedrijfsnaam || '').trim();
  if (!namen.length || !bedrijf || !slotData || typeof slotData !== 'object') return 0;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rest = bedrijf.split(/\s+/).filter((w) => w.length > 2).map(esc);
  const naamRe = new RegExp(`\\b(?:${namen.map(esc).join('|')})(?:\\s+(?:${rest.join('|') || 'x{9}'}))?(?:'s)?(?![\\w-])`, 'gi');
  const dubbel = new RegExp(`(${esc(bedrijf)})(\\s+${esc(bedrijf)})+`, 'gi');
  const OVERSLAAN = /^(href|src|url|imageSrc|ctaHref|icon)$|(Href|Src|Url)$/;
  let aantal = 0;
  const schoon = (t) => String(t).replace(naamRe, () => { aantal += 1; return bedrijf; }).replace(dubbel, '$1');
  const loop = (obj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (OVERSLAAN.test(k)) continue;
      if (typeof v === 'string') obj[k] = schoon(v);
      else if (Array.isArray(v)) v.forEach((item, i) => { if (typeof item === 'string') v[i] = schoon(item); else if (item && typeof item === 'object') loop(item); });
      else if (v && typeof v === 'object') loop(v);
    }
  };
  loop(slotData);
  return aantal;
}

module.exports = { tekstControle, getallenIn, scrubPersoonsnamen };
