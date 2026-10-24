// LP Fabriek: interne zone /api/lp. Alleen bereikbaar met het aparte
// LP_PASSWORD (zie src/middleware/auth.js, requireLpInternal) — klanten
// kunnen hier nooit bij, zie besluiten.md "Portaal: een app, twee zones".

const express = require('express');
const { getLpClient, clients: lpClients } = require('../lp/clients');
const klantgegevens = require('../lp/klantgegevens');
const campagneKennis = require('../lp/campagneKennis');
// Het maandplan en de SEO/GEO functies kiezen nooit het campagnesjabloon (24-10-2026).
const zonderCampagne = (lijst) => (Array.isArray(lijst) ? lijst : []).filter((t) => t && t.blueprintId !== campagneKennis.CAMPAGNE_BLUEPRINT);
const { schoonScreenshots } = require('../lp/screenshots');
const { bouwSjabloonKopie, schoonFocus, trefwoordenUitOnderwerp } = require('../lp/sjabloonKopie');
const lpNotion = require('../lp/notion');
const templates = require('../lp/templates');
const clientIntake = require('../lp/clientIntake');
const { buildHuisstijlVoorstel } = require('../lp/huisstijl');
const { buildFeitenVoorstel } = require('../lp/siteAnalyse');
const ai = require('../lp/ai');
const { renderPageHtml } = require('../lp/render');
const { buildRenderPage, contentIsEmpty } = require('../lp/pageRender');
const { eigenSjabloonVan } = require('../lp/eigenSjabloon');
const { zorgVoorGalerijSlot } = require('../lp/galerij');
const { zorgVoorProjectItems, ruimOpProjectItems, projectLijsten } = require('../lp/projectFotos');
const { haalProjecten, kiesProjecten, vulProjectItems } = require('../lp/projecten');
const { beslisKlaar, autoLiveToegestaan, STATUS_KLAAR } = require('../lp/klaarVoorLive');
const planning = require('../lp/planning');
const { standVan } = require('../lp/standen');
const { beschrijfSecties } = require('../lp/sectieRefine');
const { berekenOverrides, zetVerborgen } = require('../lp/overrides');
const { gebruikteFeitIds } = require('../lp/feitenDefaults');
const { tekstControle, scrubPersoonsnamen } = require('../lp/tekstcontrole');
const { bouwKopie } = require('../lp/dupliceer');
const gelijk = require('../lp/gelijkenis');
const { verzamelTekst } = gelijk;
const share = require('../lp/share');
const { validatePage, validateTemplateStructure } = require('../lp/validator');
const { maakControle, inOrdePunten } = require('../lp/controle');
const { onderwerpFit } = require('../lp/onderwerpFit');
const { wachtOpJou } = require('../lp/wachtOpJou');
const { isBulkKandidaat } = require('../lp/bulkKandidaat');
const { bouwKlantRij, bouwTotalen } = require('../lp/pagrOverzicht');
const maandplan = require('../lp/maandplan');
const { pushDraft, deletePage: deleteWpPage, restorePage: herstelWpPage, searchMedia, uploadMedia, listSitePages, haalPaginaStatussen, siteNaam } = require('../lp/wordpress');
const { vindTekst, vervangTekst, vulPlaatshouders } = require('../lp/tekstVervangen');
const onderdeel = require('../lp/onderdeelOvernemen');

function plaatshouderWaarden(client, page) {
  const bedrijf = (client.profile && client.profile.bedrijf) || {};
  return { plaats: page && page.invoer && page.invoer.plaatsnaam, bedrijf: bedrijf.naam || (client.profile && client.profile.naam) };
}
const { haalSiteTeksten, formatSiteTekstenVoorPrompt } = require('../lp/siteTeksten');
const { bouwKlantverhaalVoorstel } = require('../lp/klantverhaal');
const { waarschuwingGefilterd } = require('../lp/bronFilter');
const verhaal = require('../lp/verhaal');
const leren = require('../lp/leren');
const plan = require('../lp/plan');
const { onderwerpTekst, metOnderwerp, maakWachtrij } = require('../lp/autoPagina');
const begeleiding = require('../lp/begeleiding');
const meting = require('../lp/meting');
const { maakUpdateVoorstellen } = require('../lp/bijhouden');
const { maakKlantLijst } = require('../lp/klantPaginas');
const settingsService = require('../services/settings');
const { haalZoekvragen, dienstenUitTekst, vragenUitContent, vindDubbeleVragen } = require('../lp/zoekvragen');
const { requireLpInternal } = require('../middleware/auth');

const router = express.Router();

