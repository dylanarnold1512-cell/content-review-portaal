// Feedback per onderdeel (29-09-2026): in plaats van het hele sjabloon opnieuw te laten schrijven, past de AI
// alleen een gekozen sectie aan (of voegt een nieuw onderdeel toe na een sectie). De rest van het sjabloon
// wordt mechanisch NIET aangeraakt: het resultaat vervangt precies het stuk HTML van die sectie en
// eventueel een paar CSS-regels. Voordelen: veel minder tekst om te schrijven (sneller) en geen
// ongevraagde wijzigingen elders.
//
// Dit bestand bevat alleen de deterministische kant (secties beschrijven, patch veilig toepassen,
// controleren). De AI-aanroep zelf staat in ai.js (refineSectionProposal).

const { vindSecties } = require('./overrides');
const { templateSafetyCheck } = require('./slotEngine');
const { zorgVoorGalerijSlot } = require('./galerij');

function schoon(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Leesbare lijst van de secties, voor de keuzelijst in het portaal.
function beschrijfSecties(htmlTemplate, voorbeeldSlotData) {
  const html = String(htmlTemplate || '');
  const sample = voorbeeldSlotData && typeof voorbeeldSlotData === 'object' ? voorbeeldSlotData : {};
  return vindSecties(html).map((s, index) => {
    const stuk = html.slice(s.start, s.end);
    const kop = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(stuk);
    let naam = kop ? schoon(kop[1]) : '';
    naam = naam.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => (typeof sample[key] === 'string' && sample[key].trim() ? sample[key].trim() : key));
    if (!naam) {
      const cls = /\sclass=["']([^"']+)["']/i.exec(s.openTag || '');
      naam = cls ? `sectie "${cls[1].split(/\s+/)[0]}"` : 'zonder kop';
    }
    if (naam.length > 60) naam = naam.slice(0, 57) + '...';
    const isHero = /<h1\b/i.test(stuk);
    return { index, label: `${index + 1}. ${naam}${isHero ? ' (hero)' : ''}`, isHero };
  });
}

// Het stuk sjabloon dat de AI te zien krijgt: de HTML van de sectie.
function haalSectie(htmlTemplate, index) {
  const html = String(htmlTemplate || '');
  const secties = vindSecties(html);
  const s = secties[index];
  if (!s) throw new Error(`Onderdeel ${index + 1} bestaat niet (het sjabloon heeft ${secties.length} onderdelen).`);
  return { html: html.slice(s.start, s.end), start: s.start, end: s.end, aantal: secties.length };
}

