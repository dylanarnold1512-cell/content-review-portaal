const express = require('express');
const { getClient, listClients } = require('../config/clients');
const notionService = require('../services/notion');
const { checkPassword, requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/clients', (req, res) => {
  res.json(listClients());
});

router.post('/login', (req, res) => {
  const { clientId, password } = req.body || {};
  try {
    if (!checkPassword(clientId, password)) {
      return res.status(401).json({ error: 'Onjuist wachtwoord.' });
    }
    req.session.clientId = clientId;
    res.json({ ok: true, clientId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ clientId: req.session?.clientId || null });
});

router.get('/:clientId/items', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const status = req.query.status || undefined;
    const items = await notionService.listItems(req.params.clientId, status);
    res.json({
      reviewEnabled: config.reviewEnabled,
      performanceEnabled: Boolean(config.performanceEnabled),
      statusValues: config.statusValues,
      items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:clientId/performance', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    if (!config.performanceEnabled) {
      return res.status(404).json({ error: 'Prestatiegegevens staan nog niet aan voor deze klant.' });
    }
    const log = await notionService.getPerformanceLog(req.params.clientId);
    res.json({ log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:clientId/items/:pageId', requireLogin, async (req, res) => {
  try {
    const item = await notionService.getItemDetail(req.params.clientId, req.params.pageId);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:clientId/items/:pageId/approve', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    if (!config.reviewEnabled) {
      return res.status(400).json({ error: 'Review staat uit voor deze klant.' });
    }
    await notionService.approveItem(req.params.clientId, req.params.pageId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:clientId/items/:pageId/reject', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    if (!config.reviewEnabled) {
      return res.status(400).json({ error: 'Review staat uit voor deze klant.' });
    }
    const feedback = (req.body?.feedback || '').trim();
    if (!feedback) {
      return res.status(400).json({ error: 'Feedback is verplicht bij afwijzen.' });
    }
    await notionService.rejectItem(req.params.clientId, req.params.pageId, feedback);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
