// LP Fabriek: routes voor de WordPress kloon (zie src/lp/wpKloon.js). Gemonteerd op /api/lp/kloon.
// Alles achter de LP login (requireLpInternal). Een kloon wordt altijd een concept.

const express = require('express');
const { clients: lpClients, getLpClient } = require('../lp/clients');
const { haalVelden, haalKlonen, maakKloon, stelInhoudVoor } = require('../lp/wpKloon');
const { gebruikteFeitIds } = require('../lp/feitenDefaults');
const { requireLpInternal } = require('../middleware/auth');
const festival = require('../lp/festivalKloon');
const lpNotion = require('../lp/notion');
const templates = require('../lp/templates');
const { lijstSecties, renderSectieHtml, zoekStijlvoorbeeld, schoonBlokHtml } = require('../lp/kloonBlokken');

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
    if (b && !b.pagina && typeof b.html === 'string' && b.html.trim()) {
      // Door de AI gemaakt blok (zie festival/aanpassen): geen portaalpagina, wel gezuiverde HTML.
      const [w, n] = String(b.plek || '').includes(':') ? String(b.plek).split(/:(.*)/s) : ['na', b.na];
      uit.push({ na: n, waar: w, titel: String(b.titel || 'Nieuw blok').slice(0, 80), html: schoonBlokHtml(b.html) });
      continue;
    }
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

// ---- Festivalpagina: festivalgegevens ophalen, teksten schrijven, voorbeeld tonen, teksten bijstellen ----

function bronPlaatsVan(client, bron) {
  const b = ((client.profile && client.profile.kloonBronnen) || []).find((x) => Number(x.id) === Number(bron));
  return b && b.plaats ? b.plaats : '';
}

function klantFeitenVoor(client) {
  const standaardIds = new Set(gebruikteFeitIds(null, client.feiten));
  return (client.feiten || []).filter((f) => standaardIds.has(f.id)).map((f) => ({ label: f.label, waarde: f.waarde }));
}

router.post('/festival/start', requireLpInternal, async (req, res) => {
  try {
    const { klant, bron, festivalNaam, festivalUrl, plaats, wensen } = req.body || {};
    const client = getLpClient(klant);
    const velden = await haalVelden({ bron });
    const gevonden = await festival.haalFestivalFeiten({ naam: festivalNaam, plaats, url: festivalUrl, wensen });
    const bronPlaats = bronPlaatsVan(client, bron);
    const voorstel = await festival.maakFestivalVoorstel({
      velden: velden.velden,
      festival: gevonden.festival,
      feiten: gevonden.feiten,
      klantFeiten: klantFeitenVoor(client),
      nietToegestaan: client.profile.nietToegestaan,
      toonNotitie: client.profile.toonNotitie,
      bronPlaats
    });
    const waarschuwingen = [...gevonden.waarschuwingen, ...voorstel.waarschuwingen];
    // Teksten waarin de plaats van de bronpagina nog staat, na het schrijven
    if (bronPlaats) {
      const nieuw = new Map(voorstel.voorstellen.map((v) => [v.id, v.waarde]));
      const over = velden.velden.filter((v) => v.soort === 'tekst' && String(nieuw.has(v.id) ? nieuw.get(v.id) : v.waarde).toLowerCase().includes(bronPlaats.toLowerCase()));
      if (over.length) waarschuwingen.push(`${over.length} tekst(en) noemen nog "${bronPlaats}". Zeg in het vak hieronder wat daarmee moet gebeuren.`);
    }
    res.json({
      bron: velden.bron,
      bronUrl: velden.url,
      bronTitel: velden.titel,
      velden: velden.velden,
      voorstellen: voorstel.voorstellen,
      festival: gevonden.festival,
      feiten: gevonden.feiten,
      waarschuwingen
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Het stijlvoorbeeld voor door de AI gemaakte blokken, kort onthouden zodat niet elke opdracht Notion bevraagt.
const stijlCache = new Map();
async function stijlVoorKlant(klant) {
  const hit = stijlCache.get(klant);
  if (hit && Date.now() - hit.tijd < 10 * 60 * 1000) return hit.stijl;
  const stijl = await zoekStijlvoorbeeld({ klant, lpNotion, templates });
  stijlCache.set(klant, { tijd: Date.now(), stijl });
  return stijl;
}

router.post('/festival/aanpassen', requireLpInternal, async (req, res) => {
  try {
    const { klant, instructie, velden, feiten } = req.body || {};
    const client = getLpClient(klant);
    const stijl = await stijlVoorKlant(klant);
    res.json(await festival.reviseerTeksten({ instructie, velden, feiten: [...klantFeitenVoor(client), ...(Array.isArray(feiten) ? feiten : [])], nietToegestaan: client.profile.nietToegestaan, stijl }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/festival/voorbeeld', requireLpInternal, async (req, res) => {
  try {
    const { klant, bronUrl, wijzigingen, bewerkbaar, blokken } = req.body || {};
    const client = getLpClient(klant);
    const toegestaan = new URL((client.profile.bedrijf && client.profile.bedrijf.url) || 'https://invalid.invalid/').hostname.replace(/^www\./, '');
    const doel = festival.veiligeUrl(bronUrl);
    if (doel.hostname.replace(/^www\./, '') !== toegestaan) throw new Error('Het voorbeeld kan alleen de site van de klant laten zien.');
    const html = await festival.haalPagina(doel.toString());
    res.json(festival.bouwVoorbeeldHtml({ html, baseUrl: `${doel.origin}/`, wijzigingen, bewerkbaar,
      blokken: (Array.isArray(blokken) ? blokken : []).slice(0, 20).map((b) => ({ html: String((b && b.html) || '').slice(0, 200 * 1024), na: String((b && b.na) || ''), waar: b && b.waar === 'voor' ? 'voor' : 'na' })) }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/maak', requireLpInternal, async (req, res) => {
  try {
    const { klant, bron, titel, slug, metaTitel, metaBeschrijving, velden, zoekvervang, blokken, bijwerken, dryRun } = req.body || {};
    const client = getLpClient(klant);
    const seoPlugin = client.profile.seo && client.profile.seo.plugin;
    const resultaat = await maakKloon({ bron, titel, slug, seoPlugin, metaTitel, metaBeschrijving, velden, zoekvervang, blokken: await bouwBlokken(klant, blokken), bijwerken, dryRun });
    res.json(resultaat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
