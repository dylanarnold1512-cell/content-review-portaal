// LP Fabriek: interne zone /api/lp. Alleen bereikbaar met het aparte
// LP_PASSWORD (zie src/middleware/auth.js, requireLpInternal) — klanten
// kunnen hier nooit bij, zie besluiten.md "Portaal: een app, twee zones".

const express = require('express');
const { getLpClient, clients: lpClients } = require('../lp/clients');
const lpNotion = require('../lp/notion');
const templates = require('../lp/templates');
const clientIntake = require('../lp/clientIntake');
const { buildHuisstijlVoorstel } = require('../lp/huisstijl');
const ai = require('../lp/ai');
const { renderPageHtml } = require('../lp/render');
const { validatePage, validateTemplateStructure } = require('../lp/validator');
const { pushDraft, deletePage: deleteWpPage, searchMedia, uploadMedia, listSitePages } = require('../lp/wordpress');
const { checkLpPassword, requireLpInternal } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  try {
    if (!checkLpPassword(password)) {
      return res.status(401).json({ error: 'Onjuist wachtwoord.' });
    }
    req.session.isLpInternal = true;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  if (req.session) req.session.isLpInternal = false;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ isLpInternal: Boolean(req.session && req.session.isLpInternal) });
});

// Klanten + hun blueprints, voor de dropdowns in het formulier-scherm.
router.get('/clients', requireLpInternal, async (req, res) => {
  try {
    const overzicht = await Promise.all(Object.keys(lpClients).map(async (clientId) => {
      const client = lpClients[clientId];
      const actieveSjablonen = await templates.listTemplates({ klant: clientId, status: 'Actief' });
      return {
        id: clientId,
        naam: client.profile.naam,
        blueprints: actieveSjablonen.map((sjabloon) => ({
          id: sjabloon.blueprintId,
          naam: sjabloon.naam
        }))
      };
    }));
    res.json({ clients: overzicht });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/clients/:clientId/media', requireLpInternal, async (req, res) => {
  try {
    const client = getLpClient(req.params.clientId);
    const { items, page, totalPages, total } = await searchMedia({
      profile: client.profile,
      search: req.query.search,
      page: req.query.page
    });
    res.json({ media: items, page, totalPages, total });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/clients/:clientId/media/upload', requireLpInternal, async (req, res) => {
  try {
    const { filename, contentType, dataBase64 } = req.body || {};
    if (!filename || !dataBase64) {
      return res.status(400).json({ error: 'Bestandsnaam en bestandsdata zijn verplicht.' });
    }
    const client = getLpClient(req.params.clientId);
    const buffer = Buffer.from(dataBase64, 'base64');
    const item = await uploadMedia({ profile: client.profile, filename, contentType, buffer });
    res.json({ media: item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/clients/:clientId/blueprints/:blueprintId', requireLpInternal, async (req, res) => {
  try {
    const blueprint = await templates.getActiveTemplateByBlueprintId(req.params.clientId, req.params.blueprintId);
    res.json({ blueprint });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.get('/clients/:clientId/feiten', requireLpInternal, (req, res) => {
  try {
    const client = getLpClient(req.params.clientId);
    res.json({ feiten: client.feiten });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Klant-intake (nieuwe klant toevoegen). Git blijft de bron van waarheid
// voor klantprofielen (besluit 4) — deze database in Notion is alleen een
// wachtruimte tussen "Dylan heeft de intake ingevuld/bevestigd" en "de
// bestanden staan in de repo en zijn gedeployed" (zie besluiten.md, "Klant-
// intake in het portaal"). De uurlijkse automatische verwerking pakt
// pagina's met Status "Nieuw" hier op.
router.post('/intake/analyseer-huisstijl', requireLpInternal, async (req, res) => {
  try {
    const { referentieUrl } = req.body || {};
    const voorstel = await buildHuisstijlVoorstel(referentieUrl);
    res.json(voorstel);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/intake', requireLpInternal, async (req, res) => {
  try {
    const items = await clientIntake.listIntakes({ status: req.query.status });
    res.json({ intakes: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/intake/:intakeId', requireLpInternal, async (req, res) => {
  try {
    const item = await clientIntake.getIntake(req.params.intakeId);
    res.json({ intake: item });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/intake', requireLpInternal, async (req, res) => {
  try {
    const { klantnaam, klantId, intake } = req.body || {};
    if (!klantnaam || !klantId || !intake) {
      return res.status(400).json({ error: 'klantnaam, klantId en intake zijn verplicht.' });
    }
    if (!/^[a-z0-9-]+$/.test(klantId)) {
      return res.status(400).json({ error: 'klantId mag alleen kleine letters, cijfers en koppeltekens bevatten (bv. "jmb").' });
    }
    const item = await clientIntake.createIntake({ klantnaam, klantId, intake: { ...intake, klantId } });
    res.json({ intake: item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Vaste opties voor de "vaste onderdelen"-checklist in het sjabloon-scherm
// (Stap 1, vraag 3) — zie besluiten.md, "Openstaand: concrete vraagset".
router.get('/templates/onderdelen-opties', requireLpInternal, (req, res) => {
  res.json({ opties: ai.VASTE_ONDERDELEN_OPTIES });
});

// Sjablonen (in Notion, database "Sjablonen") — los van Pagina's hieronder.
router.get('/templates', requireLpInternal, async (req, res) => {
  try {
    const items = await templates.listTemplates({ klant: req.query.klant, status: req.query.status });
    res.json({ templates: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/templates', requireLpInternal, async (req, res) => {
  try {
    const { klant, naam, blueprintId, status, blueprint } = req.body || {};
    if (!klant || !naam || !blueprintId || !blueprint) {
      return res.status(400).json({ error: 'klant, naam, blueprintId en blueprint zijn verplicht.' });
    }
    const structuur = validateTemplateStructure(blueprint);
    if (!structuur.ok) {
      return res.status(400).json({ error: 'Sjabloon voldoet niet aan de structuur-eisen.', structuurFouten: structuur.errors });
    }
    const template = await templates.createTemplate({ klant, naam, blueprintId, status, blueprint });
    res.json({ template });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/templates/:templateId', requireLpInternal, async (req, res) => {
  try {
    const template = await templates.getTemplate(req.params.templateId);
    res.json({ template });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.put('/templates/:templateId/blueprint', requireLpInternal, async (req, res) => {
  try {
    const blueprint = req.body?.blueprint ?? null;
    const structuur = validateTemplateStructure(blueprint);
    if (!structuur.ok) {
      return res.status(400).json({ error: 'Sjabloon voldoet niet aan de structuur-eisen.', structuurFouten: structuur.errors });
    }
    const template = await templates.updateTemplateBlueprint(req.params.templateId, blueprint);
    res.json({ template });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/templates/:templateId/status', requireLpInternal, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status is verplicht.' });
    await templates.setTemplateStatus(req.params.templateId, status);
    const template = await templates.getTemplate(req.params.templateId);
    res.json({ template });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Verwijdert een sjabloon. Weigert bewust als het sjabloon nog Actief is —
// eerst op Concept/Gearchiveerd zetten, dan pas verwijderen. Dit voorkomt
// dat per ongeluk het sjabloon onder bestaande of toekomstige pagina's
// wordt weggehaald (zie besluiten.md, 03-09-2026: precies dit ging al
// bijna mis toen een Actief sjabloon per ongeluk op Concept kwam te staan).
router.delete('/templates/:templateId', requireLpInternal, async (req, res) => {
  try {
    const template = await templates.getTemplate(req.params.templateId);
    if (template.status === 'Actief') {
      return res.status(400).json({
        error: 'Dit sjabloon staat op Actief en kan niet verwijderd worden. Zet de status eerst op Concept of Gearchiveerd.'
      });
    }
    await templates.deleteTemplate(req.params.templateId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// AI-gestuurde sjabloongeneratie (bouwvolgorde-stap 3, koerswijziging naar
// vrije templates). Levert alleen een voorstel terug (blueprint +
// placeholder-voorbeeldSlotData) — slaat niets op. Dylan bekijkt/finetunet
// het voorstel en slaat het pas op via de bestaande POST /templates
// hierboven (die de structuur-eisen alsnog afdwingt). Zie src/lp/ai.js.
router.post('/templates/generate', requireLpInternal, async (req, res) => {
  try {
    const { klant, naam, referentieUrl, paginatype, verplichteOnderdelen, visueleRichting, conversiedoel, overigeWensen } = req.body || {};
    if (!klant || !naam) {
      return res.status(400).json({ error: 'klant en naam zijn verplicht om een voorstel te genereren.' });
    }
    const proposal = await ai.generateTemplateProposal({
      klant, naam, referentieUrl, paginatype, verplichteOnderdelen, visueleRichting, conversiedoel, overigeWensen
    });
    res.json(proposal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Finetune-ronde op een al gegenereerd (of handmatig aangepast) voorstel —
// zie src/lp/ai.js, refineTemplateProposal.
router.post('/templates/refine', requireLpInternal, async (req, res) => {
  try {
    const { klant, naam, huidigBlueprint, huidigeVoorbeeldSlotData, feedback } = req.body || {};
    if (!klant || !naam) {
      return res.status(400).json({ error: 'klant en naam zijn verplicht.' });
    }
    const proposal = await ai.refineTemplateProposal({ klant, naam, huidigBlueprint, huidigeVoorbeeldSlotData, feedback });
    res.json(proposal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Rendert een voorstel/sjabloon met de echte klant-branding — voor het live
// voorbeeld in het Sjablonen-scherm. Raakt geen Notion/WordPress aan.
// Ondersteunt beide formaten: geef "blocks" mee voor het oude blokken-pad,
// of "blueprint" (met templateFormat 'slots') + "slotData" voor het nieuwe
// slot-pad.
router.post('/templates/preview', requireLpInternal, async (req, res) => {
  try {
    const { klant, blocks, blueprint, slotData } = req.body || {};
    if (!klant) return res.status(400).json({ error: 'klant is verplicht.' });

    if (blueprint && blueprint.templateFormat === 'slots') {
      const html = renderPageHtml({ clientId: klant, slug: 'sjabloon-voorbeeld', template: blueprint, slotData: slotData || {} });
      return res.json({ html: wrapPreviewDoc(html) });
    }

    const list = Array.isArray(blocks) ? blocks : [];
    if (!list.length) {
      return res.json({ html: '<p style="font-family:sans-serif;padding:2rem;color:#666;">Nog geen voorbeeldblokken.</p>' });
    }
    const html = renderPageHtml({ clientId: klant, slug: 'sjabloon-voorbeeld', blocks: list });
    res.json({ html: wrapPreviewDoc(html) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function wrapPreviewDoc(html) {
  // De hover-stijl hieronder maakt zichtbaar welke afbeeldingen klikbaar zijn (alleen degene met
  // een data-lp-slot-attribuut, zie tagImageSlotsForPreview) — volledig onschadelijk als een
  // pagina geen enkele getagde afbeelding heeft.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>[data-lp-slot]{cursor:pointer;transition:outline .15s ease;}[data-lp-slot]:hover{outline:3px solid #2f6fed;outline-offset:-3px;}</style></head><body>${html}</body></html>`;
}

// Bouwt de juiste render-invoer op basis van het sjabloonformaat — gebruikt
// door /pages/:pageId/preview en /pages/:pageId/publish hieronder.
function buildRenderPage({ blueprint, content, clientId, slug }) {
  if (blueprint.templateFormat === 'slots') {
    return { clientId, slug, template: blueprint, slotData: (content && content.slotData) || {} };
  }
  return { clientId, slug, blocks: (content && content.blocks) || [] };
}

function contentIsEmpty(blueprint, content) {
  if (!content) return true;
  if (blueprint.templateFormat === 'slots') {
    return !content.slotData || !Object.keys(content.slotData).length;
  }
  return !Array.isArray(content.blocks) || !content.blocks.length;
}

// Pagina's (in Notion, database "Landingspagina's").
router.get('/pages', requireLpInternal, async (req, res) => {
  try {
    const pages = await lpNotion.listPages({ klant: req.query.klant, status: req.query.status });
    res.json({ pages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pages', requireLpInternal, async (req, res) => {
  try {
    const { klant, blueprint, titel, slug, invoer } = req.body || {};
    if (!klant || !blueprint || !titel) {
      return res.status(400).json({ error: 'klant, blueprint en titel zijn verplicht.' });
    }
    // Valideer dat klant/blueprint bestaan voordat we een Notion-pagina aanmaken.
    await templates.getActiveTemplateByBlueprintId(klant, blueprint);
    const page = await lpNotion.createPage({ klant, blueprint, titel, slug, invoer });
    res.json({ page });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/pages/:pageId', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    res.json({ page });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.put('/pages/:pageId/invoer', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.updateSection(req.params.pageId, 'invoer', req.body?.invoer ?? null);
    res.json({ page });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/pages/:pageId/feitensheet', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.updateSection(req.params.pageId, 'feitensheet', req.body?.feitensheet ?? null);
    await lpNotion.setStatus(req.params.pageId, 'Content klaar');
    res.json({ page });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/pages/:pageId/content', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.updateSection(req.params.pageId, 'content', req.body?.content ?? null);
    res.json({ page });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/pages/:pageId/status', requireLpInternal, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status is verplicht.' });
    await lpNotion.setStatus(req.params.pageId, status);
    const page = await lpNotion.getPage(req.params.pageId);
    res.json({ page });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// AI genereert een content-voorstel voor deze pagina (bouwvolgorde-stap 4,
// alleen bruikbaar voor sjablonen in het nieuwe slot-formaat). Slaat zelf
// niets op — Dylan bekijkt/past aan en slaat pas op via de bestaande
// PUT /pages/:pageId/content hierboven. Kiest zelf relevante zusterpagina's
// voor de linksItems-slot uit de overige pagina's van deze klant. Kiest in
// dezelfde stap ook automatisch een passende foto uit de mediabibliotheek van
// de klant voor elke ImageSrc-slot (geen aparte knop meer, zie besluiten.md:
// "zo slim en simpel mogelijk") — als dat onderdeel om wat voor reden dan ook
// mislukt (bv. een WordPress- of OpenAI-fout), gaat de rest van de content
// gewoon door en komt er een korte waarschuwing mee terug in plaats van dat
// de hele generatie faalt.
router.post('/pages/:pageId/generate-content', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    if (blueprint.templateFormat !== 'slots') {
      return res.status(400).json({ error: 'AI-contentgeneratie is alleen beschikbaar voor sjablonen in het nieuwe (slot-gebaseerde) formaat.' });
    }
    const { watGaatDezePaginaOver, ctaOverride } = req.body || {};
    const invoer = page.invoer || {};
    const client = getLpClient(page.klant);
    const feitensheet = page.feitensheet || { gebruikt: [], extra: [] };
    const feitenById = new Map((client.feiten || []).map((f) => [f.id, f]));
    const gebruikteFeiten = (feitensheet.gebruikt || []).map((id) => feitenById.get(id)).filter(Boolean);
    const feiten = [...gebruikteFeiten, ...(feitensheet.extra || [])];

    // Linkkandidaten voor de linksItems-slot en voor inline links middenin de tekst: een mix van
    // andere LP Fabriek-pagina's van dezelfde klant (zusterpagina: true) en echte, bestaande
    // pagina's op de live website van de klant (zusterpagina: false) — beide tellen mee, Dylan
    // wilde niet beperkt blijven tot alleen onderling linkende landingspagina's. Het ophalen van de
    // site-pagina's mag nooit de hele contentgeneratie blokkeren als het misgaat (bv. WP-fout).
    const allePaginas = await lpNotion.listPages({ klant: page.klant });
    const zusterKandidaten = allePaginas
      .filter((p) => p.id !== page.id && p.titel && p.wpUrl)
      .map((p) => ({ label: p.titel, url: p.wpUrl, omschrijving: '(eigen landingspagina van deze klant)', zusterpagina: true }));

    let siteKandidaten = [];
    try {
      const sitePaginas = await listSitePages({ profile: client.profile });
      siteKandidaten = sitePaginas
        .filter((p) => p.url)
        .map((p) => ({ label: p.titel || p.url, url: p.url, omschrijving: p.omschrijving || '', zusterpagina: false }));
    } catch (siteErr) {
      // Stil doorgaan: geen site-pagina's als kandidaat is niet erger dan de oude situatie
      // (alleen zusterpagina's), en mag de generatie niet blokkeren.
    }

    const linkKandidaten = [...zusterKandidaten, ...siteKandidaten];

    const result = await ai.generatePageContent({
      klant: page.klant,
      template: blueprint,
      invoer,
      feiten,
      watGaatDezePaginaOver,
      ctaOverride,
      linkKandidaten
    });

    let imageWarning = null;
    try {
      const { items: kandidaten } = await searchMedia({ profile: client.profile, perPage: 100 });
      const { picks } = await ai.pickImagesForPage({
        template: blueprint,
        invoer,
        feiten,
        watGaatDezePaginaOver,
        kandidaten
      });
      for (const [slotKey, pick] of Object.entries(picks || {})) {
        if (pick && pick.url) {
          result.slotData[slotKey] = pick.url;
          const altKey = slotKey.replace(/ImageSrc$/, 'ImageAlt');
          if (pick.alt && altKey !== slotKey) result.slotData[altKey] = pick.alt;
        }
      }
    } catch (imgErr) {
      imageWarning = `Automatisch afbeeldingen kiezen is niet gelukt (${imgErr.message}) — vul afbeeldingen zelf in via het voorbeeldscherm.`;
    }

    res.json({ ...result, imageWarning });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Rendert de huidige content JSON tot HTML, puur voor het voorbeeldscherm
// (iframe) — raakt WordPress niet aan. forPreview: true zorgt dat afbeeldingen een
// data-lp-slot-attribuut krijgen zodat je erop kan klikken om te wisselen (zie
// slotEngine.js tagImageSlotsForPreview en public/lp.js).
router.get('/pages/:pageId/preview', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const content = page.content;
    if (contentIsEmpty(blueprint, content)) {
      return res.json({ html: '<p style="font-family:sans-serif;padding:2rem;color:#666;">Nog geen content JSON ingevuld.</p>' });
    }
    const html = renderPageHtml(buildRenderPage({ blueprint, content, clientId: page.klant, slug: page.slug }), { forPreview: true });
    res.json({ html: wrapPreviewDoc(html) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Controleert de content JSON tegen de blueprint-regels. Blokkeert niet zelf
// — /publish doet dat door dezelfde check voor de WordPress-push te draaien.
router.get('/pages/:pageId/validate', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const result = validatePage({ blueprint, contentJson: page.content || {} });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Zet de pagina als CONCEPT in WordPress (nooit live, zie src/lp/wordpress.js
// en het harde uitgangspunt "nooit automatisch publiceren" in besluiten.md).
// Weigert als de validator fouten geeft.
router.delete('/pages/:pageId', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    // Als de pagina ooit naar WordPress gepusht is (concept of live), eerst
    // daar verwijderen (naar de WordPress-prullenbak, zie wordpress.js). Lukt
    // dat niet, dan stoppen we hier en laten we de Notion-pagina met rust —
    // liever een duidelijke foutmelding dan een weespagina in WordPress.
    if (page.wpPaginaId) {
      const client = getLpClient(page.klant);
      await deleteWpPage({ profile: client.profile, wpPaginaId: page.wpPaginaId });
    }
    await lpNotion.deletePage(req.params.pageId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/pages/:pageId/publish', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const content = page.content;
    if (contentIsEmpty(blueprint, content)) {
      return res.status(400).json({ error: 'Geen content JSON om te publiceren.' });
    }
    const validation = validatePage({ blueprint, contentJson: content });
    if (!validation.ok) {
      return res.status(400).json({ error: 'Validatie faalt, nog niet gepubliceerd.', validation });
    }
    const client = getLpClient(page.klant);
    const html = renderPageHtml(buildRenderPage({ blueprint, content, clientId: page.klant, slug: page.slug }));
    const result = await pushDraft({
      profile: client.profile,
      wpPaginaId: page.wpPaginaId || undefined,
      titel: page.titel,
      html
    });
    await lpNotion.setWordpressInfo(req.params.pageId, { wpPaginaId: result.id, wpUrl: result.link });
    await lpNotion.setStatus(req.params.pageId, 'Ter review');
    const updated = await lpNotion.getPage(req.params.pageId);
    res.json({ page: updated, validation });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
