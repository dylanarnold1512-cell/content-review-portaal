const express = require('express');
const { getClient } = require('../config/clients');
const notionService = require('../services/notion');
const settingsService = require('../services/settings');
const kennisdocumentService = require('../services/kennisdocument');
const merkprofielService = require('../services/merkprofiel');
const prestatiesService = require('../services/prestaties');
const rapportenService = require('../services/rapporten');
const aiZichtbaarheidService = require('../services/aiZichtbaarheid');
const beeldbankService = require('../services/beeldbank');
const documentTekst = require('../services/documentTekst');
const lpNotion = require('../lp/notion');
const lpTemplates = require('../lp/templates');
const { maakKlantLijst, telKerncijfers } = require('../lp/klantPaginas');
const lpMeting = require('../lp/meting');
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

router.post('/login', async (req, res) => {
  const { clientId, password } = req.body || {};
  try {
    if (!checkPassword(clientId, password)) {
      return res.status(401).json({ error: 'Onjuist wachtwoord.' });
    }
    const status = (await settingsService.getClientSettings(clientId, getClient(clientId))).klantstatus;
    if (status !== 'actief') {
      return res.status(403).json({ error: settingsService.klantstatusMelding(status), code: 'KLANT_INACTIEF' });
    }
    req.session.clientId = clientId;
    // Voor de cockpit: wanneer logde de klant voor het laatst in. Mag het inloggen nooit tegenhouden.
    settingsService.registreerLogin(clientId).catch((err) => console.error('Laatste login niet bewaard:', err.message));
    res.json({ ok: true, clientId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  // Kijkt Dylan mee als klant, dan sluit uitloggen alleen het klantportaal en blijft de admin sessie staan.
  if (req.session && req.session.isAdmin) req.session.clientId = null;
  else req.session = null;
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  const clientId = req.session?.clientId || null;
  const alsBeheerder = Boolean(req.session?.isAdmin && clientId);
  if (alsBeheerder) return res.json({ clientId, alsBeheerder });
  if (clientId) {
    try {
      const status = (await settingsService.getClientSettings(clientId, getClient(clientId))).klantstatus;
      if (status !== 'actief') return res.json({ clientId: null });
    } catch (err) {
      // Bij een fout blijft de klant actief.
    }
    // De sessie blijft 30 dagen staan, dus ook een bezoek met een open sessie telt als laatste login.
    settingsService.registreerLogin(clientId).catch((err) => console.error('Laatste login niet bewaard:', err.message));
  }
  res.json({ clientId });
});

// Welke producten de klant heeft (Blogr., Pagr. of Beide), voor het menu van het portaal.
router.get('/:clientId/producten', requireLogin, async (req, res) => {
  try {
    const settings = await settingsService.getClientSettings(req.params.clientId, getClient(req.params.clientId));
    res.json({ producten: settings.producten, blogr: settings.blogr, pagr: settings.pagr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Landingspagina's van de klant (Pagr.). Geen goedkeuring: de klant ziet wat er is, de stand en het plan erachter.
async function pagrToegang(req, res) {
  const settings = await settingsService.getClientSettings(req.params.clientId, getClient(req.params.clientId));
  if (!settings.pagr) {
    res.status(404).json({ error: 'Landingspagina\'s zijn niet ingeschakeld voor deze klant.' });
    return false;
  }
  return true;
}

router.get('/:clientId/paginas', requireLogin, async (req, res) => {
  try {
    if (!(await pagrToegang(req, res))) return;
    const paginas = await lpNotion.listPages({ klant: req.params.clientId });
    // De reden van een geplande of live pagina staat in de invoer. Alleen daarvoor halen we de pagina op, maximaal 25, vijf tegelijk.
    const details = {};
    const metReden = paginas.filter((x) => x.status === 'Idee' || x.status === 'Gepubliceerd').slice(0, 25);
    for (let i = 0; i < metReden.length; i += 5) {
      await Promise.all(metReden.slice(i, i + 5).map(async (p) => {
        try { details[p.id] = (await lpNotion.getPage(p.id)).invoer || {}; } catch (e) { /* reden blijft leeg */ }
      }));
    }
    const basis = maakKlantLijst(paginas, details);
    const config = getClient(req.params.clientId);
    // Meting alleen tonen als de schakelaar Paginameting voor deze klant aan staat.
    const instellingen = await settingsService.getClientSettings(req.params.clientId, config);
    const leeg = lpMeting.leegMeting();
    const [google, aiMeting, website] = instellingen.paginameting
      ? await Promise.all([lpMeting.haalGoogle(req.params.clientId), lpMeting.haalAi(config.naam), lpMeting.haalWebsite(config.naam)])
      : [leeg.google, leeg.ai, leeg.website];
    const paginasLijst = lpMeting.verrijkMetMeting(basis, google, aiMeting, website);
    res.json({
      paginas: paginasLijst,
      kerncijfers: { ...telKerncijfers(paginasLijst), aiGenoemd: aiMeting.totaal ? aiMeting.totaal.genoemd : null, aiVragen: aiMeting.totaal ? aiMeting.totaal.vragen : null },
      meting: { google: google.beschikbaar, ai: aiMeting.beschikbaar, website: Boolean(website.beschikbaar && website.metConversies), waarde: Boolean(website.beschikbaar && Object.keys(website.cpc || {}).length) },
      perMaand: typeof instellingen.paginasPerMaand === 'number' ? instellingen.paginasPerMaand : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:clientId/paginas/idee', requireLogin, async (req, res) => {
  try {
    if (!(await pagrToegang(req, res))) return;
    const titel = (req.body?.titel || '').trim();
    if (!titel) return res.status(400).json({ error: 'Vul een onderwerp in.' });
    const actief = await lpTemplates.listTemplates({ klant: req.params.clientId, status: 'Actief' });
    if (!actief.length) return res.status(400).json({ error: 'Idee aandragen kan nog niet. Er is nog geen sjabloon klaar.' });
    const toelichting = (req.body?.toelichting || '').trim().slice(0, 1000);
    const page = await lpNotion.createPage({
      klant: req.params.clientId,
      blueprint: actief[0].blueprintId,
      titel: titel.slice(0, 150),
      invoer: { onderwerp: titel, plan: { status: 'idee van klant', toelichting } }
    });
    await lpNotion.setStatus(page.id, 'Idee');
    res.json({ ok: true, id: page.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    const data = await prestatiesService.getPrestaties(config.naam, req.query.periode);
    if (!data) return res.status(404).json({ error: 'Er is nog geen prestatiedata.' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Maandrapporten (vaste snapshots). Alleen voor klanten met Prestaties aan.
router.get('/:clientId/rapporten', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.performanceEnabled) return res.json({ rapporten: [] });
    res.json({ rapporten: await rapportenService.listRapporten(config.naam) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:clientId/rapporten/:maand', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.performanceEnabled) return res.status(404).json({ error: 'Rapportages staan nog niet aan voor deze klant.' });
    const rapport = await rapportenService.getRapport(config.naam, req.params.maand);
    if (!rapport) return res.status(404).json({ error: 'Dit rapport bestaat niet.' });
    res.json(rapport);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:clientId/rapporten/:maand/pdf', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.performanceEnabled) return res.status(404).json({ error: 'Rapportages staan nog niet aan voor deze klant.' });
    const rapport = await rapportenService.getRapport(config.naam, req.params.maand);
    if (!rapport) return res.status(404).json({ error: 'Dit rapport bestaat niet.' });
    let ai = null;
    if (settings.aiZichtbaarheid) {
      try { ai = { beschikbaar: true, ...(await aiZichtbaarheidService.getAiZichtbaarheid(config.naam, { clusterSoort: config.aiClusterSoort })) }; } catch (err) { ai = null; }
      if (ai) {
        try { ai.vragenMaand = (await aiZichtbaarheidService.getAiVragenMaand(config.naam, rapport.maand)).vragen; } catch (err) { ai.vragenMaand = null; }
      }
    }
    const pdf = await require('../services/rapportPdf').bouwPdf({ rapport, klantNaam: config.naam, ai });
    const bestand = `Maandrapport-${String(config.naam).replace(/[^A-Za-z0-9]+/g, '-')}-${rapport.maand}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${bestand}"`);
    res.send(pdf);
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

// Beeldbank: afbeeldingen aanleveren. De browser verkleint, de n8n workflow Beeldbank Verwerk bepaalt map,
// naam en alt tekst en zet de afbeelding in de Drive beeldmap van de klant (zie src/services/beeldbank.js).
router.get('/:clientId/beeldbank', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    if (!beeldbankService.beeldbankAan(config)) return res.json({ beschikbaar: false });
    let afbeeldingen = [];
    try { afbeeldingen = await beeldbankService.lijstAfbeeldingen(config.naam); } catch (err) { console.error('Beeldbank lijst mislukt:', err.message); }
    res.json({ beschikbaar: true, afbeeldingen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:clientId/beeldbank/upload', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    if (!beeldbankService.beeldbankAan(config)) return res.status(404).json({ error: 'De beeldbank staat niet aan voor deze klant.' });
    const antwoord = await beeldbankService.stuurAfbeelding(config.naam, req.body || {});
    res.json(antwoord);
  } catch (err) {
    res.status(500).json({ status: 'fout', melding: err.message });
  }
});

router.post('/:clientId/beeldbank/verwijder', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    if (!beeldbankService.beeldbankAan(config)) return res.status(404).json({ error: 'De beeldbank staat niet aan voor deze klant.' });
    const antwoord = await beeldbankService.verwijderAfbeelding(config.naam, (req.body || {}).driveFileId);
    res.json(antwoord);
  } catch (err) {
    res.status(500).json({ status: 'fout', melding: err.message });
  }
});

// Haalt regels weg waarvan het bestand al uit Drive is verdwenen. Het tabblad roept dit na het laden van de lijst aan.
router.post('/:clientId/beeldbank/opschonen', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    if (!beeldbankService.beeldbankAan(config)) return res.status(404).json({ error: 'De beeldbank staat niet aan voor deze klant.' });
    res.json(await beeldbankService.ruimOp(config.naam));
  } catch (err) {
    res.status(500).json({ status: 'fout', melding: err.message });
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

// AI zichtbaarheid: hoe vaak ChatGPT en Gemini het merk van de klant noemen.
// Alleen het eigen merk, nooit concurrenten of bronnen van anderen (die staan
// alleen in /admin). Uit tot de schakelaar in /admin aan staat.
router.get('/:clientId/ai-zichtbaarheid', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.aiZichtbaarheid) return res.json({ beschikbaar: false });
    const result = await aiZichtbaarheidService.getAiZichtbaarheid(config.naam, { clusterSoort: config.aiClusterSoort });
    // Conversies via AI assistenten (bezoeken, aanvragen, boekingen). Een extra: ontbreekt de meting, dan blijft de pagina werken.
    let conversie = null;
    try {
      const pr = await prestatiesService.getPrestaties(config.naam, '28d');
      const t = pr && pr.totalen;
      conversie = t ? { ai: t.ai || null, eerderGelezen: t.eerderGelezen || null, woorden: prestatiesService.conversieWoorden(config.naam) } : null;
    } catch (err) { conversie = null; }
    res.json({ beschikbaar: true, klantNaam: config.naam, ...result, conversie });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:clientId/ai-zichtbaarheid/vragen', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.aiZichtbaarheid) return res.json({ beschikbaar: false });
    res.json({ beschikbaar: true, clusterSoort: config.aiClusterSoort === 'markt' ? 'markt' : 'onderwerp', ...(await aiZichtbaarheidService.getAiVragen(config.naam)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Het antwoord van ChatGPT en Gemini op een vraag in de laatste gemeten week, zodat
// de klant ziet in welk antwoord het merk stond. Daarin staan ook andere bedrijven.
router.get('/:clientId/ai-zichtbaarheid/vragen/:promptId', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.aiZichtbaarheid) return res.json({ beschikbaar: false });
    const data = await aiZichtbaarheidService.getAiAntwoord(config.naam, req.params.promptId);
    if (data.status === 'onbekend') return res.status(404).json({ error: 'Deze vraag bestaat niet.' });
    res.json({ beschikbaar: true, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Voor het maandrapport: bij welke vragen noemde AI het merk in die maand.
router.get('/:clientId/ai-zichtbaarheid/maand/:maand', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.aiZichtbaarheid) return res.json({ beschikbaar: false });
    if (!/^\d{4}-\d{2}$/.test(req.params.maand)) return res.status(400).json({ error: 'Geef een maand op als 2026-10.' });
    res.json({ beschikbaar: true, ...(await aiZichtbaarheidService.getAiVragenMaand(config.naam, req.params.maand)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// Termen die we in blogs niet gebruiken: de klant (of Advertisr) voegt er een toe,
// haalt er een weg of zet een weggehaalde automatische term terug. Schrijft naar
// verboden_handmatig en verboden_uitgezonderd in de Clients rij.
router.post('/:clientId/merkprofiel/verboden', requireLogin, async (req, res) => {
  try {
    const config = getClient(req.params.clientId);
    const settings = await settingsService.getClientSettings(req.params.clientId, config);
    if (!settings.merkprofiel) return res.status(404).json({ error: 'Niet beschikbaar.' });
    const { actie, term } = req.body || {};
    const result = await merkprofielService.wijzigVerbodenTerm(config.naam, { actie, term });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
