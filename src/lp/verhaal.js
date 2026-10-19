// LP Fabriek: de verhaallijn van een pagina (Dylan, 19-10-2026).
//
// Een pagina is geen losse verzameling blokken maar een verhaal dat een bezoeker van herkenning naar actie leidt.
// Elk onderdeel van een sjabloon heeft daarom een ROL. Dit bestand bevat alleen de vaste, mechanische kant:
//   - welke rollen er zijn en wat de taak van elke rol is,
//   - welke rol een slot heeft (afgeleid van de naam, of expliciet via slot.rol),
//   - in welke volgorde de onderdelen op de pagina staan,
//   - de prompts voor het schrijfplan en voor de onafhankelijke lezer,
//   - de controles die zonder AI kunnen (herhaling, je of u, bedrijfsnaam, lege woorden, toon).
// De AI-aanroepen zelf staan in ai.js (maakSchrijfPlan, redactieReview, herschrijfOnderdelen). Dit bestand laadt ai.js niet.

const ROLLEN = ['hero', 'aanbod', 'waarom', 'werkwijze', 'bewijs', 'twijfels', 'actie', 'overig'];

// De vaste verhaallijn. De volgorde is de volgorde waarin een bezoeker de vragen stelt.
const ROL_TAKEN = {
  hero: { naam: 'Herkenning', taak: 'De bezoeker herkent zijn eigen vraag en voelt dat dit bedrijf hem helpt. Persoonlijk, direct, met "je" of "u" en "wij". Eindigt met wat hij hier krijgt, niet met een slogan.' },
  aanbod: { naam: 'Aanbod', taak: 'Wat het bedrijf concreet voor deze bezoeker doet. Eerst wat hij krijgt, nog niet hoe het werkt.' },
  waarom: { naam: 'Waarom wij', taak: 'Een paar echte redenen om voor dit bedrijf te kiezen, elk met een eigen onderwerp en met wat het de bezoeker oplevert (rust, tijd, zekerheid).' },
  werkwijze: { naam: 'Zo gaat het', taak: 'Wat er na de aanvraag gebeurt, stap voor stap. Haalt de onzekerheid weg over wat hij kan verwachten.' },
  bewijs: { naam: 'Bewijs', taak: 'Echte reviews en projecten. Niets verzonnen, reviews letterlijk.' },
  twijfels: { naam: 'Twijfels weg', taak: 'Antwoorden op de echte zorgen van de bezoeker (kosten, planning, overlast, vergunning), met nieuwe informatie en niet met herhaling van wat er al staat.' },
  actie: { naam: 'Actie', taak: 'De volgende stap, klein en duidelijk. Herhaalt het verhaal niet maar maakt het gemakkelijk om te beginnen.' },
  overig: { naam: 'Overig', taak: '' }
};

// Volgorde waarin de rollen in een goed verhaal horen te staan. Alleen gebruikt om te waarschuwen, nooit om te blokkeren.
const GEWENSTE_VOLGORDE = ['hero', 'aanbod', 'waarom', 'werkwijze', 'bewijs', 'twijfels', 'actie'];

// Rol uit de naam van een slot. Volgorde is belangrijk: offerIntro hoort bij aanbod en niet bij actie.
const ROL_PATRONEN = [
  ['overig', /^(meta|links|gallery|galerij|formulier)|(Href|Src|Alt|Icon)$/i],
  ['hero', /^hero/i],
  ['actie', /^(cta|contact|form|aanvraag|offerteform)/i],
  ['twijfels', /^(faq|vragen|question)/i],
  ['werkwijze', /^(steps?|stappen|werkwijze|process|proces|hoe)/i],
  ['bewijs', /^(reviews?|testimonials?|projects?|projecten|portfolio|ervaring|stats|cijfers)/i],
  ['waarom', /^(usps?|waarom|voordelen|benefits|why|redenen)/i],
  ['aanbod', /^(offer|aanbod|diensten|services?|kamers?|rooms?|intro$|doelgroep|about|overons)/i]
];

function slotRol(slot) {
  if (!slot || typeof slot !== 'object') return 'overig';
  if (ROLLEN.includes(slot.rol)) return slot.rol;
  const sleutel = String(slot.key || '');
  for (const [rol, re] of ROL_PATRONEN) if (re.test(sleutel)) return rol;
  return 'overig';
}

