const express = require('express');
const { clients } = require('../config/clients');
const settingsService = require('../services/settings');
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
    if (!['reviewEnabled', 'performanceEnabled'].includes(field)) {
      return res.status(400).json({ error: `Onbekend instellingveld: ${field}` });
    }
    await settingsService.updateClientSetting(req.params.clientId, field, Boolean(value));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
