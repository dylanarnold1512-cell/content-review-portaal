const { forEachTextLeaf, INLINE_LINK_RE } = require('./slotEngine');

// LP Fabriek: validator voor publicatie. Twee paden naast elkaar sinds
// bouwvolgorde-stap 3 (koerswijziging naar vrije templates, zie
// besluiten.md):
//  - BLOKKEN-pad (oud, ongewijzigd): contentJson = { meta, blocks: [...] },
//    gevalideerd tegen blueprint.verplichteBlokken/optioneleBlokken/enz.
//  - SLOT-pad (nieuw): contentJson = { meta, slotData: {...} }, gevalideerd
//    tegen blueprint.slots (welke slots verplicht zijn) plus dezelfde
//    inhoudelijke regels als voorheen (linkRegels/ctaRegel/seoRegels/
//    uniciteitsbudget) — nu gecontroleerd op slotData in plaats van blocks.
//  Welk pad gebruikt wordt volgt uit blueprint.templateFormat === 'slots'.
//
// Puur mechanisch, geen taalmodel-check op claims/overlap — dat blijft
// mensenwerk (bronprincipe, zie besluiten.md besluit 8).

function countBlocksByType(blocks, type) {
  return blocks.filter((b) => b.type === type).length;
}

function validatePage({ blueprint, contentJson }) {
  if (blueprint && blueprint.templateFormat === 'slots') {
    return validateSlotPage({ blueprint, contentJson });
  }
  return validateBlockPage({ blueprint, contentJson });
}

// ---- Blokken-pad (ongewijzigd t.o.v. voor bouwvolgorde-stap 3) ----
function validateBlockPage({ blueprint, contentJson }) {
  const errors = [];
  const warnings = [];
  const blocks = Array.isArray(contentJson?.blocks) ? contentJson.blocks : [];
  const meta = contentJson?.meta || {};

  if (!blocks.length) {
    errors.push('Geen blokken in de content JSON.');
    return { errors, warnings, ok: false };
  }

  (blueprint.verplichteBlokken || []).forEach((type) => {
    if (countBlocksByType(blocks, type) < 1) {
      errors.push(`Verplicht blok ontbreekt: "${type}".`);
    }
  });

  const toegestaan = new Set([...(blueprint.verplichteBlokken || []), ...(blueprint.optioneleBlokken || [])]);
  blocks.forEach((b) => {
    if (!toegestaan.has(b.type)) {
      warnings.push(`Bloktype "${b.type}" staat niet in deze blueprint (verplicht of optioneel).`);
    }
  });

  if (blueprint.seoRegels?.exactEenH1) {
    const heroCount = countBlocksByType(blocks, 'hero');
    if (heroCount !== 1) {
      errors.push(`Verwacht precies 1 hero-blok (= 1 H1), gevonden: ${heroCount}.`);
    }
  }

  if (blueprint.ctaRegel?.verplicht) {
    const ctaBlocks = blocks.filter((b) => b.type === 'cta');
    if (!ctaBlocks.length) {
      errors.push('Verplicht CTA-blok ontbreekt.');
    } else if (ctaBlocks.some((b) => !b.data?.cta?.href)) {
      errors.push('CTA-blok mist een href.');
    }
  }

  if (blueprint.linkRegels) {
    const { minimumInterneLinks, minimumNaarZusterpaginas, reasonRequired } = blueprint.linkRegels;
    const linksBlock = blocks.find((b) => b.type === 'links');
    const items = linksBlock?.data?.items || [];
    if (typeof minimumInterneLinks === 'number' && items.length < minimumInterneLinks) {
      errors.push(`Minimaal ${minimumInterneLinks} interne links vereist, gevonden: ${items.length}.`);
    }
    if (typeof minimumNaarZusterpaginas === 'number') {
      const naarZuster = items.filter((i) => i.zusterpagina).length;
      if (naarZuster < minimumNaarZusterpaginas) {
        errors.push(`Minimaal ${minimumNaarZusterpaginas} links naar zusterpagina's vereist, gevonden: ${naarZuster}.`);
      }
    }
    if (reasonRequired && items.some((i) => !i.reason)) {
      errors.push('Niet elke link in het links-blok heeft een reden (reason).');
    }
  }

  validateSeoRegels(blueprint, meta, errors);
  validateUniciteitsbudget(blueprint, warnings);

  return { errors, warnings, ok: errors.length === 0 };
}

