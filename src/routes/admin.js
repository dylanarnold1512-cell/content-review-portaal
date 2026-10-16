const express = require('express');
const { clients, getClient } = require('../config/clients');
const merkprofielService = require('../services/merkprofiel');
const intakeAnalyse = require('../services/intakeAnalyse');
const intakeAdvies = require('../services/intakeAdvies');
const settingsService = require('../services/settings');
const notionService = require('../services/notion');
const intakeService = require('../services/intake');
const onboardingService = require('../services/onboarding');
const lpKlantgegevens = require('../lp/klantgegevens');
const aiZichtbaarheidService = require('../services/aiZichtbaarheid');
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
    if (field === 'klantstatus') {
      if (!settingsService.KLANTSTATUS_WAARDEN.includes(value)) {
        return res.status(400).json({ error: `Onbekende klantstatus: ${value}` });
      }
      await settingsService.updateClientSetting(req.params.clientId, field, value);
      return res.json({ ok: true, melding: '' });
    }
    if (field === 'searchConsoleSite') {
      await settingsService.updateClientSetting(req.params.clientId, field, String(value || ''));
      return res.json({ ok: true, melding: '' });
    }
    if (field === 'paginasPerMaand') {
      await settingsService.updateClientSetting(req.params.clientId, field, value);
      return res.json({ ok: true, melding: '' });
    }
    if (field === 'producten') {
      if (!settingsService.PRODUCT_WAARDEN.includes(value)) {
        return res.status(400).json({ error: `Onbekend product: ${value}` });
      }
      await settingsService.updateClientSetting(req.params.clientId, field, value);
      // Staat de klant in onboarding en komt Pagr. erbij, dan komen de Pagr. stappen er vanzelf bij.
      let melding = '';
      if (value === 'Pagr.' || value === 'Beide') {
        try {
          const o = await onboardingService.voorKlant(req.params.clientId);
          if (o.rijen.length) {
            const r = await onboardingService.start({ klant: o.klant, clientId: req.params.clientId, producten: value });
            if (r.aangemaakt) melding = `De ${r.aangemaakt} Pagr. stappen zijn aan de onboarding toegevoegd.`;
          }
        } catch (err) { melding = `Het product is gezet, maar de Pagr. stappen konden niet worden toegevoegd: ${err.message}`; }
      }
      return res.json({ ok: true, melding });
    }
    if (!['reviewEnabled', 'performanceEnabled', 'ideaEnrichmentEnabled', 'merkprofiel', 'merkprofielNaarKennisdocument', 'aiZichtbaarheid', 'paginameting', 'internAutomatisering'].includes(field)) {
      return res.status(400).json({ error: `Onbekend instellingveld: ${field}` });
    }
    let melding = '';
    // Aanzetten van "Naar blogs" schrijft meteen het Kennisdocument opnieuw uit
    // het profiel (met een back-up van het oude). Mislukt dat, dan blijft de
    // schakelaar uit.
    if (field === 'merkprofielNaarKennisdocument' && value) {
      const config = getClient(req.params.clientId);
      const result = await merkprofielService.syncKennisdocument(config.naam);
      melding = result.backup
        ? 'Het Kennisdocument is vervangen door het merkprofiel. Het oude Kennisdocument is bewaard.'
        : 'Het Kennisdocument is bijgewerkt vanuit het merkprofiel.';
    }
    await settingsService.updateClientSetting(req.params.clientId, field, Boolean(value));
    res.json({ ok: true, melding });
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

