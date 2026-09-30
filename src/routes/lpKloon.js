// LP Fabriek: routes voor de WordPress kloon (zie src/lp/wpKloon.js). Gemonteerd op /api/lp/kloon.
// Alles achter de LP login (requireLpInternal). Een kloon wordt altijd een concept.

const express = require('express');
const { clients: lpClients, getLpClient } = require('../lp/clients');
const { haalVelden, haalKlonen, maakKloon, stelInhoudVoor } = require('../lp/wpKloon');
const { gebruikteFeitIds } = require('../lp/feitenDefaults');
const { requireLpInternal } = require('../middleware/auth');

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

router.post('/maak', requireLpInternal, async (req, res) => {
  try {
    const { klant, bron, titel, slug, metaTitel, metaBeschrijving, velden, zoekvervang, dryRun } = req.body || {};
    const client = getLpClient(klant);
    const seoPlugin = client.profile.seo && client.profile.seo.plugin;
    const resultaat = await maakKloon({ bron, titel, slug, seoPlugin, metaTitel, metaBeschrijving, velden, zoekvervang, dryRun });
    res.json(resultaat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