// ---- Slot-pad (nieuw, bouwvolgorde-stap 3) ----
function validateSlotPage({ blueprint, contentJson }) {
  const errors = [];
  const warnings = [];
  const slotData = contentJson?.slotData && typeof contentJson.slotData === 'object' ? contentJson.slotData : {};
  const meta = contentJson?.meta || {};
  const slots = Array.isArray(blueprint.slots) ? blueprint.slots : [];

  if (!Object.keys(slotData).length) {
    errors.push('Geen ingevulde content (slotData) voor dit sjabloon.');
    return { errors, warnings, ok: false };
  }

  slots.forEach((slot) => {
    if (!slot || !slot.verplicht) return;
    // "linksItems" is bewust uitgesloten van deze algemene verplicht-check: sinds het besluit
    // "kwaliteit boven kwantiteit" (zie besluiten.md, 04-09-2026) is een lege linksItems-lijst
    // gewoon een geldige uitkomst als er niks relevants was om naar te linken — dat wordt hieronder
    // al apart (als waarschuwing, niet als blokkerende fout) via linkRegels afgehandeld. Zonder deze
    // uitzondering zou een sjabloon met "linksItems" op verplicht:true publiceren alsnog blokkeren
    // bij 0 relevante links, wat precies ingaat tegen dat besluit.
    if (slot.key === 'linksItems') return;
    const value = slotData[slot.key];
    if (slot.type === 'list') {
      if (!Array.isArray(value) || !value.length) {
        errors.push(`Verplichte lijst-slot ontbreekt of is leeg: "${slot.label || slot.key}".`);
      }
    } else if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(`Verplichte slot ontbreekt: "${slot.label || slot.key}".`);
    }
  });

  // heroTitle is de vaste sleutel voor de enige H1 (structureel al
  // gecontroleerd op sjabloonniveau bij het opslaan, zie
  // validateTemplateStructure) — hier controleren we alleen dat 'ie per
  // PAGINA ook echt gevuld is.
  if (!slotData.heroTitle || !String(slotData.heroTitle).trim()) {
    errors.push('Slot "heroTitle" (de H1 van de pagina) is niet ingevuld.');
  }

  if (blueprint.ctaRegel?.verplicht) {
    if (!slotData.ctaLabel || !slotData.ctaHref) {
      errors.push('CTA is verplicht maar "ctaLabel" en/of "ctaHref" ontbreekt.');
    }
  }

  if (blueprint.linkRegels) {
    // Besluit (04-09-2026, zie besluiten.md): kwaliteit boven kwantiteit. Een link moet
    // inhoudelijk iets toevoegen, dus een laag aantal is GEEN publicatieblokkade meer — alleen
    // nog een waarschuwing ter info. Links mogen bovendien ook middenin lopende tekst-slots
    // zitten (niet alleen in de linksItems-lijst), dus die tellen hier mee voor een eerlijk totaal.
    const { minimumInterneLinks, minimumNaarZusterpaginas, reasonRequired } = blueprint.linkRegels;
    const items = Array.isArray(slotData.linksItems) ? slotData.linksItems : [];
    const inlineLinkAantal = countInlineLinks(slotData);
    const totaalInterneLinks = items.length + inlineLinkAantal;
    if (typeof minimumInterneLinks === 'number' && totaalInterneLinks < minimumInterneLinks) {
      warnings.push(
        `Minder interne links dan het richtaantal (${minimumInterneLinks}), gevonden: ${totaalInterneLinks} ` +
        `(${items.length} in de linksitems-lijst, ${inlineLinkAantal} middenin de tekst). Alleen een ` +
        'aandachtspunt als er wel degelijk relevante pagina\'s waren om naar te linken.'
      );
    }
    if (typeof minimumNaarZusterpaginas === 'number') {
      const naarZuster = items.filter((i) => i.zusterpagina).length;
      if (naarZuster < minimumNaarZusterpaginas) {
        warnings.push(`Minder links naar zusterpagina's dan het richtaantal (${minimumNaarZusterpaginas}), gevonden: ${naarZuster}.`);
      }
    }
    if (reasonRequired && items.some((i) => !i.reason)) {
      errors.push('Niet elke interne link in de linksitems-lijst heeft een reden (reason).');
    }
  }

  validateSeoRegels(blueprint, meta, errors);
  validateUniciteitsbudget(blueprint, warnings);

  return { errors, warnings, ok: errors.length === 0 };
}

