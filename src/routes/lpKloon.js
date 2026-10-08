// LP Fabriek: routes voor de WordPress kloon (zie src/lp/wpKloon.js). Gemonteerd op /api/lp/kloon.
// Alles achter de LP login (requireLpInternal). Een kloon wordt altijd een concept.

const express = require('express');
const { clients: lpClients, getLpClient } = require('../lp/clients');
const { haalVelden, haalKlonen, maakKloon, stelInhoudVoor } = require('../lp/wpKloon');
const { gebruikteFeitIds } = require('../lp/feitenDefaults');
const { requireLpInternal } = require('../middleware/auth');
const lpNotion = require('../lp/notion');
const templates = require('../lp/templates');
const { lijstSecties, renderSectieHtml } = require('../lp/kloonBlokken');

const router = express.Router();

// Welke klanten hebben bronpagina's om te klonen (profile.kloonBronnen) en welke SEO plugin ze gebruiken.
router.get('/bronnen', requireLpInternal, (req, res) => {
  const klanten = Object.keys(lpClients)
    .map((id) => {
      const profile = lpClients[id].profile;
      return { id, naam: profile.naam, bronnen: profile.kloonBronnen || [] };
    })
    .filter((k) => k.bronnen.length);
  res.json({ klanten });
});

router.post('/velden', requireLpInternal, async (req, res) => {
  try {
    const { klant, bron } = req.body || {};
    getLpClient(klant); // onbekende klant geeft een duidelijke fout
    res.json(await haalVelden({ bron }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Eerder gemaakte klonen van deze klant (uit WordPress zelf, zie haalKlonen).
router.get('/klonen', requireLpInternal, async (req, res) => {
  try {
    getLpClient(req.query.klant);
    res.json({ klonen: await haalKlonen() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// AI teksten voorstellen voor de geselecteerde velden. Bewaart niets, de gebruiker beoordeelt eerst.
router.post('/voorstel', requireLpInternal, async (req, res) => {
  try {
    const { klant, opdracht, velden } = req.body || {};
    const client = getLpClient(klant);
    const standaardIds = new Set(gebruikteFeitIds(null, client.feiten));
    const feiten = (client.feiten || []).filter((f) => standaardIds.has(f.id));
    const resultaat = await stelInhoudVoor({
      opdracht,
      feiten,
      nietToegestaan: client.profile.nietToegestaan,
      toonNotitie: client.profile.toonNotitie,
      velden
    });
    res.json(resultaat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Portaalpagina's van een klant waaruit een sectie als blok in de kloon kan.
router.get('/portaalpaginas', requireLpInternal, async (req, res) => {
  try {
    getLpClient(req.query.klant);
    const pages = await lpNotion.listPages({ klant: req.query.klant });
    res.json({ paginas: pages.map((p) => ({ id: p.id, titel: p.titel, status: p.status, blueprint: p.blueprint })) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Secties van het sjabloon van een portaalpagina (zonder hero).
router.get('/secties', requireLpInternal, async (req, res) => {
  try {
    const page = await lpNotion.getPage(req.query.pagina);
    if (page.klant !== req.query.klant) throw new Error('Deze pagina hoort niet bij deze klant.');
    const blueprint = await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    res.json({ secties: lijstSecties(blueprint, page.content && page.content.slotData) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Rendert de gekozen secties server side, zodat de browser nooit zelf HTML voor WordPress aanlevert.
async function bouwBlokken(klant, blokken) {
  const uit = [];
  for (const b of Array.isArray(blokken) ? blokken : []) {
    if (!b || !b.pagina) continue;
    const page = await lpNotion.getPage(b.pagina);
    if (page.klant !== klant) throw new Error('Een gekozen portaalpagina hoort niet bij deze klant.');
    const blueprint = await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
    const secties = lijstSecties(blueprint, page.content && page.content.slotData);
    const sec = secties.find((s) => s.index === Number(b.sectie)) || {};
    const heeftDeel = b.deel !== undefined && b.deel !== null && b.deel !== '';
    const deelLabel = heeftDeel ? ((sec.delen || []).find((d) => d.index === Number(b.deel)) || {}).label : '';
    const label = `${sec.label || `onderdeel ${Number(b.sectie) + 1}`}${deelLabel ? ` > ${deelLabel.trim()}` : ''}`;
    // plek heeft de vorm "voor:<id>", "na:<id>", "begin:<id>" of "eind:<id>"; een kale b.na blijft "na".
    const [plekWaar, plekNode] = String(b.plek || '').includes(':') ? String(b.plek).split(/:(.*)/s) : ['na', b.na];
    uit.push({ na: plekNode, waar: plekWaar, titel: `${page.titel}: ${label}`, html: renderSectieHtml({ blueprint, pagina: page, sectie: b.sectie, deel: heeftDeel ? b.deel : undefined }) });
  }
  return uit;
}

// Voorbeeld van een gekozen blok, zonder iets naar WordPress te sturen.
router.post('/blokvoorbeeld', requireLpInternal, async (req, res) => {
  try {
    const { klant, pagina, sectie, deel } = req.body || {};
    getLpClient(klant);
    const [blok] = await bouwBlokken(klant, [{ pagina, sectie, deel, na: 'voorbeeld' }]);
    res.json({ html: blok.html, titel: blok.titel });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/maak', requireLpInternal, async (req, res) => {
  try {
    const { klant, bron, titel, slug, metaTitel, metaBeschrijving, velden, zoekvervang, blokken, dryRun } = req.body || {};
    const client = getLpClient(klant);
    const seoPlugin = client.profile.seo && client.profile.seo.plugin;
    const resultaat = await maakKloon({ bron, titel, slug, seoPlugin, metaTitel, metaBeschrijving, velden, zoekvervang, blokken: await bouwBlokken(klant, blokken), dryRun });
    res.json(resultaat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