// Plek van een slot op de pagina: de eerste plek waar het in de HTML staat. Zonder HTML geldt de volgorde van de slots.
function plekInHtml(html, sleutel) {
  const re = new RegExp('\\{\\{\\s*(?:#each\\s+)?' + String(sleutel).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  const m = re.exec(String(html || ''));
  return m ? m.index : -1;
}

// Secties van het verhaal: opeenvolgende slots met dezelfde rol vormen een sectie. Alleen tekstslots (geen foto's en links).
function verhaalSecties(template) {
  const slots = (Array.isArray(template && template.slots) ? template.slots : []).filter((s) => s && s.key);
  const html = template && template.htmlTemplate;
  const metPlek = slots.map((s, i) => ({ s, i, plek: plekInHtml(html, s.key) }));
  const geordend = metPlek.slice().sort((a, b) => {
    if (a.plek >= 0 && b.plek >= 0) return a.plek - b.plek;
    return a.i - b.i;
  });
  const uit = [];
  geordend.forEach(({ s }) => {
    const rol = slotRol(s);
    if (rol === 'overig') return;
    const laatste = uit[uit.length - 1];
    if (laatste && laatste.rol === rol) laatste.slots.push({ key: s.key, label: s.label || '', type: s.type || 'text', itemFields: s.itemFields || [] });
    else uit.push({ rol, slots: [{ key: s.key, label: s.label || '', type: s.type || 'text', itemFields: s.itemFields || [] }] });
  });
  return uit;
}

// Waarschuwingen over de opbouw van een sjabloon zelf. Nooit een fout: het blijft een keuze van de maker.
function sjabloonRolWaarschuwingen(template) {
  const secties = verhaalSecties(template);
  const rollen = secties.map((s) => s.rol);
  const uit = [];
  // Een heel kort sjabloon (bijvoorbeeld alleen een hero en een knop) is geen volledige pagina: dan zijn er geen opbouwregels.
  if (secties.length < 3) return uit;
  const slotTekst = (rol) => {
    const s = secties.find((x) => x.rol === rol);
    return s ? s.slots.map((x) => x.key).join(', ') : '';
  };
  if (!rollen.includes('bewijs')) uit.push('Dit sjabloon heeft geen onderdeel voor bewijs (reviews of projecten). Een pagina zonder bewijs overtuigt minder: voeg een reviewblok toe.');
  if (!rollen.includes('twijfels')) uit.push('Dit sjabloon heeft geen onderdeel voor veelgestelde vragen. Daar haal je de laatste twijfels weg voordat de bezoeker een aanvraag doet.');
  if (!rollen.includes('actie') && !/\{\{\s*formulier\s*\}\}/.test(String((template && template.htmlTemplate) || '')) && !(template.slots || []).some((s) => s && s.key === 'ctaLabel')) {
    uit.push('Dit sjabloon heeft geen duidelijke actie (knop of formulier) aan het einde.');
  }
  const eerst = (rol) => rollen.indexOf(rol);
  if (eerst('werkwijze') >= 0 && eerst('aanbod') >= 0 && eerst('werkwijze') < eerst('aanbod')) {
    uit.push(`In dit sjabloon staat de werkwijze (${slotTekst('werkwijze')}) voor het aanbod (${slotTekst('aanbod')}). Laat eerst zien wat het bedrijf levert en daarna hoe het werkt.`);
  }
  if (eerst('bewijs') >= 0 && eerst('actie') >= 0 && eerst('bewijs') > eerst('actie')) {
    uit.push('In dit sjabloon staat het bewijs na de actie. Zet reviews en projecten voor het formulier, zodat ze meewegen bij de beslissing.');
  }
  const dubbel = rollen.filter((r, i) => ['waarom', 'werkwijze', 'bewijs', 'twijfels'].includes(r) && rollen.indexOf(r) !== i);
  if (dubbel.length) uit.push(`Het sjabloon heeft meerdere losse onderdelen met dezelfde taak (${[...new Set(dubbel)].map((r) => ROL_TAKEN[r].naam).join(', ')}). Dat leidt vaak tot herhaling op de pagina.`);
  return uit;
}

// ---- Tekst uit slotData halen ----

const NEGEER_SLOT_RE = /^(meta|cta|links)|(Href|Src|Alt|Icon)$|^icon$|^(href|src|alt|icon|imageSrc|imageAlt)$/i;

// Alle tekstvelden van een pagina, met hun plek. slot = de sleutel van het slot in slotData (dit is wat herschreven wordt).
function tekstVelden(slotData, { metaMee = false } = {}) {
  const uit = [];
  if (!slotData || typeof slotData !== 'object') return uit;
  for (const [key, value] of Object.entries(slotData)) {
    if (!metaMee && NEGEER_SLOT_RE.test(key)) continue;
    if (typeof value === 'string') {
      if (value.trim()) uit.push({ pad: key, slot: key, tekst: value });
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (!item || typeof item !== 'object') return;
        for (const [veld, w] of Object.entries(item)) {
          if (typeof w !== 'string' || !w.trim()) continue;
          if (NEGEER_SLOT_RE.test(veld)) continue;
          uit.push({ pad: `${key}[${i + 1}].${veld}`, slot: key, tekst: w });
        }
      });
    }
  }
  return uit;
}