// Telt [ankertekst](url)-links middenin tekst-slots (dus NIET de losse linksItems-lijst, die telt
// de aanroeper apart) - voor een eerlijk totaalbeeld nu links niet meer alleen in die ene lijst
// hoeven te zitten. metaTitle/metaDescription tellen nooit mee (daar hoort sowieso geen link in).
function countInlineLinks(slotData) {
  let aantal = 0;
  forEachTextLeaf(slotData, (path, value) => {
    if (path === 'metaTitle' || path === 'metaDescription') return;
    const matches = value.match(INLINE_LINK_RE);
    if (matches) aantal += matches.length;
  });
  return aantal;
}

function validateSeoRegels(blueprint, meta, errors) {
  if (!blueprint.seoRegels) return;
  const { metaTitleMin, metaTitleMax, metaDescriptionMin, metaDescriptionMax } = blueprint.seoRegels;
  const titleLen = (meta.metaTitle || '').length;
  const descLen = (meta.metaDescription || '').length;
  if (!meta.metaTitle) {
    errors.push('Meta title ontbreekt.');
  } else if (typeof metaTitleMin === 'number' && typeof metaTitleMax === 'number') {
    if (titleLen < metaTitleMin || titleLen > metaTitleMax) {
      errors.push(`Meta title lengte (${titleLen}) valt buiten ${metaTitleMin}-${metaTitleMax} tekens.`);
    }
  }
  if (!meta.metaDescription) {
    errors.push('Meta description ontbreekt.');
  } else if (typeof metaDescriptionMin === 'number' && typeof metaDescriptionMax === 'number') {
    if (descLen < metaDescriptionMin || descLen > metaDescriptionMax) {
      errors.push(`Meta description lengte (${descLen}) valt buiten ${metaDescriptionMin}-${metaDescriptionMax} tekens.`);
    }
  }
}

function validateUniciteitsbudget(blueprint, warnings) {
  if (blueprint.uniciteitsbudget?.minimumUniekeFeiten) {
    warnings.push(
      `Controleer handmatig: minimaal ${blueprint.uniciteitsbudget.minimumUniekeFeiten} unieke feiten vereist voor deze pagina (uitgesloten van uniciteit: ${(blueprint.uniciteitsbudget.uitgeslotenVanUniciteit || []).join(', ') || 'geen'}).`
    );
  }
}

// ---- Structuurcheck op SJABLOON-niveau (nieuw) ----
// Wordt aangeroepen bij het opslaan van een slot-sjabloon (POST /templates,
// PUT /templates/:id/blueprint als templateFormat 'slots' is) — dus niet per
// pagina, want de structuur (htmlTemplate) ligt vast per sjabloon en
// verandert niet per pagina. Combineert de veiligheidscheck (geen scripts/
// externe resources, zie slotEngine.js) met de oude "exact 1 H1"-eis, nu
// toegepast op de HTML-tekst van het sjabloon zelf in plaats van op een
// blokkentelling.
function validateTemplateStructure(blueprint) {
  const { templateSafetyCheck } = require('./slotEngine');
  const errors = [];
  if (!blueprint || blueprint.templateFormat !== 'slots') {
    return { errors, ok: true };
  }
  const html = String(blueprint.htmlTemplate || '');
  const css = String(blueprint.cssTemplate || '');
  if (!html.trim()) {
    errors.push('htmlTemplate ontbreekt of is leeg.');
  }
  const safety = templateSafetyCheck(html, css);
  errors.push(...safety.errors);

  const h1Matches = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (h1Matches.length !== 1) {
    errors.push(`Sjabloon moet precies 1 <h1> bevatten, gevonden: ${h1Matches.length}.`);
  } else if (!/{{\s*heroTitle\s*}}/.test(h1Matches[0][1])) {
    errors.push('De <h1> in het sjabloon moet de slot "{{heroTitle}}" gebruiken.');
  }

  const slots = Array.isArray(blueprint.slots) ? blueprint.slots : [];
  if (!slots.some((s) => s && s.key === 'heroTitle')) {
    errors.push('Sjabloon mist de verplichte slot "heroTitle".');
  }
  if (blueprint.ctaRegel?.verplicht) {
    if (!slots.some((s) => s && s.key === 'ctaLabel') || !slots.some((s) => s && s.key === 'ctaHref')) {
      errors.push('CTA is verplicht maar de slots "ctaLabel"/"ctaHref" ontbreken.');
    }
  }
  if (blueprint.linkRegels && (blueprint.linkRegels.minimumInterneLinks || blueprint.linkRegels.minimumNaarZusterpaginas)) {
    if (!slots.some((s) => s && s.key === 'linksItems')) {
      errors.push('linkRegels vereist interne links maar de slot "linksItems" ontbreekt.');
    }
  }

  return { errors, ok: errors.length === 0 };
}

module.exports = { validatePage, validateTemplateStructure };
