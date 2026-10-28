const express = require('express');
const { clients, getClient } = require('../config/clients');
const merkprofielService = require('../services/merkprofiel');
const intakeAnalyse = require('../services/intakeAnalyse');
const intakeAdvies = require('../services/intakeAdvies');
const settingsService = require('../services/settings');
const workflowGegevens = require('../services/workflowGegevens');
const notionService = require('../services/notion');
const intakeService = require('../services/intake');
const onboardingService = require('../services/onboarding');
const lpKlantgegevens = require('../lp/klantgegevens');
const aiZichtbaarheidService = require('../services/aiZichtbaarheid');
const cockpitService = require('../services/cockpit');
const aiFaq = require('../services/aiFaq');
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

// Cockpit: per klant een kleur en de signalen die afwijken. ?ververs=1 haalt alles opnieuw op (anders 10 minuten cache).
router.get('/cockpit', requireAdmin, async (req, res) => {
  try {
    res.json(await cockpitService.getCockpit({ ververs: Boolean(req.query.ververs) }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wekelijkse samenvatting voor Telegram (workflow "BA - Systeem - Cockpit Weekoverzicht" in n8n).
// Geen admin sessie: n8n stuurt een API sleutel van de eigen n8n mee (header X-N8N-API-KEY). Die is geldig als hij gelijk is
// aan N8N_API_KEY van het portaal, of als n8n zelf de sleutel accepteert. Zo hoeven de twee sleutels niet gelijk te zijn.
const geldigeSleutels = new Map(); // sha256 van de sleutel -> geldig tot
async function n8nSleutelGeldig(sleutel) {
  const crypto = require('crypto');
  if (!sleutel || sleutel.length < 20) return false;
  const eigen = String(process.env.N8N_API_KEY || '');
  if (eigen && sleutel.length === eigen.length && crypto.timingSafeEqual(Buffer.from(sleutel), Buffer.from(eigen))) return true;
  const vingerafdruk = crypto.createHash('sha256').update(sleutel).digest('hex');
  if ((geldigeSleutels.get(vingerafdruk) || 0) > Date.now()) return true;
  const basis = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
  try {
    const res = await fetch(`${basis}/api/v1/workflows?limit=1`, { headers: { 'X-N8N-API-KEY': sleutel }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return false;
    geldigeSleutels.set(vingerafdruk, Date.now() + 60 * 60 * 1000);
    return true;
  } catch (err) {
    return false;
  }
}

router.get('/cockpit/samenvatting', async (req, res) => {
  if (!(await n8nSleutelGeldig(String(req.get('x-n8n-api-key') || '')))) return res.status(401).json({ error: 'Geen toegang.' });
  try {
    const data = await cockpitService.getCockpit({ ververs: true });
    const basis = process.env.PORTAAL_URL || 'https://portaal.advertisr.nl';
    res.json({ tekst: cockpitService.samenvattingTekst(data, basis), aandacht: data.klanten.filter((k) => k.kleur === 'rood' || k.kleur === 'oranje').length });
  } catch (err) {
    res.status(500).json({ error: err.message, tekst: `Cockpit weekoverzicht kon niet worden gemaakt: ${err.message}` });
  }
});

// Oordeel over een blog uit de wekelijkse steekproef (goed of niet goed met opmerking).
router.post('/cockpit/steekproef', requireAdmin, async (req, res) => {
  try {
    res.json(await cockpitService.bewaarSteekproef(req.body || {}));
  } catch (err) {
    res.status(/moet|ontbreekt|Zet er/.test(err.message) ? 400 : 500).json({ error: err.message });
  }
});

// Bekijk als klant: zet de klant in dezelfde sessie, zodat het klantportaal opent zonder klantwachtwoord.
// De admin sessie blijft staan. Werkt ook voor een gepauzeerde klant.
router.post('/bekijk-als/:clientId', requireAdmin, (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    if (!config) return res.status(404).json({ error: 'Onbekende klant.' });
    req.session.clientId = config.id;
    res.json({ ok: true, url: '/' + encodeURIComponent(config.id) });
  } catch (err) {
    res.status(404).json({ error: 'Onbekende klant.' });
  }
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

// Gegevens uit de Clients tabel in n8n (reviewmail, contactnaam, WordPress, enzovoort).
router.get('/klantgegevens/:clientId', requireAdmin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    if (!config) return res.status(404).json({ error: 'Onbekende klant.' });
    const map = await settingsService.getSettingsMap();
    const inst = map.get(req.params.clientId);
    const data = await workflowGegevens.leesGegevens({
      clientId: req.params.clientId,
      naam: config.naam,
      portaalStatus: inst ? inst.klantstatus : '',
      portaalStatusIngesteld: inst ? inst.klantstatusIngesteld : false
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/klantgegevens/:clientId', requireAdmin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    if (!config) return res.status(404).json({ error: 'Onbekende klant.' });
    const { field, value } = req.body || {};
    await workflowGegevens.bewaarVeld({ clientId: req.params.clientId, naam: config.naam, veld: field, waarde: value });
    res.json({ ok: true });
  } catch (err) {
    const fout = /moet|mag |geen geldig|te lang|kan niet via|beginnen met/.test(err.message);
    res.status(fout ? 400 : 500).json({ error: err.message });
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

// FAQ voorstellen uit AI vragen (workflow "BA - AI FAQ Voorstel"). Alleen Dylan keurt goed of af.
// n8n vraagt welke pagina's Pagr. pagina's zijn (die krijgen hun FAQ via Pagr., niet rechtstreeks in WordPress).
router.post('/faq/pagr-paginas', async (req, res) => {
  if (!(await n8nSleutelGeldig(String(req.get('x-n8n-api-key') || '')))) return res.status(401).json({ error: 'Geen toegang.' });
  try {
    const lpRoutes = require('./lp');
    res.json({ pagr: await lpRoutes.pagrUrls({ klant: (req.body || {}).klant, urls: (req.body || {}).urls }) });
  } catch (err) {
    res.status(500).json({ error: err.message, pagr: [] });
  }
});

router.get('/faq', requireAdmin, async (req, res) => {
  try {
    res.json(await aiFaq.lijstVoorstellen());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/faq/:id/akkoord', requireAdmin, async (req, res) => {
  try {
    const { vraag, antwoord } = req.body || {};
    // lp.js wordt pas hier geladen, zodat de admin routes ook zonder de LP omgeving te testen zijn.
    const lpRoutes = require('./lp');
    res.json(await aiFaq.keurGoed({ id: req.params.id, vraag, antwoord, voegToe: lpRoutes.voegFaqToe }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/faq/:id/afwijzen', requireAdmin, async (req, res) => {
  try {
    res.json(await aiFaq.wijsAf({ id: req.params.id, reden: (req.body || {}).reden }));
  } catch (err) {
    res.status(400).json({ error: err.message });
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