router.get('/me', (req, res) => {
  res.json({ isLpInternal: Boolean(req.session && req.session.isAdmin) });
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
    // Een pagina met een eigen sjabloon (gebouwd met chat): ?pagina=<id> geeft het sjabloon van die pagina.
    if (req.query.pagina) {
      const page = await lpNotion.getPage(String(req.query.pagina));
      const eigen = page.klant === req.params.clientId ? eigenSjabloonVan(page) : null;
      if (eigen) return res.json({ blueprint: eigen });
    }
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

// Klantgegevens (profiel en feiten) in Notion, zie src/lp/klantgegevens.js.
router.get('/klantgegevens', requireLpInternal, (req, res) => {
  res.json({ klanten: klantgegevens.overzicht(), status: klantgegevens.status() });
});

router.post('/klantgegevens/ververs', requireLpInternal, async (req, res) => {
  const r = await klantgegevens.ververs();
  res.status(r.ok ? 200 : 502).json({ ...r, status: klantgegevens.status() });
});

// Voorstel voor de huisstijl op basis van de website van de klant (bestaande huisstijlmeting plus AI).
router.post('/klantgegevens/huisstijl-voorstel', requireLpInternal, async (req, res) => {
  try {
    const { url } = req.body || {};
    const voorstel = await buildHuisstijlVoorstel(url);
    res.json({
      huisstijl: klantgegevens.huisstijlUitVoorstel(voorstel.tokensVoorstel),
      samenvatting: voorstel.samenvatting || '',
      twijfels: voorstel.twijfels || []
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/klantgegevens/:clientId/klantverhaal-voorstel', requireLpInternal, async (req, res) => {
  try {
    const client = getLpClient(req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Onbekende klant.' });
    const bedrijf = client.profile.bedrijf || {};
    if (!bedrijf.url) return res.status(400).json({ error: 'Vul eerst de website van de klant in bij Bedrijf.' });
    const resultaat = await bouwKlantverhaalVoorstel({ url: bedrijf.url, bedrijfsnaam: bedrijf.naam || client.profile.naam, taal: client.profile.taal });
    res.json(resultaat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/klantgegevens/:clientId', requireLpInternal, (req, res) => {
  const k = klantgegevens.bewerkbaar(req.params.clientId);
  if (!k) return res.status(404).json({ error: 'Onbekende klant.' });
  res.json({ klant: k });
});

router.put('/klantgegevens/:clientId', requireLpInternal, async (req, res) => {
  try {
    const { profiel, feiten } = req.body || {};
    const klant = await klantgegevens.bewaar(req.params.clientId, { profiel, feiten });
    res.json({ klant });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/klantgegevens', requireLpInternal, async (req, res) => {
  try {
    const { klantId, profiel, feiten } = req.body || {};
    const klant = await klantgegevens.bewaar(klantId, { profiel, feiten, nieuw: true });
    res.status(201).json({ klant });
  } catch (err) {
    res.status(400).json({ error: err.message });
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

router.post('/intake/analyseer-feiten', requireLpInternal, async (req, res) => {
  try {
    const { referentieUrl, contactUrl } = req.body || {};
    const voorstel = await buildFeitenVoorstel(referentieUrl, contactUrl);
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
    res.json({ template, structuurWaarschuwingen: structuur.warnings });
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

// Onderwerp van een sjabloon laten invullen door de AI op basis van de klantsite (voorstel, slaat niets op).
async function maakFocusVoorstel(klantId, onderwerp) {
  const client = getLpClient(klantId);
  const trefwoorden = trefwoordenUitOnderwerp(onderwerp);
  let siteTeksten = '';
  try {
    const allePaginas = await lpNotion.listPages({ klant: klantId });
    const site = await haalSiteTeksten({ url: (client.profile.bedrijf || {}).url, uitsluit: allePaginas.map((p) => p.wpUrl).filter(Boolean), voorkeur: trefwoorden });
    siteTeksten = formatSiteTekstenVoorPrompt(site);
  } catch (err) { siteTeksten = ''; }
  const voorstel = await begeleiding.adviesFocus({ klantNaam: client.profile.naam, onderwerp, siteTeksten, aiFn: ai.callOpenAi });
  return voorstel;
}

router.post('/templates/focus-voorstel', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.body?.klant || '');
    res.json({ voorstel: await maakFocusVoorstel(klant, String(req.body?.onderwerp || '')) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Sjabloon dupliceren: zelfde opzet en opmaak onder een nieuwe naam, als Concept. Zie src/lp/sjabloonKopie.js.
router.post('/templates/:templateId/dupliceer', requireLpInternal, async (req, res) => {
  try {
    const origineel = await templates.getTemplate(req.params.templateId);
    const bestaandeSjablonen = await templates.listTemplates({ klant: origineel.klant });
    const onderwerp = String(req.body?.onderwerp || '').trim();
    let instructie = String(req.body?.instructie || '').trim();
    let aiOpmerking = '';
    // Alleen een onderwerp ingevuld: de AI leest de klantsite en vult de instructie zelf in. Lukt dat niet, dan gaat de
    // kopie door met alleen het onderwerp.
    if (onderwerp && !instructie) {
      try {
        const voorstel = await maakFocusVoorstel(origineel.klant, onderwerp);
        instructie = voorstel.instructie;
        aiOpmerking = voorstel.opmerking || '';
      } catch (err) { aiOpmerking = 'De instructie kon niet automatisch worden ingevuld.'; }
    }
    const kopie = bouwSjabloonKopie(origineel, { naam: req.body?.naam || onderwerp, onderwerp, instructie, bestaandeSjablonen });
    // Het voorbeeld van het origineel gaat over iets anders: voor de kopie maken we direct een voorbeeld over het nieuwe
    // onderwerp (tekst via AI, foto's uit de mediabibliotheek), zodat je meteen de aangepaste pagina ziet.
    let voorbeeldWaarschuwing = '';
    if (kopie.blueprint.focus && kopie.blueprint.templateFormat === 'slots') {
      const { voorbeeldSlotData: oudVoorbeeld, ...zonderVoorbeeld } = kopie.blueprint;
      delete kopie.blueprint.voorbeeldSlotData;
      try {
        const { data, waarschuwingen, aangevuld } = await vulVoorbeeldAan({ klant: origineel.klant, blueprint: zorgVoorGalerijSlot(zonderVoorbeeld), slotData: {}, hervulTekst: false });
        if (aangevuld) kopie.blueprint.voorbeeldSlotData = data;
        if (waarschuwingen.length) voorbeeldWaarschuwing = waarschuwingen.join(' ');
        if (!aangevuld && !voorbeeldWaarschuwing) voorbeeldWaarschuwing = 'Het voorbeeld kon niet worden gemaakt, klik op "Ververs voorbeeld".';
      } catch (err) { voorbeeldWaarschuwing = `Het voorbeeld kon niet worden gemaakt (${err.message}), klik op "Ververs voorbeeld".`; }
    }
    const structuur = validateTemplateStructure(kopie.blueprint);
    if (!structuur.ok) return res.status(400).json({ error: 'Het originele sjabloon voldoet niet aan de structuur-eisen, daarom is er geen kopie gemaakt.', structuurFouten: structuur.errors });
    const template = await templates.createTemplate(kopie);
    res.json({ template, structuurWaarschuwingen: structuur.warnings, instructieDoorAi: Boolean(instructie && !String(req.body?.instructie || '').trim()), aiOpmerking: [aiOpmerking, voorbeeldWaarschuwing].filter(Boolean).join(' ') });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/templates/:templateId/blueprint', requireLpInternal, async (req, res) => {
  try {
    const blueprint = req.body?.blueprint ?? null;
    if (blueprint && typeof blueprint === 'object' && 'focus' in blueprint) {
      const focus = schoonFocus(blueprint.focus);
      if (focus) blueprint.focus = focus; else delete blueprint.focus;
    }
    const structuur = validateTemplateStructure(blueprint);
    if (!structuur.ok) {
      return res.status(400).json({ error: 'Sjabloon voldoet niet aan de structuur-eisen.', structuurFouten: structuur.errors });
    }
    const template = await templates.updateTemplateBlueprint(req.params.templateId, blueprint);
    res.json({ template, structuurWaarschuwingen: structuur.warnings });
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
async function verwijderSjabloon(id) {
  const template = await templates.getTemplate(id);
  if (template.status === 'Actief') {
    throw new Error('Dit sjabloon staat op Actief en kan niet verwijderd worden. Zet de status eerst op Concept of Gearchiveerd.');
  }
  await templates.deleteTemplate(id);
}

router.delete('/templates/:templateId', requireLpInternal, async (req, res) => {
  try {
    await verwijderSjabloon(req.params.templateId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Meerdere tegelijk verwijderen (Pagr. stap 13). Een voor een, een fout bij een item stopt de rest niet.
async function verwijderMeerdere(ids, doe, titelVan) {
  const lijst = [...new Set(Array.isArray(ids) ? ids.map(String) : [])].slice(0, 100);
  const verwijderd = [];
  const fouten = [];
  for (const id of lijst) {
    try { await doe(id); verwijderd.push(id); } catch (err) { fouten.push({ id, titel: titelVan ? titelVan(id) : '', fout: err.message }); }
  }
  return { verwijderd, fouten };
}

router.post('/templates/verwijder-meerdere', requireLpInternal, async (req, res) => {
  if (!Array.isArray(req.body?.ids) || !req.body.ids.length) return res.status(400).json({ error: 'Kies eerst minstens een sjabloon.' });
  res.json(await verwijderMeerdere(req.body.ids, verwijderSjabloon));
});

// AI-gestuurde sjabloongeneratie (bouwvolgorde-stap 3, koerswijziging naar
// vrije templates). Levert alleen een voorstel terug (blueprint +
// placeholder-voorbeeldSlotData) — slaat niets op. Dylan bekijkt/finetunet
// het voorstel en slaat het pas op via de bestaande POST /templates
// hierboven (die de structuur-eisen alsnog afdwingt). Zie src/lp/ai.js.
router.post('/templates/generate', requireLpInternal, async (req, res) => {
  try {
    const { klant, naam, referentieUrl, paginatype, verplichteOnderdelen, visueleRichting, conversiedoel, overigeWensen, screenshots } = req.body || {};
    if (!klant || !naam) {
      return res.status(400).json({ error: 'klant en naam zijn verplicht om een voorstel te genereren.' });
    }
    const proposal = await ai.generateTemplateProposal({
      klant, naam, referentieUrl, paginatype, verplichteOnderdelen, visueleRichting, conversiedoel, overigeWensen, screenshots
    });
    res.json(proposal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Het vaste campagnesjabloon van een klant maken (24-10-2026). Een keer per klant: de AI ontwerpt het in de huisstijl
// met de conversieopbouw, het komt als Concept in de Sjablonen database (blueprintId "campagne") en Dylan keurt het goed
// en zet het op Actief in het gewone sjabloonscherm. Daarna gebruikt elke campagnepagina van die klant dit sjabloon.
router.get('/templates/campagne/:klant', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.params.klant || '');
    getLpClient(klant);
    const alle = await templates.listTemplates({ klant });
    const eigen = alle.filter((t) => t.blueprintId === campagneKennis.CAMPAGNE_BLUEPRINT && t.status !== 'Gearchiveerd');
    const actief = eigen.find((t) => t.status === 'Actief');
    res.json({ status: actief ? 'actief' : (eigen.length ? 'concept' : 'geen'), sjabloon: actief || eigen[0] || null });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/templates/campagne', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.body?.klant || '');
    const client = getLpClient(klant);
    const alle = await templates.listTemplates({ klant });
    const bestaand = alle.find((t) => t.blueprintId === campagneKennis.CAMPAGNE_BLUEPRINT && t.status !== 'Gearchiveerd');
    if (bestaand) return res.status(400).json({ error: `Deze klant heeft al een campagnesjabloon (status ${bestaand.status}). Open het bij Sjablonen.`, sjabloon: bestaand });
    const p = client.profile || {};
    const heeftFormulier = Boolean(p.formulier && p.formulier.shortcode);
    const voorkeuren = campagneKennis.bouwCampagneVoorkeurenBlok(p.campagneVoorkeuren);
    const proposal = await ai.generateTemplateProposal({
      klant,
      naam: 'Campagnepagina',
      paginatype: 'Campagnepagina voor Google Ads, Meta Ads en LinkedIn Ads: een doel, geen afleiding, conversiegericht',
      conversiedoel: heeftFormulier ? 'Aanvraag via het formulier van de klant ({{formulier}}) in de conversiesectie' : 'Contact opnemen via een duidelijke knop in de conversiesectie',
      overigeWensen: `Gebruik de huisstijl en vormtaal van de eigen site van de klant, zodat de pagina herkenbaar is. ${voorkeuren}`.trim(),
      campagne: true
    });
    const blueprint = campagneKennis.maakCampagneBlueprint(proposal.blueprint);
    if (proposal.voorbeeldSlotData && typeof proposal.voorbeeldSlotData === 'object') blueprint.voorbeeldSlotData = proposal.voorbeeldSlotData;
    const structuur = validateTemplateStructure(blueprint);
    if (!structuur.ok) return res.status(400).json({ error: `Het campagnesjabloon voldoet niet aan de eisen, probeer het opnieuw: ${structuur.errors.join('; ')}` });
    const template = await templates.createTemplate({ klant, naam: 'Campagnepagina', blueprintId: campagneKennis.CAMPAGNE_BLUEPRINT, status: 'Concept', blueprint });
    res.json({ template, structuurWaarschuwingen: structuur.warnings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Finetune-ronde op een al gegenereerd (of handmatig aangepast) voorstel —
// zie src/lp/ai.js, refineTemplateProposal.
router.post('/templates/refine', requireLpInternal, async (req, res) => {
  try {
    const { klant, naam, huidigBlueprint, huidigeVoorbeeldSlotData, feedback, sectie } = req.body || {};
    if (!klant || !naam) {
      return res.status(400).json({ error: 'klant en naam zijn verplicht.' });
    }
    // Feedback per onderdeel (sectie: { modus, index }): alleen dat onderdeel wordt aangepast, zie sectieRefine.js.
    if (sectie && Number.isInteger(Number(sectie.index)) && sectie.index !== '' && sectie.index !== null) {
      const deel = await ai.refineSectionProposal({ klant, naam, huidigBlueprint, huidigeVoorbeeldSlotData, feedback, sectie });
      return res.json(deel);
    }
    const proposal = await ai.refineTemplateProposal({ klant, naam, huidigBlueprint, huidigeVoorbeeldSlotData, feedback });
    res.json(proposal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Lijst van de onderdelen (secties) van een sjabloon, voor de keuzelijst bij "Feedback verwerken".
router.post('/templates/secties', requireLpInternal, (req, res) => {
  try {
    const { blueprint, voorbeeldSlotData } = req.body || {};
    if (!blueprint || blueprint.templateFormat !== 'slots') return res.json({ secties: [] });
    res.json({ secties: beschrijfSecties(blueprint.htmlTemplate, voorbeeldSlotData) });
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
    const { klant, blocks, blueprint: blueprintRuw, slotData, hervulTekst } = req.body || {};
    if (!klant) return res.status(400).json({ error: 'klant is verplicht.' });
    const blueprint = zorgVoorGalerijSlot(blueprintRuw);

    if (blueprint && blueprint.templateFormat === 'slots') {
      // Sjabloon delen zonder eerst een pagina te maken: lege voorbeeldtekst en lege afbeelding-slots
      // worden hier aangevuld (tekst via AI, foto's uit de mediabibliotheek van de klant). De frontend
      // bewaart het resultaat in het Voorbeeldcontent-veld, zodat dit maar een keer hoeft te gebeuren.
      const { data, waarschuwingen, aangevuld } = await vulVoorbeeldAan({ klant, blueprint, slotData: slotData || {}, hervulTekst: !!hervulTekst });
      const html = renderPageHtml({ clientId: klant, slug: 'sjabloon-voorbeeld', template: blueprint, slotData: data });
      return res.json({
        html: wrapPreviewDoc(html),
        voorbeeldSlotData: aangevuld ? data : undefined,
        waarschuwing: waarschuwingen.length ? waarschuwingen.join(' ') : undefined
      });
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

// Voorbeeldtekst hoort de ECHTE gegevens van de klant te gebruiken (naam, adres, telefoon, werkgebied,
// diensten), niet een verzonnen plaats of "Placeholder"-nummer. Bron: de feitenbibliotheek van de klant.
// Heeft het sjabloon een onderwerp (gedupliceerd sjabloon), dan gaat de voorbeeldtekst daarover.
function focusInstructie(focus) {
  if (!focus || (!focus.onderwerp && !focus.instructie)) return '';
  return ` De pagina's van dit sjabloon gaan over: ${focus.onderwerp || ''}. ${focus.instructie || ''} Schrijf alle voorbeeldtekst over dit onderwerp (kop, intro, onderdelen, voordelen, stappen, veelgestelde vragen) en gebruik uitsluitend wat in de klantgegevens en deze instructie staat.`;
}

function feitenInstructie(klant) {
  let regels = '';
  try {
    const client = getLpClient(klant);
    regels = (client.feiten || []).map((f) => `- ${f.label}: ${f.waarde}${f.standaard ? ' [vast]' : ''}`).join('\n');
  } catch (err) {
    return '';
  }
  if (!regels) return '';
  return `Gebruik in de voorbeeldteksten UITSLUITEND deze echte gegevens van de klant waar het om bedrijfsnaam, adres, telefoon, e-mail, werkgebied, diensten, kamertypes, in- en uitchecktijden of ligging gaat, en verzin geen plaatsen, nummers, tijden of adressen ("Placeholder" mag nooit in de tekst staan):\n${regels}\nGegevens met [vast] zijn vaste praktische informatie: neem ze altijd op in het praktische blok en de kamertypes van het voorbeeld, voor zover het sjabloon daar een plek voor heeft, en noem kamertypes precies zoals ze hier staan. Reviews mogen alleen als duidelijk voorbeeld (bv. naam "Voorbeeldklant"), nooit als echte klant.`;
}

// Server-kant tegenhangers van getSlotValue/setSlotValue/labelVoorTextEditPad in public/lp.js: een
// slotpad is ofwel een gewone top-level sleutel ("heroImageSrc"), ofwel "lijstKey.index.veld" voor
// een veld binnen een lijst-item (bv. "offerItems.0.imageSrc") - zelfde padconventie als elders in
// deze codebase (zie slotEngine.js tagImageSlotsForPreview/tagTextSlotsForPreview).
function getNestedSlotValue(data, path) {
  if (!path.includes('.')) return data[path];
  const [listKey, idxStr, veld] = path.split('.');
  const item = Array.isArray(data[listKey]) ? data[listKey][Number(idxStr)] : undefined;
  return item ? item[veld] : undefined;
}

function setNestedSlotValue(data, path, value) {
  if (!path.includes('.')) {
    data[path] = value;
    return;
  }
  const [listKey, idxStr, veld] = path.split('.');
  const idx = Number(idxStr);
  if (!Array.isArray(data[listKey])) data[listKey] = [];
  if (!data[listKey][idx]) data[listKey][idx] = {};
  data[listKey][idx][veld] = value;
}

// Levert het bijbehorende alt-tekst-pad voor een afbeelding-pad, of null als het geen herkende
// afbeelding-sleutel is. Twee conventies naast elkaar: top-level slots gebruiken "ImageSrc"/
// "ImageAlt" (hoofdletter I), itemFields binnen een lijst gebruiken "imageSrc"/"imageAlt"
// (kleine letter i) - zie ai.js IMAGE_SRC_RE voor dezelfde twee varianten.
function deriveImageAltKey(path) {
  if (/ImageSrc$/.test(path)) return path.replace(/ImageSrc$/, 'ImageAlt');
  if (/imageSrc$/.test(path)) return path.replace(/imageSrc$/, 'imageAlt');
  return null;
}

// Vult een sjabloonvoorbeeld aan zodat het zonder pagina toonbaar/deelbaar is. Raakt Notion niet aan
// en verzint niets: tekst is duidelijk voorbeeldtekst, foto's komen uit de echte mediabibliotheek
// van de klant (dezelfde keuzelogica als bij een pagina, ai.pickImagesForPage). Mislukt een stap,
// dan blijft het voorbeeld gewoon leeg op die plek en komt er een waarschuwing.
async function vulVoorbeeldAan({ klant, blueprint, slotData, hervulTekst }) {
  const data = { ...slotData };
  const waarschuwingen = [];
  let aangevuld = false;
  const slots = Array.isArray(blueprint.slots) ? blueprint.slots : [];
  const isLeeg = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  const tekstSlots = slots.filter((s) => !/ImageSrc$/.test(s.key) && !/ImageAlt$/.test(s.key));
  const zonderTekst = tekstSlots.length > 0 && tekstSlots.every((s) => isLeeg(data[s.key]));

  if (zonderTekst || hervulTekst) {
    try {
      const { voorbeeldSlotData } = await ai.refineTemplateProposal({
        klant,
        naam: blueprint.naam || blueprint.blueprintId || 'sjabloon',
        huidigBlueprint: blueprint,
        huidigeVoorbeeldSlotData: hervulTekst ? data : {},
        feedback: feitenInstructie(klant) + focusInstructie(blueprint.focus) + ' Pas het sjabloon (HTML, CSS, slots) NIET aan, geef de blueprint ongewijzigd terug. Vul alleen voorbeeldSlotData volledig in met realistische, nette voorbeeldteksten voor deze klant, voor elk tekst-slot en elke lijst. Afbeelding-slots laat je leeg.'
      });
      if (voorbeeldSlotData && typeof voorbeeldSlotData === 'object') {
        for (const s of tekstSlots) {
          if ((hervulTekst || isLeeg(data[s.key])) && !isLeeg(voorbeeldSlotData[s.key])) {
            data[s.key] = voorbeeldSlotData[s.key];
            aangevuld = true;
          }
        }
      }
    } catch (err) {
      waarschuwingen.push(`Voorbeeldtekst maken is niet gelukt (${err.message}).`);
    }
  }

  // ai.getImageSlots kent ook afbeeldingvelden binnen een lijst-item (bv. offerItems.0.imageSrc) -
  // zonder dat zouden lijst-foto's in het sjabloonvoorbeeld altijd leeg/placeholder blijven, precies
  // de fout die bij Roots/Festivals op 28-09-2026 gevonden is (zie systeem-logboek.md).
  const alleAfbeeldingSlots = ai.getImageSlots(blueprint, data);
  const legeFotos = alleAfbeeldingSlots.filter((s) => isLeeg(getNestedSlotValue(data, s.key)));
  if (legeFotos.length) {
    try {
      const client = getLpClient(klant);
      const { items: kandidaten } = await searchMedia({ profile: client.profile, perPage: 100 });
      if (!kandidaten.length) {
        waarschuwingen.push('De mediabibliotheek van deze klant is leeg, dus er zijn geen voorbeeldfoto\'s.');
      } else {
        const { picks } = await ai.pickImagesForPage({
          template: blueprint,
          afbeeldingSlots: legeFotos,
          invoer: {},
          feiten: client.feiten || [],
          watGaatDezePaginaOver: `Voorbeeld van het sjabloon "${blueprint.naam || blueprint.blueprintId || ''}" voor ${client.profile.bedrijf?.naam || klant}`,
          fotoRichtlijn: client.profile.fotoRichtlijn,
          kandidaten
        });
        for (const [slotKey, pick] of Object.entries(picks || {})) {
          if (pick && pick.url) {
            setNestedSlotValue(data, slotKey, pick.url);
            const altKey = deriveImageAltKey(slotKey);
            if (pick.alt && altKey) setNestedSlotValue(data, altKey, pick.alt);
            aangevuld = true;
          }
        }
      }
    } catch (err) {
      waarschuwingen.push(`Voorbeeldfoto's kiezen uit de mediabibliotheek is niet gelukt (${err.message}).`);
    }
  }
  return { data, waarschuwingen, aangevuld };
}

function wrapPreviewDoc(html) {
  // De hover-stijl hieronder maakt zichtbaar welke afbeeldingen en tekst-slots klikbaar zijn
  // (data-lp-slot voor afbeeldingen, zie tagImageSlotsForPreview; data-lp-text-slot voor tekst,
  // zie tagTextSlotsForPreview) — volledig onschadelijk als een pagina geen enkele getagde
  // afbeelding of tekst heeft. Twee losse kleuren zodat meteen duidelijk is wat een foto is en
  // wat tekst is.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>[data-lp-slot]{cursor:pointer;transition:outline .15s ease;}[data-lp-slot]:hover{outline:3px solid #2f6fed;outline-offset:-3px;}[data-lp-text-slot]{cursor:pointer;transition:outline .15s ease;}[data-lp-text-slot]:hover{outline:2px dashed #1a8754;outline-offset:2px;}[data-lp-verborgen]{opacity:.35;filter:grayscale(1);outline:2px dashed #E1502E;outline-offset:-2px;}</style></head><body>${html}</body></html>`;
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

// Instellingen van de klant voor de werkplaats: aantal pagina's per maand en product (uit Portaal Instellingen).
// Draait de automatisering voor deze klant? Ja bij de Pagr. module (Producten Pagr. of Beide), en ook als Dylan de
// schakelaar Automatisering intern aanzette voor een klant die geen Pagr. betaalt (eigen werk sneller maken).
async function pagrModuleAan(klant) {
  try {
    const inst = await klantInstellingen(klant);
    return Boolean(inst.pagr || inst.internAutomatisering);
  } catch (e) { return false; }
}

// Het plan (voorstellen, maandplan) hoort bij betaald Pagr. De interne automatisering schrijft alleen de tekst van
// pagina's die Dylan zelf aanmaakt.
async function planAan(klant) {
  try { return Boolean((await klantInstellingen(klant)).pagr); } catch (e) { return false; }
}

async function klantInstellingen(klant) {
  let fallback = {};
  try { fallback = require('../config/clients').getClient(klant); } catch (e) { fallback = {}; }
  return settingsService.getClientSettings(klant, fallback);
}

router.get('/plan/instellingen', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.query.klant || '');
    const inst = await klantInstellingen(klant);
    res.json({
      paginasPerMaand: inst.paginasPerMaand,
      producten: inst.producten,
      pagr: Boolean(inst.pagr),
      intern: Boolean(inst.internAutomatisering),
      automatisering: Boolean(inst.pagr || inst.internAutomatisering),
      plan: Boolean(inst.pagr),
      paginameting: Boolean(inst.paginameting),
      autoLive: getLpClient(klant).profile.autoLive === true,
      autoPlan: planning.planZelfstandig(getLpClient(klant).profile),
      volumeBeschikbaar: Boolean(inst.paginameting) && require('../lp/zoekvolume').beschikbaar()
    });
  } catch (err) {
    res.json({ paginasPerMaand: null, producten: null, pagr: false, paginameting: false, volumeBeschikbaar: false });
  }
});

// Wat wacht er op Dylan, per klant met de Pagr. module. Voor de teller in het menu van de admin.
router.get('/wacht-op-jou', requireLpInternal, async (req, res) => {
  try {
    const resultaat = [];
    for (const klant of Object.keys(lpClients)) {
      if (!(await pagrModuleAan(klant))) continue;
      const pages = await lpNotion.listPages({ klant });
      const tel = pages.filter((p) => p.status === 'Idee').length ? await telKlantIdeeen(klant) : { ideeen: 0, voorstellen: 0 };
      const w = wachtOpJou(pages, tel.ideeen, tel.voorstellen);
      if (w.totaal) resultaat.push({ klant, naam: lpClients[klant].profile.naam, ...w });
    }
    res.json({ klanten: resultaat, totaal: resultaat.reduce((n, k) => n + k.totaal, 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pagr. overzicht (fase 2): een rij per klant met Pagr. of interne automatisering, plus totalen. De eigen klanten
// (alleen interne automatisering) staan apart onder Eigen werk en tellen niet mee in de afspraak.
let overzichtCache = { op: 0, data: null };
router.get('/pagr-overzicht', requireLpInternal, async (req, res) => {
  try {
    if (!req.query.ververs && overzichtCache.data && Date.now() - overzichtCache.op < 30 * 1000) return res.json(overzichtCache.data);
    const rijen = [];
    for (const klant of Object.keys(lpClients)) {
      let inst = {};
      try { inst = await klantInstellingen(klant); } catch (e) { continue; }
      if (!inst.pagr && !inst.internAutomatisering) continue;
      const pages = await lpNotion.listPages({ klant });
      const tel = pages.some((p) => p.status === 'Idee') ? await telKlantIdeeen(klant) : undefined;
      const google = inst.paginameting ? await meting.haalGoogle(klant).catch(() => null) : null;
      const product = inst.producten === 'Beide' ? 'Blogr. en Pagr.' : (inst.pagr ? 'Pagr.' : 'Eigen werk');
      rijen.push(bouwKlantRij({ id: klant, naam: lpClients[klant].profile.naam, soort: inst.pagr ? 'pagr' : 'eigen', product, paginameting: Boolean(inst.paginameting), google, paginasPerMaand: inst.paginasPerMaand, autoLive: lpClients[klant].profile.autoLive, autoPlan: planning.planZelfstandig(lpClients[klant].profile), pages, tel }));
    }
    const data = { maand: maandplan.huidigeMaand(), klanten: rijen, totalen: bouwTotalen(rijen) };
    overzichtCache = { op: Date.now(), data };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function telKlantIdeeen(klant) {
  const paginas = (await lpNotion.listPages({ klant, status: 'Idee' })).slice(0, 25);
  const tel = { ideeen: 0, voorstellen: 0, voorstellenPerMaand: {}, ingepland: 0, ingeplandPerMaand: {}, eerstvolgende: '' };
  for (const p of paginas) {
    const inv = (await lpNotion.getPage(p.id)).invoer || {};
    if (inv.plan && inv.plan.status === 'idee van klant') tel.ideeen += 1;
    else if (inv.plan && inv.plan.status === 'ingepland') {
      tel.ingepland += 1;
      if (inv.plan.maand) tel.ingeplandPerMaand[inv.plan.maand] = (tel.ingeplandPerMaand[inv.plan.maand] || 0) + 1;
      if (inv.plan.schrijfOp && (!tel.eerstvolgende || inv.plan.schrijfOp < tel.eerstvolgende)) tel.eerstvolgende = inv.plan.schrijfOp;
    } else if (inv.plan && inv.plan.status === 'voorgesteld') {
      tel.voorstellen += 1;
      if (inv.plan.maand) tel.voorstellenPerMaand[inv.plan.maand] = (tel.voorstellenPerMaand[inv.plan.maand] || 0) + 1;
    }
  }
  return tel;
}

// ---- Maandplan (Pagr., 16-10-2026) ----
// Op de 1e van de maand zet de server voor klanten met Pagr. en een vast aantal pagina's per maand een plan klaar als
// pagina's met stand Idee en plan.status 'voorgesteld'. Er wordt nog geen tekst geschreven: dat gebeurt pas als Dylan
// goedkeurt. Het plan verschijnt bij Wacht op jou.
const maandplanGedaan = new Set();

async function planBestaatDezeMaand(klant, maand) {
  const start = maandplan.maandStart(maand).getTime() - 24 * 3600 * 1000;
  // Ook voorstellen die al eerder zijn klaargezet (stand Idee) tellen mee, bijvoorbeeld een plan voor november dat al in oktober is gemaakt.
  const paginas = (await lpNotion.listPages({ klant })).filter((p) => p.status === 'Idee' || (p.aangemaakt && new Date(p.aangemaakt).getTime() >= start)).slice(0, 40);
  for (const p of paginas) {
    if (maandplan.isPlanVanMaand(await lpNotion.getPage(p.id), maand)) return true;
  }
  return false;
}

async function maakMaandPlan(klant, { forceer } = {}) {
  const huidige = maandplan.huidigeMaand();
  const inst = await klantInstellingen(klant);
  // Is het aantal pagina's van deze maand al gemaakt (ook los van een plan), dan is deze maand klaar: de automatische ronde
  // wacht tot de 1e, en de knop Maandplan nu klaarzetten maakt een plan voor de maand erna (23-10-2026).
  const gemaakt = maandplan.aantalDezeMaand(await lpNotion.listPages({ klant }), huidige);
  const maand = forceer ? maandplan.planMaand(huidige, gemaakt, inst.paginasPerMaand) : huidige;
  if (!forceer && Number(inst.paginasPerMaand) > 0 && gemaakt >= Number(inst.paginasPerMaand)) return { overgeslagen: true, reden: 'Het aantal pagina\'s voor deze maand is al gemaakt.' };
  const sleutel = `${klant}:${maand}`;
  const bestaat = forceer ? false : await planBestaatDezeMaand(klant, maand);
  if (!forceer && !maandplan.moetPlannen({ pagr: inst.pagr, paginasPerMaand: inst.paginasPerMaand, planBestaat: bestaat, gedaan: maandplanGedaan.has(sleutel) })) return { overgeslagen: true };
  if (forceer && !inst.pagr) throw new Error('Het plan hoort bij Pagr. Voor deze klant staat Pagr. niet aan.');
  const actieveLijst = zonderCampagne(await templates.listTemplates({ klant, status: 'Actief' }));
  if (!actieveLijst.length) return { overgeslagen: true, reden: 'Geen actief sjabloon.' };
  const bestaandePaginas = await lpNotion.listPages({ klant });
  const klantTekst = await ai.formatKlantBronnenVoorSjabloon(klant);
  let aiVragen = [];
  if (inst.paginameting) { try { aiVragen = await meting.haalAiVragen(getLpClient(klant).profile.naam); } catch (e) { aiVragen = []; } }
  const aantal = Number(inst.paginasPerMaand) > 0 ? Number(inst.paginasPerMaand) : 4;
  const uit = await plan.maakPlanVoorstel({ klant, aantal, wens: '', bestaandePaginas, klantTekst, aiVragen, aiFn: ai.callOpenAi, volumeAan: Boolean(inst.paginameting) });
  // De AI kiest per voorstel een sjabloon, zodat een sjabloon voor een bepaald soort pagina (bijvoorbeeld per plaats) niet
  // op elke pagina terugkomt. In de planlijst kun je het per voorstel wijzigen.
  const sjabloonInfo = [];
  for (const t of actieveLijst.slice(0, 12)) {
    try { const bp = await templates.getActiveTemplateByBlueprintId(klant, t.blueprintId); sjabloonInfo.push({ blueprintId: t.blueprintId, naam: t.naam, onderwerp: (bp.focus && bp.focus.onderwerp) || '' }); } catch (e) { /* overslaan */ }
  }
  if (!sjabloonInfo.length) sjabloonInfo.push({ blueprintId: actieveLijst[0].blueprintId, naam: actieveLijst[0].naam, onderwerp: '' });
  const gekozen = await begeleiding.kiesSjablonenVoorVoorstellen({ klantNaam: getLpClient(klant).profile.naam, voorstellen: uit.voorstellen, sjablonen: sjabloonInfo, aiFn: ai.callOpenAi });
  // Planning (23-10-2026): standaard plant het systeem zelf met een schrijfdatum per pagina, zonder akkoord van Dylan. Alleen
  // een klant met autoPlan op false houdt de oude gang: voorstellen die Dylan eerst goedkeurt.
  const zelfstandig = planning.planZelfstandig(getLpClient(klant).profile);
  const datums = zelfstandig ? planning.schrijfDatums(uit.voorstellen.length, maand, planning.vandaagAms()) : [];
  let n = 0;
  for (const [i, v] of uit.voorstellen.entries()) {
    const opties = zelfstandig ? { status: 'ingepland', schrijfOp: datums[i] } : {};
    const page = await lpNotion.createPage({ klant, blueprint: gekozen[i], titel: String(v.titel), invoer: maandplan.invoerVoorVoorgesteld(v, maand, opties) });
    await lpNotion.setStatus(page.id, 'Idee');
    n += 1;
  }
  maandplanGedaan.add(sleutel);
  return { aantal: n, maand, ingepland: zelfstandig };
}

// Voorstellen van een klant die zelfstandig plant (bijvoorbeeld van voor deze regel) krijgen alsnog een schrijfdatum, zodat
// niets blijft liggen op een akkoord dat niet nodig is. Daarna schrijft het systeem de pagina's waarvan de datum is gekomen.
async function planRonde(klant) {
  if (!(await planAan(klant)) || !planning.planZelfstandig(getLpClient(klant).profile)) return { ingepland: 0, geschreven: 0 };
  const vandaag = planning.vandaagAms();
  const paginas = (await lpNotion.listPages({ klant, status: 'Idee' })).slice(0, 40);
  const volledig = [];
  for (const p of paginas) volledig.push(await lpNotion.getPage(p.id));
  // 1. voorstellen zonder akkoord krijgen een datum, per maand gespreid
  const perMaand = new Map();
  volledig.forEach((pg) => { const plan = (pg.invoer || {}).plan; if (plan && plan.status === 'voorgesteld') { const m = plan.maand || maandplan.huidigeMaand(); perMaand.set(m, [...(perMaand.get(m) || []), pg]); } });
  let ingepland = 0;
  for (const [m, lijst] of perMaand) {
    const datums = planning.schrijfDatums(lijst.length, m, vandaag);
    for (const [i, pg] of lijst.entries()) {
      const inv = pg.invoer || {};
      await lpNotion.updateSection(pg.id, 'invoer', { ...inv, plan: { ...inv.plan, status: 'ingepland', schrijfOp: datums[i] } });
      pg.invoer = { ...inv, plan: { ...inv.plan, status: 'ingepland', schrijfOp: datums[i] } };
      ingepland += 1;
    }
  }
  // 2. pagina's waarvan de schrijfdatum is gekomen
  let geschreven = 0;
  for (const pg of volledig) {
    const inv = pg.invoer || {};
    if (!planning.isRijp(inv.plan, vandaag)) continue;
    await lpNotion.updateSection(pg.id, 'invoer', { ...inv, plan: { ...inv.plan, status: 'goedgekeurd', goedgekeurdOp: vandaag } });
    startAutoTekst(pg.id);
    geschreven += 1;
  }
  return { ingepland, geschreven };
}

async function maandPlanRonde() {
  for (const klant of Object.keys(lpClients)) {
    try { await maakMaandPlan(klant); } catch (e) { console.warn(`Maandplan voor ${klant} mislukt:`, e.message); }
    try { const r = await planRonde(klant); if (r.ingepland || r.geschreven) console.log(`[planning] ${klant}: ${r.ingepland} ingepland, ${r.geschreven} gestart met schrijven`); } catch (e) { console.warn(`Planning voor ${klant} mislukt:`, e.message); }
  }
}

// De agenda van een klant: welke pagina wanneer geschreven wordt en waarom. Voor Dylan (hier) en voor de klant (api.js).
router.get('/plan/planning', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.query.klant || '');
    getLpClient(klant);
    const paginas = await lpNotion.listPages({ klant });
    const recent = Date.now() - 60 * 24 * 3600 * 1000;
    const kandidaten = paginas.filter((p) => p.status === 'Idee' || (p.aangemaakt && new Date(p.aangemaakt).getTime() >= recent)).slice(0, 40);
    const metInvoer = [];
    for (const p of kandidaten) {
      try { metInvoer.push({ id: p.id, titel: p.titel, stand: standVan(p.status), status: p.status, invoer: (await lpNotion.getPage(p.id)).invoer || {} }); } catch (e) { /* pagina overslaan */ }
    }
    res.json({ planning: planning.bouwPlanning(metInvoer), zelfstandig: planning.planZelfstandig(getLpClient(klant).profile) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wordt vanuit server.js gestart: een eerste ronde kort na het opstarten en daarna elke 6 uur.
router.startMaandPlan = function () {
  const eerste = setTimeout(maandPlanRonde, 2 * 60 * 1000);
  const timer = setInterval(maandPlanRonde, 6 * 3600 * 1000);
  if (eerste.unref) eerste.unref();
  if (timer.unref) timer.unref();
};

router.post('/plan/maandplan/nu', requireLpInternal, async (req, res) => {
  try {
    const klant = String((req.body || {}).klant || '');
    getLpClient(klant);
    res.json(await maakMaandPlan(klant, { forceer: true }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Het voorgestelde plan van de klant, voor de kaart Wacht op jou.
router.get('/plan/voorgesteld', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.query.klant || '');
    const paginas = (await lpNotion.listPages({ klant, status: 'Idee' })).slice(0, 40);
    const voorstellen = [];
    const actief = zonderCampagne(await templates.listTemplates({ klant, status: 'Actief' }).catch(() => []));
    const naamVan = new Map(actief.map((t) => [t.blueprintId, t.naam]));
    for (const p of paginas) {
      const inv = (await lpNotion.getPage(p.id)).invoer || {};
      if (inv.plan && inv.plan.status === 'voorgesteld') voorstellen.push({ id: p.id, blueprint: p.blueprint, sjabloonNaam: naamVan.get(p.blueprint) || p.blueprint, titel: p.titel, reden: inv.plan.reden || '', maand: inv.plan.maand || '', volume: inv.plan.volume, signaal: inv.plan.signaal });
    }
    res.json({ voorstellen, maand: voorstellen[0] ? maandplan.maandNaam(voorstellen[0].maand) : '', sjablonen: actief.map((t) => ({ id: t.blueprintId, naam: t.naam })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Keurt gekozen voorstellen goed en haalt de rest weg. De tekst start vanzelf bij klanten met Pagr.
// Voorstellen goedkeuren of weghalen. Gebruikt door de route hieronder en door het automatisch goedkeuren van het maandplan.
async function keurVoorstellen({ klant, goedkeuren, afwijzen, sjablonen: gekozenSjablonen }) {
  const automatisch = await pagrModuleAan(klant);
  const actiefNu = new Set(zonderCampagne(await templates.listTemplates({ klant, status: 'Actief' }).catch(() => [])).map((t) => t.blueprintId));
  let goed = 0;
  for (const id of Array.isArray(goedkeuren) ? goedkeuren : []) {
    let page = await lpNotion.getPage(id);
    const nieuwSjabloon = gekozenSjablonen && gekozenSjablonen[id];
    if (nieuwSjabloon && nieuwSjabloon !== page.blueprint && actiefNu.has(nieuwSjabloon)) {
      await lpNotion.setBlueprint(id, nieuwSjabloon);
      page = await lpNotion.getPage(id);
    }
    const inv = page.invoer || {};
    if (!inv.plan || inv.plan.status !== 'voorgesteld') continue;
    await lpNotion.updateSection(id, 'invoer', { ...inv, plan: { ...inv.plan, status: 'goedgekeurd', goedgekeurdOp: new Date().toISOString().slice(0, 10) } });
    const tpl = (eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint).catch(() => null));
    if (automatisch && tpl && tpl.templateFormat === 'slots') startAutoTekst(id);
    goed += 1;
  }
  let weg = 0;
  for (const id of Array.isArray(afwijzen) ? afwijzen : []) {
    const inv = (await lpNotion.getPage(id)).invoer || {};
    if (inv.plan && inv.plan.status === 'voorgesteld') { await lpNotion.deletePage(id); weg += 1; }
  }
  return { goedgekeurd: goed, weggehaald: weg };
}

router.post('/plan/voorgesteld/keur', requireLpInternal, async (req, res) => {
  try {
    const { klant, goedkeuren, afwijzen, sjablonen } = req.body || {};
    res.json(await keurVoorstellen({ klant, goedkeuren, afwijzen, sjablonen }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Klantideeen: pagina's met stand Idee die de klant zelf aandroeg en die nog beoordeeld moeten worden.
router.get('/plan/ideeen', requireLpInternal, async (req, res) => {
  try {
    const paginas = await lpNotion.listPages({ klant: req.query.klant, status: 'Idee' });
    const ideeen = [];
    for (const p of paginas.slice(0, 25)) {
      const inv = (await lpNotion.getPage(p.id)).invoer || {};
      if (inv.plan && inv.plan.status === 'idee van klant') ideeen.push({ id: p.id, titel: p.titel, toelichting: inv.plan.toelichting || '' });
    }
    res.json({ ideeen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/plan/ideeen/:pageId/beoordeel', requireLpInternal, async (req, res) => {
  try {
    const { besluit } = req.body || {};
    const page = await lpNotion.getPage(req.params.pageId);
    const inv = page.invoer || {};
    if (!inv.plan || inv.plan.status !== 'idee van klant') return res.status(400).json({ error: 'Dit is geen klantidee dat nog beoordeeld moet worden.' });
    if (besluit === 'goedkeuren') {
      await lpNotion.updateSection(page.id, 'invoer', { ...inv, plan: { ...inv.plan, status: 'goedgekeurd', goedgekeurdOp: new Date().toISOString().slice(0, 10), reden: inv.plan.reden || 'Idee van de klant.' } });
      return res.json({ ok: true });
    }
    if (besluit === 'afwijzen') {
      await lpNotion.deletePage(page.id);
      return res.json({ ok: true });
    }
    res.status(400).json({ error: 'Besluit moet goedkeuren of afwijzen zijn.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Bijhouden: meting per pagina en updatevoorstellen.
async function bouwMeting(klant) {
  const profielNaam = getLpClient(klant).profile.naam;
  const paginas = await lpNotion.listPages({ klant });
  const lijst = maakKlantLijst(paginas);
  // Alleen meten voor klanten waarbij de schakelaar Paginameting aan staat.
  const inst = await klantInstellingen(klant);
  if (!inst.paginameting) {
    const leeg = meting.leegMeting();
    return { verrijkt: meting.verrijkMetMeting(lijst, leeg.google, leeg.ai), google: leeg.google, aiMeting: leeg.ai };
  }
  const [google, aiMeting] = await Promise.all([meting.haalGoogle(klant), meting.haalAi(profielNaam)]);
  const verrijkt = meting.verrijkMetMeting(lijst, google, aiMeting);
  return { verrijkt, google, aiMeting };
}

router.get('/plan/bijhouden', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.query.klant || '');
    const { verrijkt, google, aiMeting } = await bouwMeting(klant);
    res.json({
      metingUit: Boolean(google.uit),
      googleBeschikbaar: google.beschikbaar,
      aiBeschikbaar: aiMeting.beschikbaar,
      voorstellen: maakUpdateVoorstellen(verrijkt, { aiBeschikbaar: aiMeting.beschikbaar }),
      live: verrijkt.filter((p) => p.stand === 'Live').map((p) => ({ id: p.id, titel: p.titel, liveDatum: p.liveDatum || '', google: p.google ? { vertoningen: p.google.vertoningen, klikken: p.google.klikken, positie: p.google.positie, trend: p.google.trend } : null, ai: p.ai ? { geciteerd: p.ai.geciteerd } : null }))
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Bulk op de server: maakt na elkaar de tekst voor alle geplande, goedgekeurde pagina's. De voortgang blijft staan als je
// het tabblad sluit. Een taak per klant tegelijk, in het geheugen (na een herstart van de server is de taak weg).
const bulkTaken = new Map();
router.post('/plan/bulk', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.body?.klant || '');
    getLpClient(klant);
    const lopend = [...bulkTaken.values()].find((t) => t.klant === klant && t.status === 'bezig');
    if (lopend) return res.json({ taak: lopend });
    const paginas = await lpNotion.listPages({ klant, status: 'Idee' });
    const kandidaten = [];
    for (const p of paginas) {
      const volledig = await lpNotion.getPage(p.id);
      const planStatus = ((volledig.invoer || {}).plan || {}).status;
      if (!isBulkKandidaat(planStatus)) continue;
      kandidaten.push(volledig);
    }
    if (!kandidaten.length) return res.status(400).json({ error: 'Er zijn geen geplande pagina\'s om te maken.' });
    const taak = { id: `${Date.now()}`, klant, status: 'bezig', totaal: kandidaten.length, klaar: 0, huidige: '', fouten: [] };
    bulkTaken.set(taak.id, taak);
    (async () => {
      for (const page of kandidaten) {
        taak.huidige = page.titel;
        try {
          const r = await maakContentVoorstel(page, {});
          const slotData = r.slotData || {};
          await lpNotion.updateSection(page.id, 'content', { meta: { metaTitle: slotData.metaTitle || '', metaDescription: slotData.metaDescription || '' }, slotData });
          await zetStatusNaSchrijven(page.id);
          taak.klaar += 1;
        } catch (err) {
          taak.fouten.push({ titel: page.titel, fout: err.message });
        }
      }
      taak.huidige = '';
      taak.status = 'klaar';
    })();
    res.json({ taak });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/plan/bulk/:taakId', requireLpInternal, (req, res) => {
  const taak = bulkTaken.get(req.params.taakId);
  if (!taak) return res.status(404).json({ error: 'Taak niet gevonden (de server is mogelijk herstart).' });
  res.json({ taak });
});

// AI adviseur: beantwoordt een vraag over deze klant met de echte stand van zaken als context.
router.post('/plan/vraag', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.body?.klant || '');
    const vraag = String(req.body?.vraag || '').trim().slice(0, 600);
    if (!vraag) return res.status(400).json({ error: 'Stel een vraag.' });
    const { verrijkt, google, aiMeting } = await bouwMeting(klant);
    const actieveSjablonen = zonderCampagne(await templates.listTemplates({ klant, status: 'Actief' }));
    const voorstellen = maakUpdateVoorstellen(verrijkt, { aiBeschikbaar: aiMeting.beschikbaar });
    const context = [
      `Klant: ${getLpClient(klant).profile.naam}`,
      `Actieve sjablonen: ${actieveSjablonen.map((t) => t.naam).join(', ') || 'geen'}`,
      `Pagina's: ${verrijkt.map((p) => `${p.titel} (${p.stand}${p.google ? `, ${p.google.vertoningen} vertoningen, ${p.google.klikken} klikken` : ''})`).join('; ') || 'geen'}`,
      `Google meting beschikbaar: ${google.beschikbaar ? 'ja' : 'nee'}. AI meting beschikbaar: ${aiMeting.beschikbaar ? 'ja' : 'nee'}.`,
      `Updatevoorstellen uit de meting: ${voorstellen.map((v) => `${v.titel}: ${v.reden}`).join(' | ') || 'geen'}`
    ].join('\n');
    const antwoord = await ai.callOpenAi({
      systemPrompt: 'Je bent adviseur voor een bureau dat landingspagina\'s maakt voor lokale bedrijven. Beantwoord de vraag kort en concreet in eenvoudig Nederlands op basis van de gegeven stand van zaken. Verzin geen cijfers. Zeg het als je iets niet weet. Gebruik geen streepjes en geen emoticons. Antwoord als JSON: {"antwoord":"..."}.',
      userPrompt: `${context}\n\nVraag: ${vraag}`,
      reasoningEffort: 'low'
    });
    res.json({ antwoord: String((antwoord || {}).antwoord || '').trim() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Het plan (Pagr. stap 3): de AI stelt pagina's voor, Dylan keurt goed. Het voorstel zelf wordt niet opgeslagen.
router.post('/plan/voorstel', requireLpInternal, async (req, res) => {
  try {
    const { klant, aantal, wens } = req.body || {};
    getLpClient(klant);
    if (!(await planAan(klant))) return res.status(403).json({ error: 'Het plan hoort bij Pagr. Voor deze klant staat Pagr. niet aan.' });
    const bestaandePaginas = await lpNotion.listPages({ klant });
    const klantTekst = await ai.formatKlantBronnenVoorSjabloon(klant);
    const inst = await klantInstellingen(klant);
    let aiVragen = [];
    if (inst.paginameting) {
      try { aiVragen = await meting.haalAiVragen(getLpClient(klant).profile.naam); } catch (e) { aiVragen = []; }
    }
    const uit = await plan.maakPlanVoorstel({ klant, aantal, wens, bestaandePaginas, klantTekst, aiVragen, aiFn: ai.callOpenAi, volumeAan: Boolean(inst.paginameting) });
    res.json(uit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/plan/goedkeuren', requireLpInternal, async (req, res) => {
  try {
    const { klant, blueprint, voorstellen } = req.body || {};
    if (!klant || !blueprint || !Array.isArray(voorstellen) || !voorstellen.length) {
      return res.status(400).json({ error: 'klant, blueprint en minstens een voorstel zijn verplicht.' });
    }
    if (!(await planAan(klant))) return res.status(403).json({ error: 'Het plan hoort bij Pagr. Voor deze klant staat Pagr. niet aan.' });
    if (voorstellen.length > plan.MAX_AANTAL) return res.status(400).json({ error: `Maximaal ${plan.MAX_AANTAL} pagina's tegelijk.` });
    const gekozenSjabloon = await templates.getActiveTemplateByBlueprintId(klant, blueprint);
    const automatisch = await pagrModuleAan(klant);
    const aangemaakt = [];
    for (const v of voorstellen) {
      if (!v || !v.titel) continue;
      const page = await lpNotion.createPage({ klant, blueprint, titel: String(v.titel), invoer: plan.invoerVoorGoedgekeurd(v) });
      await lpNotion.setStatus(page.id, 'Idee');
      if (automatisch && gekozenSjabloon && gekozenSjabloon.templateFormat === 'slots') startAutoTekst(page.id);
      aangemaakt.push({ id: page.id, titel: v.titel });
    }
    res.json({ aangemaakt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// AI begeleiding (Pagr. stap 12): de beheerder beschrijft in gewone woorden wat hij wil, de AI kiest sjabloon, titel en
// invoer en legt uit waarom. Er wordt niets opgeslagen; de beheerder past aan en maakt de pagina zelf aan.
async function maakPaginaAdvies(klant, onderwerp, blueprintId, { soort } = {}) {
  const client = getLpClient(klant);
  let actief = await templates.listTemplates({ klant, status: 'Actief' });
  // Een SEO/GEO pagina kiest nooit het campagnesjabloon; een campagnepagina altijd (24-10-2026).
  if (soort === 'campagne') {
    blueprintId = campagneKennis.CAMPAGNE_BLUEPRINT;
    if (!actief.some((t) => t.blueprintId === blueprintId)) {
      throw new Error('Deze klant heeft nog geen actief campagnesjabloon. Maak het eerst met de knop "Maak campagnesjabloon", keur het goed bij Sjablonen en zet het op Actief.');
    }
  } else {
    actief = actief.filter((t) => t.blueprintId !== campagneKennis.CAMPAGNE_BLUEPRINT);
  }
  // Heeft de beheerder zelf een sjabloon gekozen, dan krijgt de AI alleen dat sjabloon te zien en kan hij geen ander kiezen.
  if (blueprintId) {
    actief = actief.filter((t) => t.blueprintId === blueprintId);
    if (!actief.length) throw new Error('Dit sjabloon is niet (meer) actief. Kies een ander sjabloon.');
  }
  const sjablonen = [];
  for (const t of actief.slice(0, 12)) {
    try {
      const bp = await templates.getActiveTemplateByBlueprintId(klant, t.blueprintId);
      sjablonen.push({ blueprintId: t.blueprintId, naam: t.naam, invoerVelden: bp.invoerVelden || [] });
    } catch (e) { /* sjabloon zonder bruikbare blueprint overslaan */ }
  }
  const paginas = await lpNotion.listPages({ klant });
  const klantTekst = await ai.formatKlantBronnenVoorSjabloon(klant);
  const advies = await begeleiding.adviesNieuwePagina({
    klantNaam: client.profile.naam,
    klantTekst,
    onderwerp,
    sjablonen,
    bestaandeTitels: paginas.map((p) => p.titel).filter(Boolean),
    gepland: paginas.filter((p) => p.status === 'Idee').map((p) => p.titel).filter(Boolean).slice(0, 15),
    aiFn: ai.callOpenAi
  });
  return { advies, sjablonen };
}

router.post('/pages/begeleiding', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.body?.klant || '');
    const onderwerp = String(req.body?.onderwerp || '').slice(0, 1500);
    const soort = req.body?.soort === 'campagne' ? 'campagne' : 'seo';
    const { advies } = await maakPaginaAdvies(klant, onderwerp, String(req.body?.blueprintId || ''), { soort });
    if (soort === 'campagne') advies.invoer = { ...(advies.invoer || {}), ...campagneKennis.campagneInvoer(req.body || {}) };
    res.json({ advies });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Dezelfde pagina voor meer plaatsen: per plaats een kopie van de opzet, de tekst start vanzelf bij klanten met Pagr.
async function kopieerNaarPlaatsen(pageId, plaatsen, automatisch) {
  const namen = [...new Set((Array.isArray(plaatsen) ? plaatsen : String(plaatsen || '').split(/[\n,]+/)).map((n) => String(n).trim()).filter(Boolean))].slice(0, 15);
  if (!namen.length) return [];
  const origineel = await lpNotion.getPage(pageId);
  const sleutel = Object.keys(origineel.invoer || {}).find((k) => !k.startsWith('_') && gelijk.PLAATS_SLEUTEL_RE.test(k));
  if (!sleutel) return [{ fout: 'Deze pagina heeft geen invoerveld voor een plaats, de extra plaatsen zijn niet gemaakt.' }];
  const oudePlaats = gelijk.plaatsWaarde(origineel.invoer);
  const { titelVoorPlaats } = require('../lp/dupliceer');
  const uit = [];
  for (const naam of namen) {
    try {
      const { id } = await maakKopie(origineel, { titel: titelVoorPlaats(origineel.titel, oudePlaats, naam), invoer: { [sleutel]: naam }, modus: 'opzet', lokaleGegevens: '' });
      if (automatisch) startAutoTekst(id);
      uit.push({ plaats: naam, id });
    } catch (e) {
      uit.push({ plaats: naam, fout: e.message });
    }
  }
  return uit;
}

// Nieuwe pagina in een stap (Pagr., 16-10-2026): de AI kiest sjabloon, titel en webadres en de pagina wordt meteen
// aangemaakt. Lukt dat niet netjes (geen sjabloon, titel bestaat al), dan komt het advies terug zonder pagina, zodat
// het scherm het formulier kan voorinvullen.
router.post('/pages/snel', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.body?.klant || '');
    const onderwerp = String(req.body?.onderwerp || '').slice(0, 1500);
    const soort = req.body?.soort === 'campagne' ? 'campagne' : 'seo';
    const { advies } = await maakPaginaAdvies(klant, onderwerp, String(req.body?.blueprintId || ''), { soort });
    const extraInvoer = soort === 'campagne' ? campagneKennis.campagneInvoer(req.body || {}) : {};
    // Heeft de beheerder zelf een titel of webadres getypt (Wijzig in het scherm), dan gaat dat voor op de keuze van de AI.
    const eigenTitel = String(req.body?.titel || '').trim().slice(0, 140);
    const eigenSlug = String(req.body?.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
    if (eigenTitel) advies.titel = eigenTitel;
    if (eigenSlug) advies.slug = eigenSlug;
    if (!advies.blueprintId || !advies.titel || (advies.waarschuwing && !eigenTitel)) return res.json({ advies, page: null });
    const template = await templates.getActiveTemplateByBlueprintId(klant, advies.blueprintId);
    const page = await lpNotion.createPage({ klant, blueprint: advies.blueprintId, titel: advies.titel, slug: advies.slug, invoer: metOnderwerp({ ...advies.invoer, _watGaatDezePaginaOver: onderwerp, ...extraInvoer }, advies.titel) });
    const automatisch = template && template.templateFormat === 'slots' && await pagrModuleAan(klant);
    if (automatisch) startAutoTekst(page.id);
    const extra = await kopieerNaarPlaatsen(page.id, req.body?.plaatsen, automatisch);
    res.json({ advies, page, automatisch: Boolean(automatisch), sjabloonNaam: template && template.naam, extraPlaatsen: extra });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/templates/verbeterpunten', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.body?.klant || '');
    const client = getLpClient(klant);
    const blueprint = req.body?.blueprint;
    if (!blueprint || typeof blueprint !== 'object') return res.status(400).json({ error: 'Er is geen sjabloon om te beoordelen.' });
    const beelden = schoonScreenshots(req.body?.screenshots);
    const punten = await begeleiding.adviesVerbeterpunten({
      klantNaam: client.profile.naam,
      beelden,
      naam: String(req.body?.naam || ''),
      blueprint,
      conversiedoel: String(req.body?.conversiedoel || '').slice(0, 200),
      aiFn: ai.callOpenAi
    });
    res.json({ punten });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/templates/begeleiding', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.body?.klant || '');
    const doel = String(req.body?.doel || '').slice(0, 1500);
    const client = getLpClient(klant);
    const bestaand = await templates.listTemplates({ klant });
    const klantTekst = await ai.formatKlantBronnenVoorSjabloon(klant);
    const onderdelen = ai.VASTE_ONDERDELEN_OPTIES.map((key) => ({ key, label: ai.VASTE_ONDERDELEN_LABELS[key] || key }));
    const advies = await begeleiding.adviesNieuwSjabloon({
      klantNaam: client.profile.naam,
      klantTekst,
      doel,
      onderdelen,
      bestaandeSjablonen: bestaand.filter((t) => t.status !== 'Gearchiveerd').map((t) => t.naam).filter(Boolean),
      aiFn: ai.callOpenAi
    });
    res.json({ advies });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/pages', requireLpInternal, async (req, res) => {
  try {
    const { klant, blueprint, titel, slug, invoer } = req.body || {};
    if (!klant || !blueprint || !titel) {
      return res.status(400).json({ error: 'klant, blueprint en titel zijn verplicht.' });
    }
    // Valideer dat klant/blueprint bestaan voordat we een Notion-pagina aanmaken.
    const template = await templates.getActiveTemplateByBlueprintId(klant, blueprint);
    const page = await lpNotion.createPage({ klant, blueprint, titel, slug, invoer: metOnderwerp(invoer, titel) });
    // De AI schrijft de tekst vanzelf (alleen voor sjablonen in het slot formaat en klanten met de Pagr. module). Uit te zetten met automatisch: false.
    if (req.body.automatisch !== false && template && template.templateFormat === 'slots' && await pagrModuleAan(klant)) startAutoTekst(page.id);
    res.json({ page });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/pages-verwijderd', requireLpInternal, (req, res) => {
  const klant = String(req.query.klant || '');
  const grens = Date.now() - 7 * 24 * 3600 * 1000;
  res.json({ pages: onlangsVerwijderd.filter((p) => p.op >= grens && (!klant || p.klant === klant)).map((p) => ({ id: p.id, titel: p.titel, klant: p.klant, op: p.op })) });
});

// Verwijderde pagina's terugzetten: Notion weer actief, en als de pagina in WordPress stond, daar terug als concept.
router.post('/pages-herstel', requireLpInternal, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (!ids.length) return res.status(400).json({ error: 'Kies eerst een pagina om terug te zetten.' });
  const hersteld = [];
  const fouten = [];
  for (const id of ids) {
    const rij = onlangsVerwijderd.find((p) => p.id === id);
    try {
      await lpNotion.restorePage(id);
      let wpMelding = '';
      if (rij && rij.wpPaginaId) {
        try { await herstelWpPage({ profile: getLpClient(rij.klant).profile, wpPaginaId: rij.wpPaginaId }); } catch (e) { wpMelding = e.message; }
      }
      const i = onlangsVerwijderd.findIndex((p) => p.id === id);
      if (i >= 0) onlangsVerwijderd.splice(i, 1);
      hersteld.push({ id, titel: rij && rij.titel, wpMelding });
    } catch (err) { fouten.push({ id, titel: rij && rij.titel, fout: err.message }); }
  }
  res.json({ hersteld, fouten });
});

router.get('/pages/:pageId', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    res.json({ page, tekstStatus: autoTekstRij.status(req.params.pageId), pagr: await pagrModuleAan(page.klant) });
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

function onthoudCorrecties(voor, nieuweContent) {
  (async () => {
    if (!voor || !voor.klant || !voor.content || !voor.content.slotData || !nieuweContent || !nieuweContent.slotData) return;
    const nieuwe = leren.verschillen(voor.content.slotData, nieuweContent.slotData);
    if (!nieuwe.length) return;
    await klantgegevens.voegCorrectiesToe(voor.klant, nieuwe, { pagina: voor.id, datum: new Date().toISOString().slice(0, 10) });
  })().catch((err) => console.warn('[leren] correcties onthouden mislukt:', err.message));
}

router.put('/pages/:pageId/content', requireLpInternal, async (req, res) => {
  try {
    // Wat Dylan in de tekst aanpast onthouden we per klant (leren.js). Nooit blokkerend: opslaan gaat altijd voor.
    let voor = null;
    try { voor = await lpNotion.getPage(req.params.pageId); } catch (e) { voor = null; }
    const page = await lpNotion.updateSection(req.params.pageId, 'content', req.body?.content ?? null);
    onthoudCorrecties(voor, req.body && req.body.content);
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
// Zusterpagina's: zelfde klant en zelfde sjabloon, maximaal 8 (nieuwste eerst), met inhoud. Wordt gebruikt om de
// AI te laten afwijken en om gelijkenis te controleren. Een pagina die niet te laden is wordt overgeslagen.
const MAX_ZUSTERS = 8;
async function haalZusterPaginas(page, allePaginas) {
  const lijst = (allePaginas || await lpNotion.listPages({ klant: page.klant }))
    .filter((p) => p.id !== page.id && p.blueprint === page.blueprint)
    .slice(0, MAX_ZUSTERS);
  const geladen = await Promise.allSettled(lijst.map((p) => lpNotion.getPage(p.id)));
  return geladen.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

// Tekst op de achtergrond schrijven na het aanmaken van een pagina (een taak tegelijk, in het geheugen).
const autoTekstRij = maakWachtrij();
function startAutoTekst(pageId, opties) {
  const opnieuw = Boolean(opties && opties.opnieuw);
  return autoTekstRij.zet(pageId, async () => {
    const page = await lpNotion.getPage(pageId);
    if (!opnieuw && isContentIngevuld(page.content)) return;
    const r = await maakContentVoorstel(page, {});
    const slotData = r.slotData || {};
    await lpNotion.updateSection(pageId, 'content', { meta: { metaTitle: slotData.metaTitle || '', metaDescription: slotData.metaDescription || '' }, slotData });
    await zetStatusNaSchrijven(pageId);
  });
}
function isContentIngevuld(content) {
  const c = content || {};
  if (c.slotData) return Object.values(c.slotData).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean((v || '').toString().trim())));
  return Array.isArray(c.blocks) && c.blocks.length > 0;
}

// Maakt een content voorstel voor een pagina (AI, links, foto's). Slaat niets op.
async function maakContentVoorstel(page, { watGaatDezePaginaOver, ctaOverride } = {}) {
  const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
  if (blueprint.templateFormat !== 'slots') {
    throw new Error('AI-contentgeneratie is alleen beschikbaar voor sjablonen in het nieuwe (slot-gebaseerde) formaat.');
  }
  const invoer = page.invoer || {};
  const client = getLpClient(page.klant);
  const feitensheet = page.feitensheet || { gebruikt: [], extra: [] };
  const feitenById = new Map((client.feiten || []).map((f) => [f.id, f]));
  // Feiten met standaard: true staan bij een nog niet opgeslagen feitensheet vanzelf aan (feitenDefaults.js).
  const gebruikteFeiten = gebruikteFeitIds(page.feitensheet, client.feiten).map((id) => feitenById.get(id)).filter(Boolean);
  const feiten = [...gebruikteFeiten, ...(feitensheet.extra || [])];
  // Campagnepagina (24-10-2026): dezelfde route, zonder interne links, zoekvragen en AI-vragen (die horen bij SEO/GEO).
  const campagne = campagneKennis.campagneVan(page);

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
  let linkWarning = null;
  if (!campagne) try {
    const sitePaginas = await listSitePages({ profile: client.profile });
    siteKandidaten = sitePaginas
      .filter((p) => p.url)
      .map((p) => ({ label: p.titel || p.url, url: p.url, omschrijving: p.omschrijving || '', zusterpagina: false }));
    if (!siteKandidaten.length) {
      linkWarning = 'Geen gepubliceerde site-pagina\'s gevonden op de eigen WordPress-site — alleen zusterpagina\'s (indien aanwezig) zijn als linkkandidaat gebruikt.';
    }
  } catch (siteErr) {
    // Nooit de hele contentgeneratie blokkeren als dit misgaat (bv. WP-fout) — geen site-pagina's
    // als kandidaat is niet erger dan de oude situatie (alleen zusterpagina's). Wel zichtbaar
    // maken via linkWarning, zodat dit niet stilletjes onopgemerkt blijft zoals de eerste keer.
    linkWarning = `Site-pagina's ophalen bij WordPress is niet gelukt (${siteErr.message}) — alleen zusterpagina's (indien aanwezig) zijn als linkkandidaat gebruikt.`;
  }

  const linkKandidaten = campagne ? [] : [...zusterKandidaten, ...siteKandidaten];

  // Bronteksten van de hele klantsite (siteTeksten.js): de AI leest standaard alle echte pagina's van de website van de
  // klant, behalve onze eigen landingspagina's, en gebruikt die als hoofdbron. Nooit blokkerend: lukt het niet, dan
  // werkt de generatie met alleen de feiten en komt er een melding.
  let siteTekstWarning = null;
  let siteTeksten = '';
  try {
    const eigenUrls = allePaginas.map((p) => p.wpUrl).filter(Boolean);
    const site = await haalSiteTeksten({ url: (client.profile.bedrijf || {}).url, uitsluit: eigenUrls, voorkeur: (blueprint.focus && blueprint.focus.trefwoorden) || [], taal: client.profile.taal });
    siteTekstWarning = waarschuwingGefilterd(site.gefilterd);
    siteTeksten = formatSiteTekstenVoorPrompt(site);
    if (!siteTeksten) siteTekstWarning = `De teksten van de klantsite konden niet gelezen worden (${site.fout || 'geen pagina\'s gevonden'}), de tekst is alleen op de feiten gebaseerd en kan daardoor karig zijn.`;
  } catch (siteTekstErr) {
    siteTekstWarning = `De teksten van de klantsite konden niet gelezen worden (${siteTekstErr.message}), de tekst is alleen op de feiten gebaseerd en kan daardoor karig zijn.`;
  }

  const zusters = await haalZusterPaginas(page, allePaginas);

  // Echte zoekvragen (Google suggesties) en de vragen van zusterpagina's, zodat de FAQ niet op elke pagina gelijk is
  // (zoekvragen.js). Nooit blokkerend: zonder zoekvragen werkt de generatie gewoon door.
  const dienstTekst = invoer.dienstFocus || invoer.dienst || invoer.onderwerp || (blueprint.focus && blueprint.focus.onderwerp) || '';
  let zoekvragen = [];
  if (!campagne) try {
    zoekvragen = await haalZoekvragen({ diensten: dienstenUitTekst(dienstTekst), plaats: invoer.plaatsnaam });
  } catch (zoekErr) {
    zoekvragen = [];
  }
  // Vragen die AI assistenten (ChatGPT, Gemini) over deze klant krijgen, alleen als de Paginameting aan staat (die meting kost geld).
  let aiVragenAantal = 0;
  try {
    const instGen = campagne ? {} : await klantInstellingen(page.klant);
    if (instGen.paginameting) {
      const aiVragen = (await meting.haalAiVragen(client.profile.naam)).slice(0, 15);
      aiVragenAantal = aiVragen.length;
      zoekvragen = [...zoekvragen, ...aiVragen.map((v) => (typeof v === 'string' ? v : v && v.vraag)).filter(Boolean)];
    }
  } catch (aiErr) { /* de AI vragen zijn een extra bron, nooit blokkerend */ }
  const zusterVragen = [...new Set(zusters.flatMap((z) => (z.content ? vragenUitContent(z.content) : [])))];
  // Het goedgekeurde voorbeeld: de ingestelde pagina, anders een zusterpagina met het vinkje Voorbeeld in Notion, anders de meest recent bewerkte gepubliceerde.
  const metInhoud = zusters.filter((z) => z.content && z.content.slotData);
  // Eerst de voorbeeldpagina die in het portaal bij Klantgegevens voor dit sjabloon is ingesteld.
  const norm = (id) => String(id || '').replace(/-/g, '');
  const gekozenId = ((client.profile.voorbeeldPaginas || {})[page.blueprint]) || '';
  let gekozen = null;
  if (gekozenId && norm(gekozenId) !== norm(page.id)) {
    gekozen = metInhoud.find((z) => norm(z.id) === norm(gekozenId));
    if (!gekozen) {
      try { gekozen = await lpNotion.getPage(gekozenId); } catch (e) { gekozen = null; }
    }
    if (gekozen && !(gekozen.content && gekozen.content.slotData)) gekozen = null;
  }
  const voorbeeldPagina = gekozen
    || metInhoud.find((z) => z.voorbeeld)
    || metInhoud.filter((z) => z.status === 'Gepubliceerd').sort((a, b) => String(b.laatstGewijzigd).localeCompare(String(a.laatstGewijzigd)))[0]
    || null;
  // Leren van live pagina's (23-10-2026): het hoofdvoorbeeld bepaalt de opbouw, maximaal twee andere live pagina's laten de stijl zien.
  const voorbeeldLijst = leren.kiesVoorbeelden({ hoofd: voorbeeldPagina, kandidaten: metInhoud, paginaId: page.id });
  const voorbeeld = voorbeeldLijst.length
    ? { titel: voorbeeldLijst[0].titel, slotData: voorbeeldLijst[0].content.slotData, extra: voorbeeldLijst.slice(1).map((z) => ({ titel: z.titel, slotData: z.content.slotData })) }
    : null;
  const correcties = client.profile.correcties || [];

  watGaatDezePaginaOver = watGaatDezePaginaOver || onderwerpTekst(invoer, page.titel);
  const result = await ai.generatePageContent({
    klant: page.klant,
    template: blueprint,
    invoer,
    feiten,
    watGaatDezePaginaOver,
    ctaOverride,
    linkKandidaten,
    siteTeksten,
    zoekvragen,
    zusterVragen,
    klantverhaal: client.profile.klantverhaal,
    bedrijfsnaam: (client.profile.bedrijf || {}).naam || client.profile.naam,
    voorbeeld,
    correcties,
    campagne,
    campagneVoorkeuren: client.profile.campagneVoorkeuren || [],
    zusterInhoud: zusters.filter((z) => z.content && !voorbeeldLijst.some((v) => v.id === z.id)).map((z) => ({ titel: z.titel, tekst: verzamelTekst(z.content).join('\n').slice(0, 2500) }))
  });

  // Automatische redactieronde: de mechanische controle leest de nieuwe tekst en alleen de aangewezen onderdelen
  // worden een keer herschreven. Reviews en praktische gegevens blijven zoals ze zijn. Nooit blokkerend.
  let redactieWaarschuwing = null;
  try {
    const NIET_AANRAKEN = /^(reviewItems|practicalItems|projectItems)$/;
    const bepaal = (slotData) => redactiePunten({ content: { slotData }, invoer, titel: page.titel }, blueprint, client, voorbeeld && voorbeeld.slotData).punten
      .map((pt) => ({ ...pt, slots: (pt.slots || []).filter((k) => !NIET_AANRAKEN.test(k)) }))
      .filter((pt) => pt.slots.length && !(pt.soort === 'toon' && /^De bedrijfsnaam staat/.test(pt.tekst || '') && pt.slots.length < 2) && pt.soort !== 'bewijs');
    const kvRuw = client.profile.klantverhaal;
    let eerste = [];
    let rest = [];
    // Een campagnepagina is korter en moet snel klaar zijn: hooguit twee herschrijfrondes.
    const maxRondes = campagne ? 2 : 4;
    for (let ronde = 1; ronde <= maxRondes; ronde += 1) {
      const punten = bepaal(result.slotData).slice(0, 8);
      if (ronde === 1) eerste = punten;
      rest = punten;
      if (!punten.length) break;
      const slots = [...new Set(punten.flatMap((pt) => pt.slots))];
      const aanwijzing = punten.map((pt, i) => `${i + 1}. ${pt.aanwijzing || pt.tekst}`).join('\n')
        + '\nSchrijf de aangewezen onderdelen echt anders: een andere invalshoek en andere woorden dan de rest van de pagina. Kopieer geen zinnen van andere onderdelen.';
      const herschreven = await ai.herschrijfOnderdelen({
        klant: page.klant,
        template: blueprint,
        slotData: result.slotData,
        slots,
        aanwijzing,
        klantverhaal: kvRuw && kvRuw.status === 'goedgekeurd' ? kvRuw : null,
        bedrijfsnaam: (client.profile.bedrijf || {}).naam || client.profile.naam,
        feiten,
        siteTeksten,
        voorbeeld,
        correcties
      });
      result.slotData = herschreven.slotData;
      rest = bepaal(result.slotData);
    }
    // Harde poort: wat de herschrijfrondes niet oplosten en wat mechanisch te herstellen is (namen van personen),
    // gaat nooit door naar de klant. Zie scrubPersoonsnamen in tekstcontrole.js.
    if (client.profile.tekstControle !== false && (client.profile.schrijfvorm === 'derde' || client.profile.schrijfvorm === 'mix')) {
      const vervangen = scrubPersoonsnamen(result.slotData, { nietNoemen: client.profile.nietNoemen || [], bedrijfsnaam: (client.profile.bedrijf || {}).naam || client.profile.naam });
      if (vervangen) console.warn(`[redactie] ${vervangen} persoonsnaam/-namen mechanisch vervangen door de bedrijfsnaam`);
    }
    if (eerste.length) {
      redactieWaarschuwing = rest.length
        ? `De tekst is automatisch nagelopen en herschreven. Er ${rest.length === 1 ? 'blijft 1 punt' : `blijven ${rest.length} punten`} over, zie de controle.`
        : `De tekst is automatisch nagelopen op herhaling en toon en ${eerste.length} ${eerste.length === 1 ? 'punt is' : 'punten zijn'} herschreven.`;
    }
  } catch (redErr) {
    console.warn('[redactie] automatische ronde mislukt:', redErr.message);
  }

  let imageWarning = null;
  try {
    zorgVoorProjectItems(blueprint, result.slotData);
    const { items: kandidaten } = await searchMedia({ profile: client.profile, perPage: 100 });
    const { picks } = await ai.pickImagesForPage({
      template: blueprint,
      invoer,
      feiten,
      watGaatDezePaginaOver,
      fotoRichtlijn: client.profile.fotoRichtlijn,
      kandidaten,
      slotData: result.slotData
    });
    for (const [slotKey, pick] of Object.entries(picks || {})) {
      if (pick && pick.url) {
        setNestedSlotValue(result.slotData, slotKey, pick.url);
        const altKey = deriveImageAltKey(slotKey);
        if (pick.alt && altKey) setNestedSlotValue(result.slotData, altKey, pick.alt);
      }
    }
  } catch (imgErr) {
    imageWarning = `Automatisch afbeeldingen kiezen is niet gelukt (${imgErr.message}) — vul afbeeldingen zelf in via het voorbeeldscherm.`;
  }
  // Projecten van de klantsite: echte titels, foto's en links in plaats van losse foto's (22-10-2026).
  try {
    const plaatsNaam = String(gelijk.plaatsWaarde(invoer) || '').toLowerCase();
    const plaatsDelen = verhaal.woorden(plaatsNaam);
    const onderwerp = verhaal.woorden([invoer.dienstFocus, invoer.dienst, invoer.onderwerp, page.titel].filter(Boolean).join(' ')).filter((w) => !plaatsDelen.includes(w));
    const lijsten = projectLijsten(blueprint);
    if (lijsten.length && client.profile.projectenVanSite !== false) {
      const gekozen = kiesProjecten(await haalProjecten(client.profile), { onderwerpWoorden: onderwerp, plaats: plaatsNaam, max: 3 });
      if (gekozen.length) {
        let teksten = {};
        try { teksten = await ai.schrijfProjectTeksten({ klant: page.klant, bedrijfsnaam: (client.profile.bedrijf || {}).naam || client.profile.naam, projecten: gekozen }); } catch (e) { console.warn('[projecten] teksten schrijven mislukt:', e.message); }
        const derde = client.profile.schrijfvorm === 'derde';
        if (derde) {
          const WIJ_RE = /\b(wij|we|ons|onze|jullie|hij|hem)\b/i;
          Object.keys(teksten).forEach((id) => { if (WIJ_RE.test(teksten[id])) delete teksten[id]; });
        }
        if (client.profile.schrijfvorm === 'mix') Object.keys(teksten).forEach((id) => { if (/\b(hij|hem|ik)\b/i.test(teksten[id])) delete teksten[id]; });
        lijsten.forEach((slot) => vulProjectItems(slot, result.slotData, gekozen, teksten));
        if (derde || client.profile.schrijfvorm === 'mix') scrubPersoonsnamen(result.slotData, { nietNoemen: client.profile.nietNoemen || [], bedrijfsnaam: (client.profile.bedrijf || {}).naam || client.profile.naam });
      }
    }
  } catch (projErr) {
    console.warn('[projecten] niet gelukt:', projErr.message);
  }
  ruimOpProjectItems(blueprint, result.slotData, { fotoKaartenToestaan: client.profile.fotoKaartenZonderTekst !== false });

  // Controle op dubbele vragen: vragen die (zonder plaatsnaam) vrijwel gelijk zijn aan een vraag van een zusterpagina.
  let faqWarning = null;
  const eigenVragen = vragenUitContent({ slotData: result.slotData });
  const plaatsen = [invoer.plaatsnaam, ...zusters.map((z) => (z.invoer || {}).plaatsnaam)].filter(Boolean);
  const dubbel = vindDubbeleVragen({ vragen: eigenVragen, zusterVragen, plaatsen });
  if (dubbel.length) {
    faqWarning = `${dubbel.length === 1 ? 'Een veelgestelde vraag lijkt' : `${dubbel.length} veelgestelde vragen lijken`} sterk op een vraag van een zusterpagina (${dubbel.slice(0, 3).map((d) => `"${d.vraag}"`).join(', ')}). Pas ze aan zodat elke pagina eigen vragen heeft.`;
  }
  const zoekvragenAantal = zoekvragen.length - aiVragenAantal;
  // Zichtbaar maken als er geen echte zoekvragen waren, zodat dit niet stil misgaat (de bron is een publieke dienst).
  const zoekvragenWarning = !campagne && dienstTekst && !zoekvragenAantal
    ? 'Er konden geen echte zoekvragen worden opgehaald, de vragen zijn alleen uit de site en de feiten opgesteld.'
    : null;

  // Onboarding: zonder goedgekeurd klantverhaal schrijft de AI nog steeds, maar de pagina wordt minder persoonlijk.
  const kv = client.profile.klantverhaal;
  const klantverhaalWarning = kv && kv.status === 'goedgekeurd'
    ? null
    : (kv
      ? 'Het klantverhaal van deze klant is nog niet goedgekeurd, dus de AI gebruikt het niet. Keur het goed bij Klantgegevens.'
      : 'Deze klant heeft nog geen klantverhaal. Zonder klantverhaal klinkt de tekst minder persoonlijk en herhaalt hij sneller. Maak het bij Klantgegevens met "Analyseer klantverhaal".');
  return { ...result, imageWarning, linkWarning, siteTekstWarning, faqWarning, zoekvragenAantal, zoekvragenWarning, klantverhaalWarning, redactieWaarschuwing };
}

router.post('/pages/:pageId/auto-tekst', requireLpInternal, async (req, res) => {
  try {
    await lpNotion.getPage(req.params.pageId);
    startAutoTekst(req.params.pageId, { opnieuw: Boolean((req.body || {}).opnieuw) });
    res.json({ tekstStatus: autoTekstRij.status(req.params.pageId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/pages/:pageId/generate-content', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const { watGaatDezePaginaOver, ctaOverride } = req.body || {};
    res.json(await maakContentVoorstel(page, { watGaatDezePaginaOver, ctaOverride }));
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
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const content = page.content;
    if (contentIsEmpty(blueprint, content)) {
      return res.json({ html: '<p style="font-family:sans-serif;padding:2rem;color:#666;">Nog geen content JSON ingevuld.</p>' });
    }
    const html = renderPageHtml(buildRenderPage({ blueprint, content, clientId: page.klant, slug: page.slug, invoer: page.invoer }), { forPreview: true });
    const verborgen = berekenOverrides({ htmlTemplate: blueprint.htmlTemplate, slotData: content.slotData, overrides: content.overrides });
    res.json({ html: wrapPreviewDoc(html), overrides: { aantalVerborgen: verborgen.aantalVerborgen, waarschuwingen: verborgen.waarschuwingen, legeSecties: verborgen.legeMeldingen } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Onderdeel van deze pagina verbergen of weer tonen (kaart uit een lijst, of een hele sectie). Raakt
// alleen de pagina zelf aan (overrides in de content JSON), nooit het sjabloon. Zie src/lp/overrides.js.
router.post('/pages/:pageId/verberg', requireLpInternal, async (req, res) => {
  try {
    const { type, lijst, index, verborgen } = req.body || {};
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    if (contentIsEmpty(blueprint, page.content)) {
      return res.status(400).json({ error: 'Er is nog geen content om onderdelen van te verbergen.' });
    }
    const content = zetVerborgen({ content: page.content, htmlTemplate: blueprint.htmlTemplate, type, lijst, index, verborgen });
    const saved = await lpNotion.updateSection(req.params.pageId, 'content', content);
    res.json({ content: saved.content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Andere foto's kiezen voor een lijst (bijvoorbeeld de projecten): de AI kiest opnieuw uit de mediabibliotheek en slaat
// de foto's over die er nu al staan. Past er niets anders, dan blijft alles zoals het was.
router.post('/pages/:pageId/kies-fotos', requireLpInternal, async (req, res) => {
  try {
    const lijst = String((req.body || {}).lijst || '');
    if (!/^[\w.]+$/.test(lijst)) return res.status(400).json({ error: 'Ongeldige lijst.' });
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const content = page.content || {};
    const slotData = JSON.parse(JSON.stringify(content.slotData || {}));
    const client = getLpClient(page.klant);
    const slots = ai.getImageSlots(blueprint, slotData).filter((sl) => sl.key.startsWith(lijst + '.'));
    if (!slots.length) return res.status(400).json({ error: 'In deze sectie zijn geen foto\'s om te wisselen.' });
    const nu = new Set(slots.map((sl) => getNestedSlotValue(slotData, sl.key)).filter(Boolean));
    const { items } = await searchMedia({ profile: client.profile, perPage: 100 });
    const kandidaten = items.filter((k) => !nu.has(k.url));
    const inv = page.invoer || {};
    const { picks } = await ai.pickImagesForPage({
      template: blueprint, invoer: inv, feiten: [], watGaatDezePaginaOver: inv._watGaatDezePaginaOver || onderwerpTekst(inv, page.titel),
      fotoRichtlijn: client.profile.fotoRichtlijn, kandidaten, slotData, afbeeldingSlots: slots
    });
    let gewisseld = 0;
    for (const [slotKey, pick] of Object.entries(picks || {})) {
      if (pick && pick.url) {
        setNestedSlotValue(slotData, slotKey, pick.url);
        const altKey = deriveImageAltKey(slotKey);
        if (pick.alt && altKey) setNestedSlotValue(slotData, altKey, pick.alt);
        gewisseld += 1;
      }
    }
    if (!gewisseld) return res.json({ gewisseld: 0, melding: 'De AI vond geen betere foto\'s in de mediabibliotheek van de klant. Upload passende foto\'s of verberg de sectie.' });
    await lpNotion.updateSection(req.params.pageId, 'content', { ...content, slotData });
    res.json({ gewisseld });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Controleert de content JSON tegen de blueprint-regels. Blokkeert niet zelf
// — /publish doet dat door dezelfde check voor de WordPress-push te draaien.
router.get('/pages/:pageId/validate', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const result = validatePage({ blueprint, contentJson: page.content || {} });
    // Extra SEO en GEO waarschuwingen voor pagina's die op elkaar lijken (blokkeert nooit).
    try {
      const extra = await seoWaarschuwingen(page);
      result.warnings = [...(result.warnings || []), ...extra];
    } catch (e) { /* een fout in deze extra controle mag de validatie nooit blokkeren */ }
    try {
      result.warnings = [...(result.warnings || []), ...redactiePunten(page, blueprint, getLpClient(page.klant)).punten.map((p) => p.tekst)];
    } catch (e) { /* de redactiecheck mag de validatie nooit blokkeren */ }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// De controle in een keer, met een oplossing per punt. Het scherm roept dit vanzelf aan zodra de tekst klaar is.
router.get('/pages/:pageId/controle', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const result = validatePage({ blueprint, contentJson: page.content || {} });
    let seo = [];
    try {
      seo = await seoWaarschuwingen(page);
      result.warnings = [...(result.warnings || []), ...seo];
    } catch (e) { /* extra controle mag de rest nooit blokkeren */ }
    // Past het uitgevoerde werk bij het onderwerp? Met een oplossing: sectie verbergen of andere foto's kiezen.
    const extraPunten = [];
    try {
      const inv = page.invoer || {};
      const plaatsen = [gelijk.plaatsWaarde(inv)].filter(Boolean);
      const onderwerpTeksten = [inv._watGaatDezePaginaOver, inv.dienstFocus, inv.dienst, inv.onderwerp, blueprint.focus && blueprint.focus.onderwerp].filter(Boolean);
      onderwerpFit({ slotData: (page.content || {}).slotData, htmlTemplate: blueprint.htmlTemplate, onderwerpTeksten, plaatsen }).forEach((f) => {
        const acties = [];
        if (f.sectieIndex != null) acties.push({ type: 'verberg', label: 'Verberg deze sectie', sectie: f.sectieIndex });
        acties.push({ type: 'fotos', label: 'Kies andere foto\'s', lijst: f.lijst });
        extraPunten.push({ tekst: f.tekst, acties, sectieIndex: f.sectieIndex });
      });
    } catch (e) { /* extra controle mag de rest nooit blokkeren */ }
    // Redactiecheck: persoonlijk, geen herhaling, bewijs aanwezig. Elk punt met een knop om alleen dat onderdeel te herschrijven.
    try {
      const klant = getLpClient(page.klant);
      const { punten, klantverhaalGoedgekeurd } = redactiePunten(page, blueprint, klant);
      punten.forEach((p) => extraPunten.push({ tekst: p.tekst, acties: [{ type: 'herschrijf', label: 'Herschrijf dit onderdeel', slots: p.slots, aanwijzing: p.aanwijzing }], sectieIndex: null }));
      if (!klantverhaalGoedgekeurd) extraPunten.push({ tekst: 'Voor deze klant is nog geen goedgekeurd klantverhaal. Daardoor is de tekst minder persoonlijk en herhaalt hij sneller. Maak en keur het goed bij Klantgegevens.', acties: [], sectieIndex: null });
    } catch (e) { /* extra controle mag de rest nooit blokkeren */ }
    const gelijkenisGemeld = seo.some((w) => /lijkt voor \d+% op/.test(w));
    const zusterAantal = (await haalZusterPaginas(page)).length;
    const inOrde = inOrdePunten({ content: { slotData: (page.content || {}).slotData }, validatie: result, zusterAantal, gelijkenisGemeld });
    res.json({ ...maakControle(result, { extraPunten, inOrde }), site: siteNaam(getLpClient(page.klant).profile) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// Stap 3 van de verhaallijn (19-10-2026): de redactiecheck. Mechanisch (geen AI): herhaling, je of u, bedrijfsnaam,
// lege woorden, claims die niet bruikbaar zijn, een afstandelijke intro en ontbrekend bewijs. Elk punt wijst naar de onderdelen
// die herschreven kunnen worden.
function redactiePunten(page, blueprint, client, voorbeeldSlotData) {
  const slotData = (page.content || {}).slotData || {};
  const kvRuw = client.profile.klantverhaal;
  const kv = kvRuw && kvRuw.status === 'goedgekeurd' ? kvRuw : null;
  const inv = page.invoer || {};
  const bedrijf = client.profile.bedrijf || {};
  const onderwerpWoorden = verhaal.woorden([inv.dienstFocus, inv.dienst, inv.onderwerp, inv._watGaatDezePaginaOver, page.titel].filter(Boolean).join(' '));
  const punten = verhaal.redactieControle(slotData, {
    bedrijfsnaam: bedrijf.naam || client.profile.naam,
    plaats: gelijk.plaatsWaarde(inv),
    onderwerpWoorden,
    aanspreekvorm: kv && kv.stem ? kv.stem.aanspreekvorm : null,
    derdePersoon: client.profile.schrijfvorm === 'derde',
    mix: client.profile.schrijfvorm === 'mix',
    nietGebruiken: kv ? kv.nietGebruiken : []
  });
  punten.push(...verhaal.ontbrekendBewijs(blueprint, slotData, kvRuw));
  // Harde tekstcontrole (hij, Wie, getallen buiten de feiten, claims, reviews). Zie src/lp/tekstcontrole.js.
  // Standaard aan voor elke klant. Bestaande klanten (roots, macbouw) staan met tekstControle: false in hun profiel op uit.
  if (client.profile.tekstControle !== false) {
    const feitenById = new Map((client.feiten || []).map((f) => [f.id, f]));
    const feitenLijst = [...gebruikteFeitIds(page.feitensheet, client.feiten).map((id) => feitenById.get(id)).filter(Boolean), ...(((page.feitensheet || {}).extra) || [])];
    // De harde punten staan vooraan: ze worden altijd als eerste herschreven en vallen nooit buiten de lijst.
    punten.unshift(...tekstControle(slotData, {
      derdePersoon: client.profile.schrijfvorm === 'derde',
      mix: client.profile.schrijfvorm === 'mix',
      bedrijfsnaam: bedrijf.naam || client.profile.naam,
      template: blueprint,
      voorbeeldSlotData,
      nietNoemen: client.profile.nietNoemen || [],
      toegestaneTekst: JSON.stringify([feitenLijst, client.feiten || [], inv, client.profile.bedrijf || {}]),
      reviewsBevestigd: client.profile.reviewsBevestigd !== false
    }));
  }
  return { punten, klantverhaalGoedgekeurd: Boolean(kv), klantverhaal: kv };
}

router.post('/pages/:pageId/redactie-check', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const client = getLpClient(page.klant);
    const slotData = (page.content || {}).slotData;
    if (!slotData || !Object.keys(slotData).length) return res.status(400).json({ error: 'Deze pagina heeft nog geen tekst om te controleren.' });
    const { punten: mechanisch, klantverhaal } = redactiePunten(page, blueprint, client);
    const punten = await ai.redactieReview({
      klant: client.profile.naam,
      template: blueprint,
      slotData,
      klantverhaal,
      bedrijfsnaam: (client.profile.bedrijf || {}).naam || client.profile.naam,
      alGevonden: mechanisch.map((p) => p.tekst)
    });
    res.json({ punten, aantalMechanisch: mechanisch.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Herschrijft alleen de aangewezen onderdelen van een pagina. De rest blijft zoals hij is. Slaat het resultaat op.
router.post('/pages/:pageId/herschrijf', requireLpInternal, async (req, res) => {
  try {
    const { slots, aanwijzing } = req.body || {};
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const client = getLpClient(page.klant);
    const content = page.content || {};
    if (!content.slotData || !Object.keys(content.slotData).length) return res.status(400).json({ error: 'Deze pagina heeft nog geen tekst.' });
    const feitensheet = page.feitensheet || { gebruikt: [], extra: [] };
    const feitenById = new Map((client.feiten || []).map((f) => [f.id, f]));
    const feiten = [...gebruikteFeitIds(page.feitensheet, client.feiten).map((id) => feitenById.get(id)).filter(Boolean), ...(feitensheet.extra || [])];
    let siteTeksten = '';
    try {
      const site = await haalSiteTeksten({ url: (client.profile.bedrijf || {}).url, uitsluit: [page.wpUrl].filter(Boolean), taal: client.profile.taal });
      siteTeksten = formatSiteTekstenVoorPrompt(site);
    } catch (e) { siteTeksten = ''; }
    const kvRuw = client.profile.klantverhaal;
    const r = await ai.herschrijfOnderdelen({
      klant: page.klant,
      template: blueprint,
      slotData: content.slotData,
      slots,
      aanwijzing,
      klantverhaal: kvRuw && kvRuw.status === 'goedgekeurd' ? kvRuw : null,
      bedrijfsnaam: (client.profile.bedrijf || {}).naam || client.profile.naam,
      feiten,
      siteTeksten,
      correcties: client.profile.correcties || []
    });
    await lpNotion.updateSection(page.id, 'content', { ...content, slotData: r.slotData });
    res.json({ slotData: r.slotData, gewijzigd: r.gewijzigd });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Zet pagina's op Gepubliceerd als WordPress ze echt live heeft, ook als je daar zelf hebt gepubliceerd.
async function syncLiveStatus(klant) {
  const client = getLpClient(klant);
  const lijst = (await lpNotion.listPages({ klant })).filter((p) => p.wpPaginaId && p.status !== 'Gepubliceerd');
  if (!lijst.length) return { gecontroleerd: 0, nieuwLive: [] };
  const statussen = await haalPaginaStatussen({ profile: client.profile, ids: lijst.map((p) => p.wpPaginaId) });
  const nieuwLive = [];
  for (const p of lijst) {
    if (statussen[p.wpPaginaId] === 'publish') {
      await lpNotion.setStatus(p.id, 'Gepubliceerd');
      nieuwLive.push({ id: p.id, titel: p.titel });
    }
  }
  return { gecontroleerd: lijst.length, nieuwLive };
}

router.post('/plan/live-sync', requireLpInternal, async (req, res) => {
  try {
    const klant = String((req.body || {}).klant || '');
    if (!klant) return res.status(400).json({ error: 'klant is verplicht.' });
    res.json(await syncLiveStatus(klant));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Veelgestelde vragen die vrijwel gelijk zijn aan een vraag van een zusterpagina (bij het schrijven werd dit alleen
// kort getoond, nu zit het ook in de controle). De vraag of het bedrijf in deze plaats werkt mag wel gelijk zijn.
function faqWaarschuwingen(page, zusters) {
  const eigen = vragenUitContent(page.content || {});
  const zusterVragen = [...new Set((zusters || []).flatMap((z) => (z.content ? vragenUitContent(z.content) : [])))];
  if (!eigen.length || !zusterVragen.length) return [];
  const plaatsen = [gelijk.plaatsWaarde(page.invoer), ...(zusters || []).map((z) => gelijk.plaatsWaarde(z.invoer))].filter(Boolean);
  return vindDubbeleVragen({ vragen: eigen, zusterVragen, plaatsen }).map((d) => `De veelgestelde vraag "${d.vraag}" lijkt sterk op een vraag van een andere pagina ("${d.zusterVraag}"). Elke pagina hoort eigen vragen te hebben, anders lijkt de FAQ op die van de zusterpagina's.`);
}

async function seoWaarschuwingen(page) {
  const uit = [];
  const client = getLpClient(page.klant);
  const plaats = gelijk.plaatsWaarde(page.invoer);
  const zusters = await haalZusterPaginas(page);
  const heeftContent = page.content && Object.keys(page.content.slotData || {}).length;
  if (plaats) {
    const werkgebied = [
      ...((client.profile && client.profile.bedrijf && client.profile.bedrijf.werkgebied) || []),
      ...((client.feiten || []).filter((f) => /werkgebied/i.test(f.label || '')).map((f) => f.waarde))
    ].join(' ; ');
    const w = gelijk.werkgebiedWaarschuwing(plaats, werkgebied);
    if (w) uit.push(w);
    if (zusters.length && !gelijk.heeftLokaleGegevens(page.feitensheet)) {
      uit.push(`Bij deze pagina staan geen lokale gegevens voor ${plaats} (extra feit met label "Lokale informatie"). Zonder eigen lokale feiten wordt de tekst al snel een variant van de andere plaatsen.`);
    }
  }
  if (heeftContent) {
    uit.push(...gelijk.gelijkenisWaarschuwingen(page, zusters));
    uit.push(...gelijk.restantWaarschuwingen(page, zusters));
    uit.push(...faqWaarschuwingen(page, zusters));
  }
  return uit;
}

// Pagina dupliceren. modus 'opzet' (standaard): invoer en feitensheet mee, tekst opnieuw schrijven.
// modus 'kopieer': ook de tekst mee, met de oude plaatsnaam vervangen. WordPress link, deellink en status worden
// nooit overgenomen (nieuwe pagina start als "Formulier ingevuld").
async function maakKopie(origineel, opties) {
  const kopie = bouwKopie(origineel, opties);
  // Een pagina met een eigen sjabloon (gebouwd met chat) neemt dat sjabloon mee, zonder het gesprek.
  const eigen = origineel.sjabloon && origineel.sjabloon.blueprint ? { blueprint: origineel.sjabloon.blueprint, berichten: [] } : undefined;
  const nieuw = await lpNotion.createPage({ klant: kopie.klant, blueprint: kopie.blueprint, titel: kopie.titel, slug: kopie.slug, invoer: kopie.invoer, sjabloon: eigen });
  if (kopie.feitensheet) await lpNotion.updateSection(nieuw.id, 'feitensheet', kopie.feitensheet);
  if (kopie.content) await lpNotion.updateSection(nieuw.id, 'content', kopie.content);
  return { kopie, id: nieuw.id };
}

router.post('/pages/:pageId/dupliceer', requireLpInternal, async (req, res) => {
  try {
    const { titel, slug, invoer, modus, lokaleGegevens } = req.body || {};
    const origineel = await lpNotion.getPage(req.params.pageId);
    const { id, kopie } = await maakKopie(origineel, { titel, slug, invoer, modus, lokaleGegevens });
    const page = await lpNotion.getPage(id);
    res.json({ page, modus: kopie.modus });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Meerdere plaatsen tegelijk. Per plaats een kopie in modus 'opzet'; met schrijfMeteen laat de server ook de AI de
// tekst schrijven en slaat die op (concept, nog niet naar WordPress). Een plaats die mislukt stopt de rest niet.
router.post('/pages/:pageId/dupliceer-meerdere', requireLpInternal, async (req, res) => {
  try {
    const { plaatsen, plaatsSleutel, schrijfMeteen, lokaleGegevens } = req.body || {};
    const namen = [...new Set((Array.isArray(plaatsen) ? plaatsen : String(plaatsen || '').split(/\r?\n/)).map((n) => String(n).trim()).filter(Boolean))].slice(0, 15);
    if (!namen.length) return res.status(400).json({ error: 'Geef minstens een plaats op.' });
    const origineel = await lpNotion.getPage(req.params.pageId);
    const sleutel = plaatsSleutel || Object.keys(origineel.invoer || {}).find((k) => !k.startsWith('_') && gelijk.PLAATS_SLEUTEL_RE.test(k));
    if (!sleutel) return res.status(400).json({ error: 'Deze pagina heeft geen invoerveld voor een plaats, gebruik "Dupliceer pagina" en pas de invoer zelf aan.' });
    const oudePlaats = gelijk.plaatsWaarde(origineel.invoer);
    const { titelVoorPlaats } = require('../lp/dupliceer');
    const resultaten = [];
    for (const naam of namen) {
      try {
        const { id } = await maakKopie(origineel, {
          titel: titelVoorPlaats(origineel.titel, oudePlaats, naam),
          invoer: { [sleutel]: naam },
          modus: 'opzet',
          lokaleGegevens: (lokaleGegevens && lokaleGegevens[naam]) || ''
        });
        const r = { plaats: naam, id, geschreven: false };
        if (schrijfMeteen) {
          try {
            const nieuw = await lpNotion.getPage(id);
            const voorstel = await maakContentVoorstel(nieuw, {});
            await lpNotion.updateSection(id, 'content', { meta: { metaTitle: voorstel.slotData.metaTitle || '', metaDescription: voorstel.slotData.metaDescription || '' }, slotData: voorstel.slotData, overrides: {} });
            r.geschreven = true;
            r.waarschuwingen = [voorstel.imageWarning, voorstel.linkWarning, voorstel.siteTekstWarning, voorstel.iconWarning, voorstel.klantverhaalWarning, voorstel.planWaarschuwing].filter(Boolean);
          } catch (e) {
            r.fout = `Pagina is aangemaakt, maar de tekst schrijven mislukte: ${e.message}`;
          }
        }
        resultaten.push(r);
      } catch (e) {
        resultaten.push({ plaats: naam, fout: e.message });
      }
    }
    res.json({ resultaten });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Zet de pagina als CONCEPT in WordPress (nooit live, zie src/lp/wordpress.js
// en het harde uitgangspunt "nooit automatisch publiceren" in besluiten.md).
// Weigert als de validator fouten geeft.
// Wat er recent is verwijderd, zodat het met een klik terug kan (in het geheugen; Notion bewaart de pagina's zelf 30 dagen).
const onlangsVerwijderd = [];

async function verwijderPagina(id) {
  const page = await lpNotion.getPage(id);
  // Als de pagina ooit naar WordPress gepusht is (concept of live), eerst
  // daar verwijderen (naar de WordPress-prullenbak, zie wordpress.js). Lukt
  // dat niet, dan stoppen we hier en laten we de Notion-pagina met rust,
  // liever een duidelijke foutmelding dan een weespagina in WordPress.
  if (page.wpPaginaId) {
    const client = getLpClient(page.klant);
    await deleteWpPage({ profile: client.profile, wpPaginaId: page.wpPaginaId });
  }
  await lpNotion.deletePage(id);
  onlangsVerwijderd.unshift({ id, titel: page.titel, klant: page.klant, wpPaginaId: page.wpPaginaId || null, op: Date.now() });
  onlangsVerwijderd.length = Math.min(onlangsVerwijderd.length, 30);
}

router.delete('/pages/:pageId', requireLpInternal, async (req, res) => {
  try {
    await verwijderPagina(req.params.pageId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/pages/verwijder-meerdere', requireLpInternal, async (req, res) => {
  if (!Array.isArray(req.body?.ids) || !req.body.ids.length) return res.status(400).json({ error: 'Kies eerst minstens een pagina.' });
  res.json(await verwijderMeerdere(req.body.ids, verwijderPagina));
});

router.post('/pages/:pageId/publish', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const content = page.content;
    if (contentIsEmpty(blueprint, content)) {
      return res.status(400).json({ error: 'Geen content JSON om te publiceren.' });
    }
    const validation = validatePage({ blueprint, contentJson: content });
    if (!validation.ok) {
      return res.status(400).json({ error: 'Validatie faalt, nog niet gepubliceerd.', validation });
    }
    const client = getLpClient(page.klant);
    const html = renderPageHtml(buildRenderPage({ blueprint, content, clientId: page.klant, slug: page.slug, invoer: page.invoer }), { forWordPress: true });
    const slotData = (content && content.slotData) || {};
    const result = await pushDraft({
      profile: client.profile,
      wpPaginaId: page.wpPaginaId || undefined,
      titel: page.titel,
      html,
      slug: page.slug,
      metaTitel: slotData.metaTitle,
      metaBeschrijving: slotData.metaDescription
    });
    await lpNotion.setWordpressInfo(req.params.pageId, { wpPaginaId: result.id, wpUrl: result.link });
    await lpNotion.setStatus(req.params.pageId, 'Ter review');
    const updated = await lpNotion.getPage(req.params.pageId);
    res.json({ page: updated, validation, seo: result.seo });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Zet een pagina live in WordPress. Gooit een Error met een duidelijke melding als de controle faalt of WordPress het weigert.
async function zetPaginaLive(pageId) {
  const page = await lpNotion.getPage(pageId);
  const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
  const content = page.content;
  if (contentIsEmpty(blueprint, content)) throw new Error('Geen content om live te zetten.');
  const validation = validatePage({ blueprint, contentJson: content });
  if (!validation.ok) {
    const err = new Error('De controle heeft nog fouten, de pagina is niet live gezet.');
    err.validation = validation;
    throw err;
  }
  const client = getLpClient(page.klant);
  const html = renderPageHtml(buildRenderPage({ blueprint, content, clientId: page.klant, slug: page.slug, invoer: page.invoer }), { forWordPress: true });
  const slotData = (content && content.slotData) || {};
  const result = await pushDraft({
    profile: client.profile,
    wpPaginaId: page.wpPaginaId || undefined,
    titel: page.titel,
    html,
    slug: page.slug,
    metaTitel: slotData.metaTitle,
    metaBeschrijving: slotData.metaDescription,
    status: 'publish'
  });
  await lpNotion.setWordpressInfo(pageId, { wpPaginaId: result.id, wpUrl: result.link });
  if (result.status !== 'publish') {
    throw new Error(`WordPress zette de pagina niet live (status: ${result.status || 'onbekend'}). Controleer in WordPress.`);
  }
  await lpNotion.setStatus(pageId, 'Gepubliceerd');
  return { page: await lpNotion.getPage(pageId), seo: result.seo };
}

// Zet een pagina live in WordPress. Alleen na een bewuste klik: bevestigd moet true zijn, de pagina moet de
// controle halen (geen fouten). Besluit 16-10-2026: live zetten kan vanuit het portaal. Sinds 23-10-2026 kan het ook
// in bulk voor schone pagina's (zie hieronder) en, per klant met schakelaar, automatisch na het schrijven.
router.post('/pages/:pageId/zet-live', requireLpInternal, async (req, res) => {
  try {
    if ((req.body || {}).bevestigd !== true) return res.status(400).json({ error: 'Live zetten kan alleen met een bewuste klik.' });
    res.json(await zetPaginaLive(req.params.pageId));
  } catch (err) {
    res.status(400).json({ error: err.message, ...(err.validation ? { validation: err.validation } : {}) });
  }
});

// ---- Klaar voor live (23-10-2026) ----
// De controle van een pagina als geheel: is hij schoon? Gebruikt dezelfde controles als het scherm Controleren.
async function beoordeelPagina(page) {
  const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
  const content = page.content;
  const client = getLpClient(page.klant);
  if (contentIsEmpty(blueprint, content)) return beslisKlaar({ contentLeeg: true });
  const validatie = zonderMetaLengte(validatePage({ blueprint, contentJson: content }));
  let punten = [];
  try { punten = redactiePunten(page, blueprint, client).punten; } catch (e) { /* een fout in de redactiecheck telt niet als schoon */ return beslisKlaar({ validatieFouten: ['De redactiecheck kon niet draaien.'] }); }
  let fitPunten = [];
  try {
    const inv = page.invoer || {};
    const plaatsen = [gelijk.plaatsWaarde(inv)].filter(Boolean);
    const onderwerpTeksten = [inv._watGaatDezePaginaOver, inv.dienstFocus, inv.dienst, inv.onderwerp, blueprint.focus && blueprint.focus.onderwerp].filter(Boolean);
    fitPunten = onderwerpFit({ slotData: (content || {}).slotData, htmlTemplate: blueprint.htmlTemplate, onderwerpTeksten, plaatsen });
  } catch (e) { /* extra controle blokkeert niet */ }
  return beslisKlaar({ validatieFouten: validatie.errors, punten, fitPunten });
}

// Na het schrijven: schone pagina wordt Klaar voor live, de rest blijft Content klaar (Ter controle). Heeft de klant de
// schakelaar automatisch live aan en genoeg live pagina's, dan gaat een schone pagina meteen live. Mislukt iets, dan Content klaar.
async function zetStatusNaSchrijven(pageId) {
  let klaar = false;
  try {
    const page = await lpNotion.getPage(pageId);
    klaar = (await beoordeelPagina(page)).klaar;
    await lpNotion.setStatus(pageId, klaar ? STATUS_KLAAR : 'Content klaar');
    if (!klaar) return;
    const client = getLpClient(page.klant);
    if (client.profile.autoLive !== true) return;
    const aantalLive = (await lpNotion.listPages({ klant: page.klant })).filter((p) => p.status === 'Gepubliceerd').length;
    if (autoLiveToegestaan(client.profile, aantalLive)) {
      await zetPaginaLive(pageId);
      console.log(`[auto-live] ${page.titel} (${page.klant}) is automatisch live gezet`);
    }
  } catch (err) {
    console.warn('[klaar-voor-live] status bepalen mislukt:', err.message);
    try { if (!klaar) await lpNotion.setStatus(pageId, 'Content klaar'); } catch (e) { /* niets meer te doen */ }
  }
}

// Alle schone pagina's van een klant in een keer live zetten. Elke pagina wordt opnieuw gecontroleerd vlak voor het live gaat.
router.post('/clients/:clientId/zet-schone-live', requireLpInternal, async (req, res) => {
  try {
    if ((req.body || {}).bevestigd !== true) return res.status(400).json({ error: 'Live zetten kan alleen met een bewuste klik.' });
    const lijst = (await lpNotion.listPages({ klant: req.params.clientId })).filter((p) => p.status === STATUS_KLAAR);
    const uitkomst = { gelukt: [], overgeslagen: [], fouten: [] };
    for (const p of lijst) {
      try {
        const page = await lpNotion.getPage(p.id);
        const b = await beoordeelPagina(page);
        if (!b.klaar) {
          await lpNotion.setStatus(p.id, 'Content klaar');
          uitkomst.overgeslagen.push({ titel: p.titel, reden: b.redenen[0] || 'De controle vond een punt.' });
          continue;
        }
        await zetPaginaLive(p.id);
        uitkomst.gelukt.push({ titel: p.titel });
      } catch (err) {
        uitkomst.fouten.push({ titel: p.titel, fout: err.message });
      }
    }
    res.json(uitkomst);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Tekst vervangen bij alle pagina's van een klant (13-10-2026) ----
// Stap 1 (zoek): welke pagina's van de klant bevatten deze tekst? Past niets aan. Het scherm toont de lijst met de
// echte WordPress status per pagina, zodat Dylan ziet welke pagina's live staan.
// Stap 2 (per pagina): vervangen, opslaan in Notion en (optioneel) opnieuw naar WordPress sturen. Het scherm roept
// dit pagina voor pagina aan, zodat een verzoek nooit te lang duurt en een fout bij een pagina de rest niet stopt.
// Een metatitel of metabeschrijving die iets te kort of te lang is blokkeert bij het in bulk bijwerken niets meer: de pagina
// wordt wel bijgewerkt en de afwijking komt als opmerking terug. Alle andere fouten blokkeren nog wel.
function zonderMetaLengte(validation) {
  const fouten = (validation && validation.errors) || [];
  const meta = fouten.filter((e) => /^Meta (title|description) lengte/i.test(e));
  const rest = fouten.filter((e) => !meta.includes(e));
  return { ...validation, ok: rest.length === 0, errors: rest, metaOpmerkingen: meta };
}

async function metGelijktijdigheid(items, max, taak) {
  const uit = new Array(items.length);
  let volgende = 0;
  async function werker() {
    for (;;) {
      const i = volgende++;
      if (i >= items.length) return;
      uit[i] = await taak(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(max, items.length) }, werker));
  return uit;
}

router.post('/clients/:clientId/tekst-vervangen/zoek', requireLpInternal, async (req, res) => {
  try {
    const client = getLpClient(req.params.clientId);
    const { zoek, slotKey } = req.body || {};
    vindTekst({}, { zoek, slotKey: slotKey || undefined }); // gooit een duidelijke fout bij een ongeldige invoer
    const lijst = await lpNotion.listPages({ klant: req.params.clientId });
    const geladen = await metGelijktijdigheid(lijst, 5, async (p) => {
      try {
        const volledig = await lpNotion.getPage(p.id);
        const slotData = (volledig.content && volledig.content.slotData) || {};
        const zoekHier = vulPlaatshouders(zoek, plaatshouderWaarden(client, volledig));
        return { pagina: p, gevonden: vindTekst(slotData, { zoek: zoekHier, slotKey: slotKey || undefined }) };
      } catch (err) {
        return { pagina: p, fout: err.message };
      }
    });
    let statussen = {};
    let statusWaarschuwing = null;
    try {
      statussen = await haalPaginaStatussen({ profile: client.profile, ids: lijst.map((p) => p.wpPaginaId) });
    } catch (err) {
      statusWaarschuwing = `De WordPress status kon niet worden opgehaald (${err.message}). Controleer zelf welke pagina's live staan.`;
    }
    const paginas = geladen
      .filter((r) => r.fout || r.gevonden.aantal > 0)
      .map((r) => ({
        id: r.pagina.id,
        titel: r.pagina.titel,
        notionStatus: r.pagina.status,
        wpPaginaId: r.pagina.wpPaginaId || null,
        wpUrl: r.pagina.wpUrl || null,
        wpStatus: r.pagina.wpPaginaId ? (statussen[r.pagina.wpPaginaId] || 'onbekend') : 'niet gepubliceerd',
        aantal: r.gevonden ? r.gevonden.aantal : 0,
        velden: r.gevonden ? r.gevonden.slotKeys : [],
        fragment: r.gevonden && r.gevonden.fragmenten[0] ? r.gevonden.fragmenten[0].tekst : '',
        fout: r.fout || null
      }));
    res.json({ totaalGescand: lijst.length, paginas, statusWaarschuwing });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/pages/:pageId/tekst-vervangen', requireLpInternal, async (req, res) => {
  try {
    const { zoek, vervang, slotKey, heleVeld, publiceer } = req.body || {};
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const content = page.content;
    if (contentIsEmpty(blueprint, content)) return res.status(400).json({ error: 'Deze pagina heeft nog geen content.' });

    const waarden = plaatshouderWaarden(getLpClient(page.klant), page);
    const { slotData, aantal } = vervangTekst(content.slotData || {}, { zoek: vulPlaatshouders(zoek, waarden), vervang: vulPlaatshouders(vervang, waarden), slotKey: slotKey || undefined, heleVeld: !!heleVeld });
    if (!aantal) return res.json({ aantal: 0, opgeslagen: false, gepubliceerd: false, melding: 'De tekst staat niet meer op deze pagina.' });

    // Eerst valideren: een verplicht veld leegmaken mag niet stilletjes een kapotte pagina opleveren.
    const nieuweContent = { ...content, slotData };
    const validation = zonderMetaLengte(validatePage({ blueprint, contentJson: nieuweContent }));
    if (!validation.ok) {
      return res.status(400).json({ error: `Niet aangepast, de pagina zou niet meer geldig zijn: ${validation.errors.join('; ')}` });
    }

    await lpNotion.updateSection(req.params.pageId, 'content', nieuweContent);

    let gepubliceerd = false;
    let wpStatus = null;
    let melding = null;
    if (publiceer && page.wpPaginaId) {
      const client = getLpClient(page.klant);
      const html = renderPageHtml(buildRenderPage({ blueprint, content: nieuweContent, clientId: page.klant, slug: page.slug, invoer: page.invoer }), { forWordPress: true });
      const result = await pushDraft({
        profile: client.profile,
        wpPaginaId: page.wpPaginaId,
        titel: page.titel,
        html,
        slug: page.slug,
        metaTitel: slotData.metaTitle,
        metaBeschrijving: slotData.metaDescription,
        behoudStatus: true
      });
      gepubliceerd = true;
      wpStatus = result.status || null;
      if (result.opnieuwAangemaakt) {
        await lpNotion.setWordpressInfo(req.params.pageId, { wpPaginaId: result.id, wpUrl: result.link });
        melding = 'De WordPress pagina bestond niet meer, er is een nieuw concept gemaakt.';
      }
    } else if (publiceer && !page.wpPaginaId) {
      melding = 'Deze pagina staat nog niet in WordPress, alleen de tekst in het portaal is aangepast.';
    }
    res.json({ aantal, opgeslagen: true, gepubliceerd, wpStatus, melding, waarschuwingen: validation.warnings || [] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Pagina's opnieuw laten schrijven, eventueel meteen bijwerken in WordPress (19-10-2026) ----
// De AI schrijft de tekst van een bestaande pagina opnieuw (met klantverhaal, schrijfplan en redactieronde). Wordt
// "publiceer" gevraagd, dan gaat de nieuwe tekst naar DEZELFDE WordPress pagina (zelfde adres, geen nieuwe pagina)
// met behoud van de status: live blijft live, concept blijft concept. De Notion status verandert niet.
// De taak loopt in de wachtrij (een tegelijk), zodat een verzoek niet te lang duurt. Het scherm vraagt de uitkomst op.
const schrijfUitkomst = new Map();
function startSchrijfOpnieuw(pageId, { publiceer }) {
  schrijfUitkomst.delete(pageId);
  return autoTekstRij.zet(pageId, async () => {
    const page = await lpNotion.getPage(pageId);
    const r = await maakContentVoorstel(page, {});
    const slotData = r.slotData || {};
    const nieuweContent = { meta: { metaTitle: slotData.metaTitle || '', metaDescription: slotData.metaDescription || '' }, slotData };
    await lpNotion.updateSection(pageId, 'content', nieuweContent);
    if (page.status !== 'Gepubliceerd') await zetStatusNaSchrijven(pageId);
    const uitkomst = { waarschuwing: [r.klantverhaalWarning, r.redactieWaarschuwing, r.planWaarschuwing].filter(Boolean).join(' '), wpStatus: null, wpMelding: null };
    if (publiceer && page.wpPaginaId) {
      const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
      const validation = zonderMetaLengte(validatePage({ blueprint, contentJson: nieuweContent }));
      if (!validation.ok) {
        uitkomst.wpMelding = `De nieuwe tekst staat in het portaal, maar is niet naar WordPress gestuurd omdat de controle fouten gaf: ${validation.errors.join('; ')}`;
      } else {
        const client = getLpClient(page.klant);
        const html = renderPageHtml(buildRenderPage({ blueprint, content: nieuweContent, clientId: page.klant, slug: page.slug, invoer: page.invoer }), { forWordPress: true });
        const result = await pushDraft({
          profile: client.profile,
          wpPaginaId: page.wpPaginaId,
          titel: page.titel,
          html,
          slug: page.slug,
          metaTitel: slotData.metaTitle,
          metaBeschrijving: slotData.metaDescription,
          behoudStatus: true
        });
        uitkomst.wpStatus = result.status || null;
        if (validation.metaOpmerkingen && validation.metaOpmerkingen.length) uitkomst.waarschuwing = [uitkomst.waarschuwing, `Wel bijgewerkt, maar: ${validation.metaOpmerkingen.join(' ')}`].filter(Boolean).join(' ');
        if (result.opnieuwAangemaakt) {
          await lpNotion.setWordpressInfo(pageId, { wpPaginaId: result.id, wpUrl: result.link });
          uitkomst.wpMelding = 'De WordPress pagina bestond niet meer, er is een nieuw concept gemaakt.';
        }
      }
    } else if (publiceer) {
      uitkomst.wpMelding = 'Deze pagina staat nog niet in WordPress, alleen het portaal is bijgewerkt.';
    }
    schrijfUitkomst.set(pageId, uitkomst);
  });
}

router.post('/pages/:pageId/schrijf-opnieuw', requireLpInternal, async (req, res) => {
  try {
    await lpNotion.getPage(req.params.pageId);
    const huidig = autoTekstRij.status(req.params.pageId);
    if (!huidig || huidig.status === 'fout') startSchrijfOpnieuw(req.params.pageId, { publiceer: Boolean((req.body || {}).publiceer) });
    res.json({ tekstStatus: autoTekstRij.status(req.params.pageId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/pages/:pageId/schrijf-status', requireLpInternal, (req, res) => {
  res.json({ tekstStatus: autoTekstRij.status(req.params.pageId), uitkomst: schrijfUitkomst.get(req.params.pageId) || null });
});

// ---- Pagina's opnieuw naar WordPress sturen, zonder tekst te veranderen (16-10-2026) ----
// Voor als een sjabloon of een vaste bouwsteen (bijvoorbeeld een extra CTA-balk, zie formulierCta.js) is veranderd en
// de bestaande pagina's dat ook moeten krijgen. Rendert de pagina opnieuw met de huidige code en stuurt hem naar
// WordPress met behoud van de status: live blijft live, een concept blijft een concept. Notion verandert niet.
router.post('/clients/:clientId/opnieuw-publiceren/lijst', requireLpInternal, async (req, res) => {
  try {
    const client = getLpClient(req.params.clientId);
    const lijst = (await lpNotion.listPages({ klant: req.params.clientId })).filter((p) => p.wpPaginaId);
    let statussen = {};
    let statusWaarschuwing = null;
    try {
      statussen = await haalPaginaStatussen({ profile: client.profile, ids: lijst.map((p) => p.wpPaginaId) });
    } catch (err) {
      statusWaarschuwing = `De WordPress status kon niet worden opgehaald (${err.message}). Controleer zelf welke pagina's live staan.`;
    }
    const paginas = lijst
      .map((p) => ({ id: p.id, titel: p.titel, wpUrl: p.wpUrl || null, notionStatus: p.status, wpStatus: statussen[p.wpPaginaId] || 'onbekend' }))
      .sort((a, b) => String(a.titel).localeCompare(String(b.titel), 'nl'));
    res.json({ paginas, statusWaarschuwing });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/pages/:pageId/opnieuw-publiceren', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    if (!page.wpPaginaId) return res.status(400).json({ error: 'Deze pagina staat nog niet in WordPress. Publiceer hem eerst via het gewone scherm.' });
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const content = page.content;
    if (contentIsEmpty(blueprint, content)) return res.status(400).json({ error: 'Deze pagina heeft nog geen content.' });
    const validation = zonderMetaLengte(validatePage({ blueprint, contentJson: content }));
    if (!validation.ok) return res.status(400).json({ error: `Niet verstuurd, de pagina is niet geldig: ${validation.errors.join('; ')}` });
    const client = getLpClient(page.klant);
    const html = renderPageHtml(buildRenderPage({ blueprint, content, clientId: page.klant, slug: page.slug, invoer: page.invoer }), { forWordPress: true });
    const slotData = (content && content.slotData) || {};
    const result = await pushDraft({
      profile: client.profile,
      wpPaginaId: page.wpPaginaId,
      titel: page.titel,
      html,
      slug: page.slug,
      metaTitel: slotData.metaTitle,
      metaBeschrijving: slotData.metaDescription,
      behoudStatus: true
    });
    let melding = null;
    if (result.opnieuwAangemaakt) {
      await lpNotion.setWordpressInfo(req.params.pageId, { wpPaginaId: result.id, wpUrl: result.link });
      melding = 'De WordPress pagina bestond niet meer, er is een nieuw concept gemaakt.';
    }
    if (validation.metaOpmerkingen && validation.metaOpmerkingen.length) melding = [melding, `Wel verstuurd, maar: ${validation.metaOpmerkingen.join(' ')}`].filter(Boolean).join(' ');
    res.json({ gepubliceerd: true, wpStatus: result.status || null, ctaBalken: (html.match(/data-lp-cta-balk/g) || []).length, melding });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Een onderdeel overnemen van een voorbeeldpagina (20-10-2026) ----
// Bijvoorbeeld de sectie Projecten van Sassenheim op alle andere pagina's zetten, zonder de rest van de tekst te
// veranderen. Alleen tussen pagina's met hetzelfde sjabloon. De plaatsnaam van de voorbeeldpagina wordt in de
// overgenomen tekst vervangen door die van de doelpagina. Publiceren gaat met behoud van de WordPress status.
router.post('/clients/:clientId/onderdeel-overnemen/lijst', requireLpInternal, async (req, res) => {
  try {
    const client = getLpClient(req.params.clientId);
    const lijst = await lpNotion.listPages({ klant: req.params.clientId });
    let statussen = {};
    let statusWaarschuwing = null;
    try {
      statussen = await haalPaginaStatussen({ profile: client.profile, ids: lijst.filter((p) => p.wpPaginaId).map((p) => p.wpPaginaId) });
    } catch (err) {
      statusWaarschuwing = `De WordPress status kon niet worden opgehaald (${err.message}). Controleer zelf welke pagina's live staan.`;
    }
    const paginas = lijst
      .map((p) => ({
        id: p.id,
        titel: p.titel,
        blueprint: p.blueprint || null,
        wpUrl: p.wpUrl || null,
        wpStatus: p.wpPaginaId ? (statussen[p.wpPaginaId] || 'onbekend') : 'niet gepubliceerd'
      }))
      .sort((a, b) => String(a.titel).localeCompare(String(b.titel), 'nl'));
    res.json({ paginas, statusWaarschuwing });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/pages/:pageId/onderdelen', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const slotData = (page.content && page.content.slotData) || {};
    const onderdelen = onderdeel.onderdelenVan(blueprint)
      .map((o) => ({ ...o, inhoud: onderdeel.samenvatting(slotData, o.slots) }))
      .filter((o) => o.inhoud.length);
    res.json({ blueprint: page.blueprint, plaats: (page.invoer && page.invoer.plaatsnaam) || '', onderdelen });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/pages/:pageId/onderdeel-overnemen', requireLpInternal, async (req, res) => {
  try {
    const { bronPageId, onderdeelId, publiceer } = req.body || {};
    if (!bronPageId || !onderdeelId) return res.status(400).json({ error: 'Kies een voorbeeldpagina en een onderdeel.' });
    if (bronPageId === req.params.pageId) return res.json({ overgeslagen: true, melding: 'Dit is de voorbeeldpagina zelf.' });
    const [bron, page] = await Promise.all([lpNotion.getPage(bronPageId), lpNotion.getPage(req.params.pageId)]);
    if (bron.klant !== page.klant) return res.status(400).json({ error: 'De voorbeeldpagina hoort bij een andere klant.' });
    if (bron.blueprint !== page.blueprint) return res.status(400).json({ error: `Andere opbouw (sjabloon ${page.blueprint || 'onbekend'}), daarom niet overgenomen.` });
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const gekozen = onderdeel.onderdelenVan(blueprint).find((o) => o.id === onderdeelId);
    if (!gekozen) return res.status(400).json({ error: 'Dit onderdeel bestaat niet in het sjabloon.' });
    if (contentIsEmpty(blueprint, page.content)) return res.status(400).json({ error: 'Deze pagina heeft nog geen content.' });

    const { content: nieuweContent, plaatsVervangen } = onderdeel.neemOnderdeelOver({
      bronContent: bron.content,
      doelContent: page.content,
      slotKeys: gekozen.slots,
      bronPlaats: bron.invoer && bron.invoer.plaatsnaam,
      doelPlaats: page.invoer && page.invoer.plaatsnaam
    });
    const validation = zonderMetaLengte(validatePage({ blueprint, contentJson: nieuweContent }));
    if (!validation.ok) return res.status(400).json({ error: `Niet aangepast, de pagina zou niet meer geldig zijn: ${validation.errors.join('; ')}` });
    await lpNotion.updateSection(req.params.pageId, 'content', nieuweContent);

    let gepubliceerd = false;
    let wpStatus = null;
    let melding = plaatsVervangen ? `Plaatsnaam ${plaatsVervangen} keer aangepast naar ${page.invoer.plaatsnaam}.` : null;
    if (publiceer && page.wpPaginaId) {
      const client = getLpClient(page.klant);
      const html = renderPageHtml(buildRenderPage({ blueprint, content: nieuweContent, clientId: page.klant, slug: page.slug, invoer: page.invoer }), { forWordPress: true });
      const slotData = nieuweContent.slotData || {};
      const result = await pushDraft({
        profile: client.profile,
        wpPaginaId: page.wpPaginaId,
        titel: page.titel,
        html,
        slug: page.slug,
        metaTitel: slotData.metaTitle,
        metaBeschrijving: slotData.metaDescription,
        behoudStatus: true
      });
      gepubliceerd = true;
      wpStatus = result.status || null;
      if (result.opnieuwAangemaakt) {
        await lpNotion.setWordpressInfo(req.params.pageId, { wpPaginaId: result.id, wpUrl: result.link });
        melding = [melding, 'De WordPress pagina bestond niet meer, er is een nieuw concept gemaakt.'].filter(Boolean).join(' ');
      }
    } else if (publiceer) {
      melding = [melding, 'Deze pagina staat nog niet in WordPress, alleen het portaal is bijgewerkt.'].filter(Boolean).join(' ');
    }
    res.json({ opgeslagen: true, gepubliceerd, wpStatus, melding });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Deellink voor de klant ----
// Publieke kant staat in src/routes/share.js (/voorbeeld/:token). Hier de interne beheer-routes.
function shareResponse(req, raw) {
  const parsed = share.parseShareValue(raw);
  if (!parsed) return { actief: false };
  const verlopen = share.isExpired(parsed.expiresAt);
  return {
    actief: !verlopen,
    verlopen,
    url: share.buildShareUrl(share.getPublicBaseUrl(req), parsed.token),
    verlooptOp: parsed.expiresAt
  };
}

router.get('/pages/:pageId/deellink', requireLpInternal, async (req, res) => {
  try {
    const raw = await lpNotion.getShare(req.params.pageId);
    res.json(shareResponse(req, raw));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Maakt een nieuwe link en vervangt daarmee een eventuele oude (de oude werkt dan niet meer).
router.post('/pages/:pageId/deellink', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    const blueprint = eigenSjabloonVan(page) || await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    if (contentIsEmpty(blueprint, page.content)) {
      return res.status(400).json({ error: 'Er is nog geen content om te delen. Genereer of vul eerst de content.' });
    }
    const raw = share.buildShareValue(share.createToken(), share.computeExpiry((req.body || {}).dagen));
    await lpNotion.setShare(req.params.pageId, raw);
    res.json(shareResponse(req, raw));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/pages/:pageId/deellink', requireLpInternal, async (req, res) => {
  try {
    await lpNotion.setShare(req.params.pageId, '');
    res.json({ actief: false });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Bouwen met chat (23-10-2026, zie src/lp/chatBouwer.js) ----
// Een bericht kan een tot drie minuten duren (de AI bouwt een hele pagina). Daarom start POST /chat/bericht een taak en
// vraagt het scherm de uitkomst op met GET /chat/taak/:taakId. De taken staan alleen in het geheugen: na een herstart van
// de server is een lopende taak weg, de pagina en het gesprek in Notion niet.
const chatBouwer = require('../lp/chatBouwer');
const { CHAT_BLUEPRINT } = require('../lp/eigenSjabloon');
const chatTaken = new Map();
const chatBezigPerPagina = new Set();
const CHAT_TAAK_BEWAAR_MS = 30 * 60 * 1000;

function ruimChatTakenOp() {
  const grens = Date.now() - CHAT_TAAK_BEWAAR_MS;
  for (const [id, t] of chatTaken) if (t.gestart < grens) chatTaken.delete(id);
}

async function voerChatBeurtUit({ klant, pageId, bericht, berichtenZonderPagina }) {
  const client = getLpClient(klant);
  const page = pageId ? await lpNotion.getPage(pageId) : null;
  if (page && page.klant !== klant) throw new Error('Deze pagina hoort niet bij deze klant.');
  const huidig = page && page.sjabloon && page.sjabloon.blueprint
    ? { blueprint: page.sjabloon.blueprint, slotData: (page.content && page.content.slotData) || {} }
    : null;
  const berichten = page
    ? ((page.sjabloon && page.sjabloon.berichten) || [])
    : (Array.isArray(berichtenZonderPagina) ? berichtenZonderPagina.filter((b) => b && typeof b.tekst === 'string').map((b) => ({ rol: b.rol === 'ai' ? 'ai' : 'dylan', tekst: b.tekst.slice(0, 4000) })) : []);
  const uit = await chatBouwer.chatBeurt({
    klant, client, huidig, berichten, bericht,
    deps: { ai, callOpenAi: ai.callOpenAi, validateTemplateStructure, verdeelIconen: ai.verdeelIconen, zorgVoorGalerijSlot, bouwKlantverhaalBlok: require('../lp/klantverhaal').bouwKlantverhaalBlok }
  });
  const waarschuwingen = [];
  // Vaste voorkeuren die Dylan noemde bewaren bij de klant (nooit blokkerend voor het bericht zelf).
  if (uit.onthoud && uit.onthoud.length) {
    try { await klantgegevens.voegCampagneVoorkeurToe(klant, uit.onthoud); } catch (err) { waarschuwingen.push(`De voorkeur kon niet worden bewaard: ${err.message}`); }
  }
  let slotData = uit.slotData;
  if (uit.actie !== 'geen') {
    // Lege foto's vullen uit de mediabibliotheek van de klant (zelfde keuze als bij een sjabloonvoorbeeld).
    const r = await vulVoorbeeldAan({ klant, blueprint: uit.blueprint, slotData: slotData || {}, hervulTekst: false });
    slotData = r.data;
    waarschuwingen.push(...r.waarschuwingen);
  }
  const nu = new Date().toISOString();
  const nieuweBerichten = chatBouwer.voegBerichtenToe(berichten,
    { rol: 'dylan', tekst: bericht, tijd: nu },
    { rol: 'ai', tekst: uit.antwoord, actie: uit.actie, tijd: nu });

  if (!page) {
    if (uit.actie === 'geen') return { pageId: null, antwoord: uit.antwoord, actie: uit.actie, berichten: nieuweBerichten, waarschuwingen };
    const eersteVraag = (nieuweBerichten.find((b) => b.rol === 'dylan') || {}).tekst || bericht;
    const nieuw = await lpNotion.createPage({
      klant,
      blueprint: CHAT_BLUEPRINT,
      titel: uit.titel || `Chatpagina ${nu.slice(0, 10)}`,
      slug: uit.slug || undefined,
      invoer: { _gebouwdMetChat: true, _watGaatDezePaginaOver: String(eersteVraag).slice(0, 1500) },
      content: { meta: { metaTitle: slotData.metaTitle || '', metaDescription: slotData.metaDescription || '' }, slotData, overrides: {} },
      sjabloon: { blueprint: uit.blueprint, berichten: nieuweBerichten }
    });
    return { pageId: nieuw.id, antwoord: uit.antwoord, actie: uit.actie, berichten: nieuweBerichten, waarschuwingen };
  }

  if (uit.actie !== 'geen') {
    await lpNotion.updateSection(page.id, 'content', { ...(page.content || {}), meta: { metaTitle: slotData.metaTitle || '', metaDescription: slotData.metaDescription || '' }, slotData });
  }
  await lpNotion.updateSection(page.id, 'sjabloon', { blueprint: uit.actie === 'bouw' ? uit.blueprint : page.sjabloon.blueprint, berichten: nieuweBerichten });
  return { pageId: page.id, antwoord: uit.antwoord, actie: uit.actie, berichten: nieuweBerichten, waarschuwingen };
}

// Lijst van chatpagina's van een klant.
router.get('/chat/lijst', requireLpInternal, async (req, res) => {
  try {
    const klant = String(req.query.klant || '');
    if (!klant) return res.status(400).json({ error: 'Kies een klant.' });
    const paginas = (await lpNotion.listPages({ klant })).filter((p) => p.blueprint === CHAT_BLUEPRINT);
    res.json({ paginas });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Een chatpagina openen: het gesprek en de stand van de pagina.
router.get('/chat/:pageId', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.params.pageId);
    if (page.blueprint !== CHAT_BLUEPRINT || !page.sjabloon) return res.status(400).json({ error: 'Deze pagina is niet in de chat gebouwd.' });
    res.json({ page: { id: page.id, titel: page.titel, klant: page.klant, status: page.status, slug: page.slug, wpUrl: page.wpUrl, wpPaginaId: page.wpPaginaId }, berichten: page.sjabloon.berichten || [] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/chat/bericht', requireLpInternal, (req, res) => {
  const { klant, pageId, bericht, berichten } = req.body || {};
  const tekst = String(bericht || '').trim();
  if (!klant) return res.status(400).json({ error: 'Kies een klant.' });
  if (!tekst) return res.status(400).json({ error: 'Typ eerst een bericht.' });
  try { getLpClient(klant); } catch (err) { return res.status(400).json({ error: err.message }); }
  if (pageId && chatBezigPerPagina.has(pageId)) return res.status(409).json({ error: 'Er loopt al een bericht voor deze pagina. Wacht tot dat klaar is.' });
  ruimChatTakenOp();
  const taakId = `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const taak = { status: 'bezig', gestart: Date.now() };
  chatTaken.set(taakId, taak);
  if (pageId) chatBezigPerPagina.add(pageId);
  voerChatBeurtUit({ klant, pageId: pageId || null, bericht: tekst.slice(0, 4000), berichtenZonderPagina: berichten })
    .then((resultaat) => { taak.status = 'klaar'; taak.resultaat = resultaat; })
    .catch((err) => { taak.status = 'fout'; taak.fout = err.message; })
    .finally(() => { if (pageId) chatBezigPerPagina.delete(pageId); });
  res.json({ taakId });
});

router.get('/chat/taak/:taakId', requireLpInternal, (req, res) => {
  const taak = chatTaken.get(req.params.taakId);
  if (!taak) return res.status(404).json({ error: 'Deze taak is niet (meer) bekend. Mogelijk is de server herstart. Open de pagina opnieuw.' });
  if (taak.status === 'fout') return res.json({ status: 'fout', fout: taak.fout });
  if (taak.status === 'klaar') return res.json({ status: 'klaar', resultaat: taak.resultaat });
  res.json({ status: 'bezig', seconden: Math.round((Date.now() - taak.gestart) / 1000) });
});

module.exports = router;