// Sleutels van slots die in een stuk HTML voorkomen ({{key}} en {{#each key}}), voor de context aan de AI.
function slotSleutelsIn(html) {
  const keys = new Set();
  String(html || '').replace(/\{\{\s*#each\s+([\w.]+)\s*\}\}/g, (_, k) => { keys.add(k); return ''; });
  String(html || '').replace(/\{\{\s*([A-Za-z_][\w.]*)\s*\}\}/g, (_, k) => { keys.add(k); return ''; });
  return [...keys];
}

function klassenIn(tekst) {
  return [...new Set([...String(tekst || '').matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]))].filter((c) => c !== 'lpt');
}

function tel(hooiberg, naald) {
  if (!naald) return 0;
  let n = 0;
  let pos = hooiberg.indexOf(naald);
  while (pos >= 0) { n += 1; pos = hooiberg.indexOf(naald, pos + naald.length); }
  return n;
}

// Past het antwoord van de AI toe. Pure functie, gooit een duidelijke fout als iets niet veilig kan.
// sectie: { modus: 'vervang' | 'voeg_toe_na', index }
function pasSectiePatchToe(blueprint, voorbeeldSlotData, sectie, patch) {
  if (!blueprint || typeof blueprint !== 'object') throw new Error('Geen geldig sjabloon om aan te passen.');
  if (!patch || typeof patch !== 'object' || typeof patch.sectieHtml !== 'string' || !patch.sectieHtml.trim()) {
    throw new Error('Het AI-antwoord miste het veld "sectieHtml". Er is niets veranderd.');
  }
  const modus = sectie && sectie.modus === 'voeg_toe_na' ? 'voeg_toe_na' : 'vervang';
  const html = String(blueprint.htmlTemplate || '');
  const doel = haalSectie(html, Number(sectie && sectie.index));

  const nieuw = patch.sectieHtml.trim();
  const nieuweSecties = vindSecties(nieuw);
  if (nieuweSecties.length !== 1 || nieuweSecties[0].start !== 0 || nieuweSecties[0].end !== nieuw.length) {
    throw new Error('Het AI-antwoord bevatte niet precies een <section>. Er is niets veranderd, probeer het opnieuw.');
  }

  const voor = html.slice(0, modus === 'vervang' ? doel.start : doel.end);
  const na = html.slice(doel.end);
  const scheiding = modus === 'voeg_toe_na' ? '\n' : '';
  const nieuweHtml = voor + scheiding + nieuw + na;

  // CSS: gerichte vervangingen (moeten uniek zijn) en toevoegingen.
  let css = String(blueprint.cssTemplate || '');
  const waarschuwingen = [];
  const andereHtml = voor + na;
  (Array.isArray(patch.cssVervangen) ? patch.cssVervangen : []).forEach((w) => {
    if (!w || typeof w.zoek !== 'string' || typeof w.vervang !== 'string' || !w.zoek) return;
    const aantal = tel(css, w.zoek);
    if (aantal !== 1) {
      throw new Error(`Een CSS-wijziging van de AI paste niet exact op het sjabloon (${aantal} keer gevonden in plaats van 1). Er is niets veranderd, probeer het opnieuw.`);
    }
    // Waarschuwing als de te wijzigen regel ook bij andere onderdelen hoort.
    const gedeeld = klassenIn(w.zoek).filter((c) => new RegExp(`class=["'][^"']*\\b${c}\\b`).test(andereHtml));
    if (gedeeld.length) {
      waarschuwingen.push(`Let op: de CSS-wijziging raakt ook klasse(n) die andere onderdelen gebruiken (${gedeeld.slice(0, 4).join(', ')}). Controleer die onderdelen in het voorbeeld.`);
    }
    css = css.replace(w.zoek, () => w.vervang);
  });
  if (typeof patch.cssToevoegen === 'string' && patch.cssToevoegen.trim()) {
    css = css.replace(/\s*$/, '') + '\n' + patch.cssToevoegen.trim() + '\n';
  }

  // Slots en voorbeeldwaarden: alleen toevoegen wat nog niet bestaat.
  const slots = Array.isArray(blueprint.slots) ? blueprint.slots.slice() : [];
  (Array.isArray(patch.slotsToevoegen) ? patch.slotsToevoegen : []).forEach((s) => {
    if (s && typeof s.key === 'string' && !slots.some((x) => x && x.key === s.key)) slots.push(s);
  });
  const sample = { ...(voorbeeldSlotData && typeof voorbeeldSlotData === 'object' ? voorbeeldSlotData : {}) };
  const extra = patch.voorbeeldSlotDataToevoegen && typeof patch.voorbeeldSlotDataToevoegen === 'object' ? patch.voorbeeldSlotDataToevoegen : {};
  Object.keys(extra).forEach((k) => { if (!(k in sample)) sample[k] = extra[k]; });

  const resultaat = zorgVoorGalerijSlot({ ...blueprint, htmlTemplate: nieuweHtml, cssTemplate: css, slots });

  // Controles. Buiten het gekozen onderdeel is de HTML per definitie ongewijzigd; dat bewaken we ook expliciet.
  if (!resultaat.htmlTemplate.startsWith(voor) || !resultaat.htmlTemplate.endsWith(na)) {
    throw new Error('Interne controle mislukt: de HTML buiten het gekozen onderdeel zou veranderen. Er is niets veranderd.');
  }
  const veiligheid = templateSafetyCheck(resultaat.htmlTemplate, resultaat.cssTemplate);
  if (veiligheid.errors.length) {
    throw new Error(`De wijziging van de AI is niet toegestaan: ${veiligheid.errors.join(' ')} Er is niets veranderd.`);
  }
  const { validateTemplateStructure } = require('./validator');
  const voorControle = validateTemplateStructure(blueprint);
  const naControle = validateTemplateStructure(resultaat);
  const nieuweFouten = naControle.errors.filter((e) => !voorControle.errors.includes(e));
  if (nieuweFouten.length) {
    throw new Error(`De wijziging van de AI geeft een fout in het sjabloon: ${nieuweFouten.join(' ')} Er is niets veranderd.`);
  }
  naControle.warnings.filter((w) => !voorControle.warnings.includes(w)).forEach((w) => waarschuwingen.push(w));

  return { blueprint: resultaat, voorbeeldSlotData: sample, waarschuwingen: [...new Set(waarschuwingen)] };
}

module.exports = { beschrijfSecties, haalSectie, slotSleutelsIn, pasSectiePatchToe };
