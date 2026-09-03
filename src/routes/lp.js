// LP Fabriek: interne zone /api/lp. Alleen bereikbaar met het aparte
// LP_PASSWORD (zie src/middleware/auth.js, requireLpInternal) — klanten
// kunnen hier nooit bij, zie besluiten.md "Portaal: een app, twee zones".

const express = require('express');
const { getLpClient, clients: lpClients } = require('../lp/clients');
const lpNotion = require('../lp/notion');
const templates = require('../lp/templates');
const { renderPageHtml } = require('../lp/render');
const { validatePage } = require('../lp/validator');
const { pushDraft } = require('../lp/wordpress');
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

// Rendert de huidige content JSON tot HTML, puur voor het voorbeeldscherm
// (iframe) — raakt WordPress niet aan.
router.get('/pages/:pageId/preview', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const content = page.content;
    if (!content || !Array.isArray(content.blocks) || !content.blocks.length) {
      return res.json({ html: '<p style="font-family:sans-serif;padding:2rem;color:#666;">Nog geen content JSON ingevuld.</p>' });
    }
    const html = renderPageHtml({ clientId: page.klant, slug: page.slug, blocks: content.blocks });
    res.json({ html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Controleert de content JSON tegen de blueprint-regels (variabelen/meta
// lengte/interne links/CTA/exact 1 H1). Blokkeert niet zelf — /publish doet
// dat door dezelfde check voor de WordPress-push te draaien.
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
router.post('/pages/:pageId/publish', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const content = page.content;
    if (!content || !Array.isArray(content.blocks) || !content.blocks.length) {
      return res.status(400).json({ error: 'Geen content JSON om te publiceren.' });
    }
    const validation = validatePage({ blueprint, contentJson: content });
    if (!validation.ok) {
      return res.status(400).json({ error: 'Validatie faalt, nog niet gepubliceerd.', validation });
    }
    const client = getLpClient(page.klant);
    const html = renderPageHtml({ clientId: page.klant, slug: page.slug, blocks: content.blocks });
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
