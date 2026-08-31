// LP Fabriek: validator voor publicatie. Controleert een content JSON
// (contentJson = { meta: { metaTitle, metaDescription }, blocks: [...] })
// tegen de regels van de blueprint (zie src/lp/clients/*/blueprints/*.js).
//
// Bewust eenvoudig gehouden voor MVP: harde regels uit de blueprint worden
// gecontroleerd, resultaat is een lijst met fouten (blokkeert publiceren) en
// een lijst met waarschuwingen (mag genegeerd worden). Geen taalmodel-check
// op claims/overlap hier — dat blijft mensenwerk (bronprincipe, zie
// besluiten.md besluit 8), dit is de mechanische laag.

function countBlocksByType(blocks, type) {
  return blocks.filter((b) => b.type === type).length;
}

function validatePage({ blueprint, contentJson }) {
  const errors = [];
  const warnings = [];
  const blocks = Array.isArray(contentJson?.blocks) ? contentJson.blocks : [];
  const meta = contentJson?.meta || {};

  if (!blocks.length) {
    errors.push('Geen blokken in de content JSON.');
    return { errors, warnings, ok: false };
  }

  // Verplichte blokken uit de blueprint.
  (blueprint.verplichteBlokken || []).forEach((type) => {
    if (countBlocksByType(blocks, type) < 1) {
      errors.push(`Verplicht blok ontbreekt: "${type}".`);
    }
  });

  // Onbekende bloktypes (niet in verplicht of optioneel) — waarschuwing, geen blokkade.
  const toegestaan = new Set([...(blueprint.verplichteBlokken || []), ...(blueprint.optioneleBlokken || [])]);
  blocks.forEach((b) => {
    if (!toegestaan.has(b.type)) {
      warnings.push(`Bloktype "${b.type}" staat niet in deze blueprint (verplicht of optioneel).`);
    }
  });

  // Exact één H1 (= exact één hero-blok, want alleen hero.js rendert een H1).
  if (blueprint.seoRegels?.exactEenH1) {
    const heroCount = countBlocksByType(blocks, 'hero');
    if (heroCount !== 1) {
      errors.push(`Verwacht precies 1 hero-blok (= 1 H1), gevonden: ${heroCount}.`);
    }
  }

  // CTA-regel.
  if (blueprint.ctaRegel?.verplicht) {
    const ctaBlocks = blocks.filter((b) => b.type === 'cta');
    if (!ctaBlocks.length) {
      errors.push('Verplicht CTA-blok ontbreekt.');
    } else if (ctaBlocks.some((b) => !b.data?.cta?.href)) {
      errors.push('CTA-blok mist een href.');
    }
  }

  // Linkregels.
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

  // SEO meta-regels.
  if (blueprint.seoRegels) {
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

  // Uniciteitsbudget: puur een telling/herinnering, geen harde blokkade — de
  // tool weet niet of feiten "uniek genoeg" zijn zonder een taalmodel, dus dit
  // is bewust een waarschuwing die de reviewer (Dylan/Marc) zelf beoordeelt.
  if (blueprint.uniciteitsbudget?.minimumUniekeFeiten) {
    warnings.push(
      `Controleer handmatig: minimaal ${blueprint.uniciteitsbudget.minimumUniekeFeiten} unieke feiten vereist voor deze pagina (uitgesloten van uniciteit: ${(blueprint.uniciteitsbudget.uitgeslotenVanUniciteit || []).join(', ') || 'geen'}).`
    );
  }

  return { errors, warnings, ok: errors.length === 0 };
}

module.exports = { validatePage };