function schoonLinks(t) {
  return String(t || '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}

function woorden(t) {
  return schoonLinks(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
}

const STOP = new Set(('de het een en of maar want dat die dit deze er is zijn was waren wordt worden werd heeft hebben had kan kunnen zal zullen voor van met op in aan bij naar uit om te als dan ook nog niet geen wel je jij jouw jou u uw we wij ons onze ze zij hun hij zijn haar mijn ik mij me jullie over door tot tegen onder boven na per zo hoe wat wie waar wanneer welke alle alles elk elke meer veel weinig meest altijd nooit vaak soms al alleen zodat omdat terwijl zonder dus toch hier daar nu dan zelf eigen graag even samen').split(' '));

function inhoudsWoorden(w) {
  return w.filter((x) => x.length >= 4 && !STOP.has(x));
}

function fragment(tekst, zoek) {
  const t = schoonLinks(tekst).replace(/\s+/g, ' ');
  const i = t.toLowerCase().indexOf(String(zoek).toLowerCase());
  if (i < 0) return t.slice(0, 60);
  const van = Math.max(0, i - 10);
  const tot = Math.min(t.length, i + zoek.length + 25);
  return (van > 0 ? '...' : '') + t.slice(van, tot) + (tot < t.length ? '...' : '');
}

function leesbaar(pad) {
  return pad.replace(/\[(\d+)\]/, ' $1').replace('.', ' ');
}

// Woorden die altijd leeg klinken zonder een feit erachter. Bewust klein: elk woord hier moet bijna altijd een vulwoord zijn.
const LEGE_WOORDEN_RE = /\b(hoogwaardig\w*|excellentie|topkwaliteit|uitmuntend\w*|ongeëvenaard\w*|state[- ]of[- ]the[- ]art|talloze|persoonlijke aanpak|kwaliteit staat (bij ons )?voorop|met passie voor|naar volle tevredenheid|ruime ervaring|jarenlange ervaring|alles onder één dak|op maat gemaakte oplossingen)\b/gi;

const JE_RE = /\b(je|jij|jouw|jou|jullie)\b/gi;
const U_RE = /\b(u|uw)\b/g;

function tel(re, t) {
  const m = schoonLinks(t).match(new RegExp(re.source, re.flags));
  return m ? m.length : 0;
}

function naamRe(bedrijfsnaam) {
  const n = String(bedrijfsnaam || '').trim();
  if (!n) return null;
  return new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi');
}

// ---- De mechanische redactiecheck ----
// Geeft punten terug: { soort, tekst, slots, aanwijzing }. slots zijn de sleutels in slotData die herschreven kunnen worden.
function redactieControle(slotData, opties) {
  const o = opties || {};
  const punten = [];
  const velden = tekstVelden(slotData);
  if (velden.length < 3) return punten;
  const uniek = (lijst) => [...new Set(lijst)];

  // 1. Dezelfde zin of bijna dezelfde zin in twee onderdelen.
  const SHINGLE = 6;
  const info = velden.map((v) => {
    const w = woorden(v.tekst);
    const sh = new Set();
    for (let i = 0; i + SHINGLE <= w.length; i++) sh.add(w.slice(i, i + SHINGLE).join(' '));
    return { ...v, w, sh };
  });
  const paren = [];
  for (let a = 0; a < info.length; a++) {
    for (let b = a + 1; b < info.length; b++) {
      if (info[a].pad === info[b].pad) continue;
      let gedeeld = null;
      let aantal = 0;
      for (const s of info[a].sh) if (info[b].sh.has(s)) { aantal += 1; if (!gedeeld) gedeeld = s; }
      if (aantal >= 1) paren.push({ a: info[a], b: info[b], gedeeld, aantal });
    }
  }
  paren.sort((x, y) => y.aantal - x.aantal);
  const gemeld = new Set();
  let herhalingen = 0;
  for (const p of paren) {
    const sleutel = [p.a.slot, p.b.slot].sort().join('|') + p.gedeeld;
    if (gemeld.has(sleutel) || herhalingen >= 4) continue;
    gemeld.add(sleutel);
    herhalingen += 1;
    punten.push({
      soort: 'herhaling',
      tekst: `Dezelfde zin staat op twee plekken: "${fragment(p.a.tekst, p.gedeeld)}" bij ${leesbaar(p.a.pad)} en bij ${leesbaar(p.b.pad)}.`,
      slots: uniek([p.a.slot, p.b.slot]),
      aanwijzing: `Dezelfde zin of bijna dezelfde zin staat bij ${leesbaar(p.a.pad)} en ${leesbaar(p.b.pad)}. Laat hem op een van de twee plekken staan en geef het andere onderdeel een eigen invalshoek met andere woorden.`
    });
  }

  // 2. Dezelfde boodschap in veel onderdelen, ook al staat ze in andere woorden (bijvoorbeeld "binnen een dag wind en waterdicht").
  const negeer = new Set(woorden([o.bedrijfsnaam, o.plaats, ...(o.onderwerpWoorden || [])].filter(Boolean).join(' ')));
  const bigrams = new Map();
  info.forEach((v) => {
    const iw = inhoudsWoorden(v.w);
    const hier = new Set();
    for (let i = 0; i + 1 < iw.length; i++) {
      if (negeer.has(iw[i]) || negeer.has(iw[i + 1])) continue;
      hier.add(iw[i] + ' ' + iw[i + 1]);
    }
    hier.forEach((bg) => { if (!bigrams.has(bg)) bigrams.set(bg, []); bigrams.get(bg).push(v); });
  });
  const kandidaten = [...bigrams.entries()].filter(([, lijst]) => new Set(lijst.map((x) => x.pad)).size >= 4)
    .sort((x, y) => y[1].length - x[1].length);
  const gebruiktPad = new Set();
  let boodschappen = 0;
  for (const [bg, lijst] of kandidaten) {
    const paden = uniek(lijst.map((x) => x.pad));
    if (paden.every((p) => gebruiktPad.has(p)) || boodschappen >= 2) continue;
    paden.forEach((p) => gebruiktPad.add(p));
    boodschappen += 1;
    punten.push({
      soort: 'herhaling',
      tekst: `De boodschap "${bg}" komt in ${paden.length} onderdelen terug (${paden.slice(0, 4).map(leesbaar).join(', ')}${paden.length > 4 ? ', ...' : ''}). Houd hem op hooguit twee plekken.`,
      slots: uniek(lijst.map((x) => x.slot)).slice(0, 6),
      aanwijzing: `De boodschap "${bg}" komt in ${paden.length} onderdelen voor. Houd hem op de plek waar hij het meest past (en hooguit een keer kort terug) en schrijf de andere onderdelen over een ander onderwerp of een andere reden.`
    });
  }

  // 3. Wisselen tussen je en u.
  const jePlekken = uniek(velden.filter((v) => tel(JE_RE, v.tekst) > 0).map((v) => v.slot));
  const uPlekken = uniek(velden.filter((v) => tel(U_RE, v.tekst) > 0).map((v) => v.slot));
  const jeTotaal = velden.reduce((n, v) => n + tel(JE_RE, v.tekst), 0);
  const uTotaal = velden.reduce((n, v) => n + tel(U_RE, v.tekst), 0);
  const doel = o.aanspreekvorm === 'u' || o.aanspreekvorm === 'je' ? o.aanspreekvorm : (uTotaal > jeTotaal ? 'u' : 'je');
  const fout = doel === 'je' ? { aantal: uTotaal, plekken: uPlekken } : { aantal: jeTotaal, plekken: jePlekken };
  const gemengd = jeTotaal >= 1 && uTotaal >= 1;
  if (gemengd || (o.aanspreekvorm && fout.aantal >= 1)) {
    punten.push({
      soort: 'toon',
      tekst: gemengd ? `De pagina wisselt tussen "je" en "u" (${fout.aantal}x "${doel === 'je' ? 'u' : 'je'}" naast "${doel}"). Kies een vorm.` : `De pagina spreekt de bezoeker aan met "${doel === 'je' ? 'u' : 'je'}", het klantverhaal zegt "${doel}" (${fout.aantal}x).`,
      slots: fout.plekken.slice(0, 6),
      aanwijzing: `Spreek de bezoeker overal aan met "${doel}". Pas de zinnen aan waar nu "${doel === 'je' ? 'u of uw' : 'je, jij of jouw'}" staat.`
    });
  }

  // 4. Bedrijfsnaam te vaak voluit.
  const re = naamRe(o.bedrijfsnaam);
  if (re) {
    const metNaam = velden.filter((v) => tel(re, v.tekst) > 0);
    const totaal = metNaam.reduce((n, v) => n + tel(re, v.tekst), 0);
    if (totaal > 2) {
      punten.push({
        soort: 'toon',
        tekst: `De bedrijfsnaam staat ${totaal} keer voluit op de pagina. Dat klinkt als een brochure. Gebruik "wij", "we" of "ons" na de eerste keer.`,
        slots: uniek(metNaam.map((v) => v.slot)).slice(0, 6),
        aanwijzing: `Noem de bedrijfsnaam hooguit een keer voluit (in de intro). Schrijf in de andere onderdelen "wij", "we" of "ons".`
      });
    }
  }

  // 5. Lege woorden.
  const leeg = [];
  velden.forEach((v) => {
    const m = schoonLinks(v.tekst).match(LEGE_WOORDEN_RE);
    if (m) leeg.push({ v, woorden: uniek(m.map((x) => x.toLowerCase())) });
  });
  if (leeg.length) {
    const alle = uniek(leeg.flatMap((x) => x.woorden));
    punten.push({
      soort: 'vulwoorden',
      tekst: `Lege woorden zonder feit erachter: ${alle.slice(0, 5).map((x) => `"${x}"`).join(', ')} (${uniek(leeg.map((x) => leesbaar(x.v.pad))).slice(0, 4).join(', ')}).`,
      slots: uniek(leeg.map((x) => x.v.slot)).slice(0, 6),
      aanwijzing: `Vervang woorden als ${alle.slice(0, 5).join(', ')} door een concreet feit (wat doen jullie, hoe lang, hoe vaak, voor wie). Staat er geen feit in de bronteksten, laat de zin dan weg.`
    });
  }

  // 6. Claims die het klantverhaal als niet bruikbaar heeft aangemerkt.
  const nietGebruiken = (o.nietGebruiken || []).map((n) => ({ tekst: n.tekst, w: woorden(n.tekst) })).filter((n) => n.w.length >= 3);
  const verboden = [];
  nietGebruiken.forEach((n) => {
    const venster = Math.min(4, n.w.length);
    const delen = new Set();
    for (let i = 0; i + venster <= n.w.length; i++) delen.add(n.w.slice(i, i + venster).join(' '));
    info.forEach((v) => {
      const t = ' ' + v.w.join(' ') + ' ';
      for (const d of delen) if (t.includes(' ' + d + ' ')) { verboden.push({ n, v }); break; }
    });
  });
  if (verboden.length) {
    punten.push({
      soort: 'claim',
      tekst: `Een claim die het klantverhaal als niet te bewijzen heeft aangemerkt staat op de pagina: "${verboden[0].n.tekst.slice(0, 70)}" (${uniek(verboden.map((x) => leesbaar(x.v.pad))).slice(0, 3).join(', ')}).`,
      slots: uniek(verboden.map((x) => x.v.slot)).slice(0, 6),
      aanwijzing: 'Haal de claim weg die in het klantverhaal bij "niet gebruiken" staat en vervang hem door een concreet feit.'
    });
  }

  // 6b. De hero noemt het bedrijf voluit bij naam in de derde persoon ("Aannemersbedrijf X helpt je"): dat is een brochure.
  if (re) {
    const heroNaam = velden.filter((v) => /^hero(Intro|Subtitle|Tekst|Text)/i.test(v.slot) && tel(re, v.tekst) > 0);
    if (heroNaam.length) {
      punten.push({
        soort: 'toon',
        tekst: `De hero praat over het bedrijf bij de volledige naam in plaats van als "wij" (${uniek(heroNaam.map((v) => leesbaar(v.pad))).join(', ')}). Dat klinkt afstandelijk.`,
        slots: uniek(heroNaam.map((v) => v.slot)),
        aanwijzing: 'Schrijf de hero als "wij" tegen "je": begin met de situatie of vraag van de bezoeker en laat de bedrijfsnaam weg. Geen openingszin die met de bedrijfsnaam begint.'
      });
    }
  }

  // 6c. Dezelfde harde claim (aantal jaren, startjaar) op meer dan een plek: noem hem een keer, daar waar hij het meest overtuigt.
  const CLAIMS = [[/\b\d{1,3}\s*jaar\b/i, 'het aantal jaren ervaring'], [/\bsinds\s+(?:in\s+)?(?:19|20)\d{2}\b|\bactief\s+sinds\b/i, 'het startjaar']];
  CLAIMS.forEach(([cre, naam]) => {
    const plekken = velden.filter((v) => !/^(review|practical)/i.test(v.slot) && cre.test(v.tekst));
    const slotsMet = uniek(plekken.map((v) => v.slot));
    if (slotsMet.length >= 3 || (slotsMet.length === 2 && naam === 'het aantal jaren ervaring')) {
      punten.push({
        soort: 'herhaling',
        tekst: `${naam[0].toUpperCase() + naam.slice(1)} staat op ${slotsMet.length} plekken (${slotsMet.slice(0, 4).join(', ')}).`,
        slots: slotsMet.slice(1),
        aanwijzing: `Noem ${naam} maar een keer (bij ${slotsMet[0]}). Schrijf de andere plekken over iets anders, zonder dit feit te herhalen.`
      });
    }
  });

  // 7. De hero is afstandelijk: de bezoeker wordt niet direct aangesproken of het bedrijf spreekt niet als "wij".
  const hero = velden.filter((v) => /^hero(Intro|Subtitle|Tekst|Text)/i.test(v.slot));
  if (hero.length) {
    const tekst = hero.map((v) => v.tekst).join(' ');
    const aangesproken = tel(JE_RE, tekst) + tel(U_RE, tekst) > 0;
    const wij = /\b(wij|we|ons|onze)\b/i.test(tekst);
    if (!aangesproken || !wij) {
      punten.push({
        soort: 'toon',
        tekst: `De intro bovenaan klinkt afstandelijk: ${!aangesproken ? 'de bezoeker wordt niet direct aangesproken' : 'het bedrijf spreekt niet over zichzelf als "wij"'}.`,
        slots: uniek(hero.map((v) => v.slot)),
        aanwijzing: `Schrijf de intro persoonlijk: spreek de bezoeker aan met "${doel}" en schrijf als bedrijf "wij" of "we". Voorbeeld van de toon: "Wij helpen woningeigenaren met ... We luisteren naar je plannen en denken praktisch mee."`
      });
    }
  }

  return punten;
}

// Lijst van onderdelen met inhoud die ontbreken. Voor bewijs en veelgestelde vragen: leeg terwijl het sjabloon er een plek voor heeft.
function ontbrekendBewijs(template, slotData, klantverhaal) {
  const uit = [];
  const secties = verhaalSecties(template);
  const sd = slotData || {};
  const leegLijst = (key) => {
    const w = sd[key];
    return Array.isArray(w) ? w.length === 0 : !String(w || '').trim();
  };
  secties.filter((s) => s.rol === 'bewijs').forEach((s) => {
    s.slots.filter((x) => x.type === 'list').forEach((x) => {
      if (leegLijst(x.key)) {
        const heeftBron = klantverhaal && klantverhaal.status === 'goedgekeurd' && (klantverhaal.bewijs || []).length;
        uit.push({
          soort: 'bewijs',
          tekst: `Het onderdeel "${x.label || x.key}" is leeg${heeftBron ? ', terwijl het klantverhaal wel reviews of projecten heeft' : ''}. Bewijs maakt een pagina geloofwaardig.`,
          slots: [x.key],
          aanwijzing: heeftBron ? 'Vul dit onderdeel met reviews en projecten uit het klantverhaal. Reviews letterlijk overnemen.' : 'Vul dit onderdeel alleen met echte reviews of projecten uit de bronteksten. Staat er niets, laat het dan leeg.'
        });
      }
    });
  });
  return uit;
}

module.exports = {
  ROLLEN,
  ROL_TAKEN,
  GEWENSTE_VOLGORDE,
  slotRol,
  verhaalSecties,
  sjabloonRolWaarschuwingen,
  tekstVelden,
  redactieControle,
  ontbrekendBewijs,
  woorden
};
