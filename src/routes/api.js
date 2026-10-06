const express = require('express');
const { getClient } = require('../config/clients');
const notionService = require('../services/notion');
const settingsService = require('../services/settings');
const kennisdocumentService = require('../services/kennisdocument');
const merkprofielService = require('../services/merkprofiel');
const prestatiesService = require('../services/prestaties');
const documentTekst = require('../services/documentTekst');
const { checkPassword, requireLogin } = require('../middleware/auth');

const router = express.Router();

// Publiek endpoint, maar geeft NOOIT de volledige klantenlijst terug — alleen
// de naam van de klant wiens slug expliciet is opgegeven. Zo kan een
// verkeerde of onbekende URL nooit de namen van andere klanten laten zien.
router.get('/client-info', (req, res) => {
  const slug = (req.query.slug || '').toString();
  let client;
  try {
    client = getClient(slug);
  } catch (err) {
    return res.status(404).json({ error: 'Onbekende klant.' });
  }
  res.json({ id: client.id, naam: client.naam });
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
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    const status = req.query.status || undefined;
    const items = await notionService.listItems(req.params.clientId, status);
    res.json({
      reviewEnabled: settings.reviewEnabled,
      performanceEnabled: settings.performanceEnabled,
      ideaEnrichmentEnabled: settings.ideaEnrichmentEnabled,
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
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.performanceEnabled) {
      return res.status(404).json({ error: 'Prestatiegegevens staan nog niet aan voor deze klant.' });
    }
    const log = await notionService.getPerformanceLog(req.params.clientId);
    const laatstBijgewerkt = log.length ? log[log.length - 1].datum : null;
    res.json({ log, laatstBijgewerkt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Nieuwe Prestaties-weergave (v2). Staat achter de vlag performanceV2 in
// clients.js, of tijdelijk aan via ?v2=1 om te testen. Geeft 404 zolang er
// geen data is, zodat het portaal dan de oude weergave blijft tonen.
router.get('/:clientId/performance-v2', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.performanceEnabled) {
      return res.status(404).json({ error: 'Prestatiegegevens staan nog niet aan voor deze klant.' });
    }
    if (!config.performanceV2 && req.query.v2 !== '1') {
      return res.status(404).json({ error: 'De nieuwe weergave staat nog niet aan.' });
    }
    const data = await prestatiesService.getPrestaties(config.naam);
    if (!data) return res.status(404).json({ error: 'Er is nog geen prestatiedata.' });
    res.json(data);
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
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.reviewEnabled) {
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
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.reviewEnabled) {
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

router.post('/:clientId/ideas', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.ideaEnrichmentEnabled) {
      return res.status(400).json({ error: 'Ideeën aandragen staat uit voor deze klant.' });
    }
    const titel = (req.body?.titel || '').trim();
    if (!titel) {
      return res.status(400).json({ error: 'Titel/onderwerp is verplicht.' });
    }
    const hoofdkeyword = (req.body?.hoofdkeyword || '').trim();
    const toelichting = (req.body?.toelichting || '').trim();
    const result = await notionService.createIdea(req.params.clientId, {
      titel,
      hoofdkeyword,
      toelichting
    });
    res.json({ ok: true, id: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kennisdocument: achtergrondinformatie die de AI spaarzaam gebruikt bij het
// schrijven van blogs (zie src/services/kennisdocument.js voor waar dit
// vandaan komt). Matcht op de klantnaam zoals die in clients.js staat, dus
// niet op de slug/clientId.
router.get('/:clientId/kennisdocument', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const result = await kennisdocumentService.getKennisdocument(config.naam);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:clientId/kennisdocument', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const tekst = (req.body?.tekst || '').toString();
    const bronRaw = (req.body?.bron || '').toString().trim().slice(0, 200);
    const bron = bronRaw || undefined;
    const result = await kennisdocumentService.saveKennisdocument(config.naam, tekst, bron);
    res.json({ ok: true, bijgewerkt: result.bijgewerkt, bron: bron || 'Portaal' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Zet een geüpload .docx/.pdf/.txt-bestand om naar platte tekst, zonder meteen
// op te slaan — de gebruiker ziet de tekst eerst in het tekstveld en bevestigt
// zelf met "Opslaan" (zelfde reden als bij de LP Fabriek media-upload: eerst
// controleren, dan pas persisteren).
router.post('/:clientId/kennisdocument/extract', requireLogin, async (req, res) => {
  try {
    getClient(req.params.clientId); // valideert dat de klant bestaat
    const { filename, contentType, dataBase64 } = req.body || {};
    if (!filename || !dataBase64) {
      return res.status(400).json({ error: 'Bestandsnaam en bestandsdata zijn verplicht.' });
    }
    const buffer = Buffer.from(dataBase64, 'base64');
    const tekst = await documentTekst.extraheerTekst({ filename, contentType, buffer });
    res.json({ tekst });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Merkprofiel: het klantprofiel als kaarten waarop de klant kan reageren (zie
// src/services/merkprofiel.js). Staat per klant uit tot de schakelaar
// in /admin (of clients.js als vangnet) merkprofiel aan staat. Reacties van de
// klant schrijven het Kennisdocument alleen opnieuw als ook "Merkprofiel naar
// Kennisdocument" aan staat.
router.get('/:clientId/merkprofiel', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.merkprofiel) return res.json({ beschikbaar: false });
    const result = await merkprofielService.getMerkprofiel(config.naam);
    res.json({ ...result, klantNaam: config.naam });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:clientId/merkprofiel/beoordeel', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.merkprofiel) return res.status(404).json({ error: 'Niet beschikbaar.' });
    const { regelId, status, opmerking, regelTekst } = req.body || {};
    const result = await merkprofielService.saveBeoordeling(config.naam, { regelId, status, opmerking, regelTekst });
    let kennisdocumentBijgewerkt = false;
    if (settings.merkprofielNaarKennisdocument) {
      try {
        await merkprofielService.syncKennisdocument(config.naam);
        kennisdocumentBijgewerkt = true;
      } catch (syncErr) {
        console.error('Merkprofiel naar Kennisdocument mislukt:', syncErr.message);
      }
    }
    res.json({ ok: true, datum: result.datum, kennisdocumentBijgewerkt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
