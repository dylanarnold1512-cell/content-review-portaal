const express = require('express');
const { clients } = require('../config/clients');
const settingsService = require('../services/settings');
const notionService = require('../services/notion');
const { checkAdminPassword, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  try {
    if (!checkAdminPassword(password)) {
      return res.status(401).json({ error: 'Onjuist wachtwoord.' });
    }
    req.session.isAdmin = true;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  if (req.session) req.session.isAdmin = false;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ isAdmin: Boolean(req.session && req.session.isAdmin) });
});

router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const overzicht = await settingsService.listAllSettings(clients);
    res.json({ clients: overzicht });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings/:clientId', requireAdmin, async (req, res) => {
  try {
    const { field, value } = req.body || {};
    if (!['reviewEnabled', 'performanceEnabled', 'ideaEnrichmentEnabled'].includes(field)) {
      return res.status(400).json({ error: `Onbekend instellingveld: ${field}` });
    }
    await settingsService.updateClientSetting(req.params.clientId, field, Boolean(value));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ideeën die de idee-verrijkingsworkflow al heeft aangevuld en die klaarstaan
// voor Dylans goedkeuring — los per klant, alleen relevant voor klanten met
// ideaEnrichmentEnabled aan.
router.get('/:clientId/idea-proposals', requireAdmin, async (req, res) => {
  try {
    const proposals = await notionService.listIdeaProposals(req.params.clientId);
    res.json({ proposals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:clientId/idea-proposals/:pageId/approve', requireAdmin, async (req, res) => {
  try {
    await notionService.decideIdeaProposal(req.params.clientId, req.params.pageId, 'approve');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:clientId/idea-proposals/:pageId/reject', requireAdmin, async (req, res) => {
  try {
    await notionService.decideIdeaProposal(req.params.clientId, req.params.pageId, 'reject');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
