// Publieke deellink voor de klant: GET /voorbeeld/:token.
// Bewust GEEN inlog (dat is het hele punt), maar het token is een 256 bit willekeurige waarde die
// alleen bestaat zolang Dylan of Marc de link laat staan. Zie src/lp/share.js.

const express = require('express');
const { renderPageHtml } = require('../lp/render');
const { buildRenderPage, contentIsEmpty } = require('../lp/pageRender');
const share = require('../lp/share');

function createShareRouter(deps = {}) {
  const router = express.Router();

  router.get('/:token', async (req, res) => {
    res.set({
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer'
    });

    const notFound = () =>
      res.status(404).type('html').send(share.messagePage('Deze voorbeeldlink bestaat niet of is ingetrokken.'));

    const { token } = req.params;
    if (!share.isValidTokenShape(token)) return notFound();

    try {
      const lpNotion = deps.lpNotion || require('../lp/notion');
      const templates = deps.templates || require('../lp/templates');

      const page = await lpNotion.findPageByShareToken(token);
      if (!page) return notFound();

      const parsed = share.parseShareValue(page.deellink);
      if (!parsed || !share.tokensMatch(parsed.token, token)) return notFound();

      if (share.isExpired(parsed.expiresAt, deps.now ? deps.now() : new Date())) {
        return res
          .status(410)
          .type('html')
          .send(share.messagePage('Deze voorbeeldlink is verlopen. Vraag de afzender om een nieuwe link.'));
      }

      const blueprint = await templates.getActiveTemplateByBlueprintId(page.klant, page.blueprint);
      if (!blueprint || contentIsEmpty(blueprint, page.content)) return notFound();

      // Bewust zonder forPreview: de klant krijgt dezelfde schone HTML als WordPress, zonder de
      // klikbare data-lp-* markeringen van het interne voorbeeldscherm.
      const html = renderPageHtml(
        buildRenderPage({ blueprint, content: page.content, clientId: page.klant, slug: page.slug })
      );
      return res
        .status(200)
        .type('html')
        .send(share.wrapSharedDoc({ title: page.titel, html, expiresAt: parsed.expiresAt }));
    } catch (err) {
      console.error('Deellink renderen mislukt:', err && err.message);
      return res.status(500).type('html').send(share.messagePage('Het voorbeeld kon nu niet geladen worden. Probeer het straks opnieuw.'));
    }
  });

  return router;
}

const router = createShareRouter();
module.exports = router;
module.exports.createShareRouter = createShareRouter;