// Intern overzicht van de AI meting: merken en bronnen die de AI noemt en wat de meting kostte.
router.get('/ai-zichtbaarheid/:clientId', requireAdmin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    res.json({ klantNaam: config.naam, ...(await aiZichtbaarheidService.getAiIntern(config.naam)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Intake nieuwe klant — opslag in de "Klant Intake"-database, basis voor de
// opzet (Notion-schema, n8n-workflows, portal-entry) die daarna gebouwd wordt.
router.get('/profiel/status', requireAdmin, async (req, res) => {
  try {
    const klant = String(req.query.klant || '').trim();
    if (!klant) return res.status(400).json({ error: 'Geef een klantnaam op.' });
    const stand = await merkprofielService.getProfielStatus(klant);
    // Stap 4 van de onboarding volgt het merkprofiel. Lukt dat niet, dan blijft het merkprofiel gewoon werken.
    await onboardingService.synchroniseMerkprofiel(klant, stand.status).catch(() => {});
    res.json(stand);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/profiel/start', requireAdmin, async (req, res) => {
  try {
    const { klant, website, force } = req.body || {};
    await merkprofielService.startProfiel(klant, website, { force: Boolean(force) });
    await onboardingService.synchroniseMerkprofiel(klant, 'bezig').catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(err.code === 'BEVESTIGING_NODIG' ? 409 : 400).json({ error: err.message, code: err.code || '' });
  }
});

router.get('/intake', requireAdmin, async (req, res) => {
  try {
    const intakes = await intakeService.listIntakes();
    res.json({ intakes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vult het intakeformulier voor: haalt de homepage op en stelt naam, Client ID,
// omschrijving en WordPress voor (src/services/intakeAnalyse.js).
router.post('/intake/analyseer', requireAdmin, async (req, res) => {
  try {
    const result = await intakeAnalyse.analyseerWebsite((req.body || {}).website);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || 'De website kon niet worden geanalyseerd.' });
  }
});

// AI advies bij de intake: leest de website, zoekt zelf op internet en geeft voorstellen die je kunt overnemen.
router.post('/intake/advies', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const advies = await intakeAdvies.adviesVoorIntake({
      klant: b.klant, website: b.website, producten: b.producten, omschrijving: b.omschrijving, extra: b.extra,
      aiFn: intakeAdvies.callOpenAiOnderzoek
    });
    res.json({ advies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/intake', requireAdmin, async (req, res) => {
  try {
    const { klant } = req.body || {};
    if (!klant || !klant.trim()) {
      return res.status(400).json({ error: 'Klantnaam is verplicht.' });
    }
    const result = await intakeService.createIntake(req.body || {});
    // De onboarding wordt vanaf nu bijgehouden: stap 1 (websitescan en nieuwe klant) is klaar. Lukt dat niet, dan blijft de intake gewoon staan.
    let onboardingMelding = '';
    try {
      const clientId = String((req.body || {}).clientId || (req.body || {}).portaalSlug || '').trim();
      const producten = settingsService.normaliseerProducten((req.body || {}).producten);
      if (clientId) await onboardingService.start({ klant: klant.trim(), clientId, klaar: [1], producten });
    } catch (err) {
      onboardingMelding = `De intake is opgeslagen, maar de onboardingstappen konden niet worden aangemaakt: ${err.message}`;
    }
    // Gaat het om Pagr., dan staat de klant ook meteen in de LP Klantgegevens (Notion), zodat je daar alleen nog hoeft aan te vullen.
    let klantgegevensMelding = '';
    try {
      const b = req.body || {};
      const producten = settingsService.normaliseerProducten(b.producten);
      const clientId = String(b.clientId || b.portaalSlug || '').trim();
      if ((producten === 'Pagr.' || producten === 'Beide') && clientId) {
        const adres = { straat: String(b.lpStraat || ''), postcode: String(b.lpPostcode || ''), plaats: String(b.lpPlaats || ''), land: 'NL' };
        const werkgebied = String(b.lpWerkgebied || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
        await lpKlantgegevens.bewaar(clientId, { nieuw: true, feiten: [], profiel: { naam: klant.trim(), bedrijf: { naam: klant.trim(), url: String(b.website || ''), telefoon: String(b.lpTelefoon || ''), email: String(b.lpEmail || ''), adres, werkgebied }, toonNotitie: String(b.toneOfVoice || '') } });
        klantgegevensMelding = 'De klant staat ook in Pagr. Klantgegevens. Vul daar nog feiten en huisstijl aan.';
      }
    } catch (err) {
      if (!/bestaat al/i.test(err.message)) klantgegevensMelding = `De klant kon niet in Pagr. Klantgegevens worden gezet: ${err.message}`;
    }
    // Voor Pagr. en Beide zet de intake meteen het product en de pagina-instellingen in Portaal Instellingen, zodat het portaal van de klant direct klopt.
    let instellingenMelding = '';
    try {
      const b = req.body || {};
      const producten = settingsService.normaliseerProducten(b.producten);
      const clientId = String(b.clientId || b.portaalSlug || '').trim();
      if ((producten === 'Pagr.' || producten === 'Beide') && clientId) {
        const velden = { producten, paginasPerMaand: b.paginasPerMaand, paginameting: Boolean(b.paginameting), searchConsoleSite: b.searchConsoleSite };
        if (producten === 'Beide') Object.assign(velden, { reviewEnabled: b.reviewEnabled !== false, performanceEnabled: Boolean(b.performanceEnabled), ideaEnrichmentEnabled: Boolean(b.ideaEnrichmentEnabled) });
        await settingsService.zetNieuweKlant(clientId, klant.trim(), velden);
      }
    } catch (err) {
      instellingenMelding = `De instellingen (product en pagina's per maand) konden niet worden gezet: ${err.message}`;
    }
    res.json({ ok: true, id: result.id, onboardingMelding, klantgegevensMelding, instellingenMelding });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/intake/:pageId/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['Nieuw', 'In behandeling', 'Afgerond', 'Fout'].includes(status)) {
      return res.status(400).json({ error: `Onbekende status: ${status}` });
    }
    await intakeService.updateIntakeStatus(req.params.pageId, status);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/onboarding', requireAdmin, async (req, res) => {
  try {
    res.json({ klanten: await onboardingService.overzicht() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/onboarding/:clientId', requireAdmin, async (req, res) => {
  try {
    res.json(await onboardingService.voorKlant(req.params.clientId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/onboarding', requireAdmin, async (req, res) => {
  try {
    const { klant, clientId, klaar, producten } = req.body || {};
    const result = await onboardingService.start({ klant, clientId, klaar: Array.isArray(klaar) ? klaar : [], producten: settingsService.normaliseerProducten(producten) });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/onboarding/stap/:pageId', requireAdmin, async (req, res) => {
  try {
    const { status, uitkomst } = req.body || {};
    await onboardingService.zetStap(req.params.pageId, { status, uitkomst });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
