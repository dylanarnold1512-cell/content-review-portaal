// Zet een pagina (content JSON) om in kant-en-klare WordPress-content:
// <style> met klanttokens + gerenderde blokken, gewrapt in een Gutenberg
// custom-HTML block comment zodat wpautop de HTML niet kapotmaakt
// (zie besluiten.md, "WordPress publiceren: rauwe HTML wordt gemangeld").

const { getTokens } = require('./tokens');
const { renderStyle } = require('./style');
const { renderBlock, blocks } = require('./blocks');
const { slugify } = require('./utils');

// page: {
//   clientId: string,
//   slug: string,
//   blocks: [{ type: string, data: object }]
// }
function renderPageHtml(page) {
  const tokens = getTokens(page.clientId);
  const rootClass = `lp-root-${slugify(page.slug)}`;
  const style = renderStyle(rootClass, tokens);
  const body = page.blocks.map(renderBlock).join('\n');
  const schemas = collectSchemas(page.blocks);
  const schemaScript = schemas.length
    ? `\n<script type="application/ld+json">${JSON.stringify(
        schemas.length === 1 ? schemas[0] : schemas
      )}</script>`
    : '';
  return `${style}
<div class="${rootClass}">
${body}
</div>${schemaScript}`;
}

// Verzamelt JSON-LD uit blokken die dat ondersteunen (nu alleen faq).
function collectSchemas(pageBlocks) {
  const schemas = [];
  for (const block of pageBlocks) {
    const definition = blocks[block.type];
    if (definition && typeof definition.renderSchema === 'function') {
      const schema = definition.renderSchema(block.data || {});
      if (schema) schemas.push(schema);
    }
  }
  return schemas;
}

// De verplichte wrapper voor het WordPress content-veld. Los aanroepbaar
// gehouden zodat andere publicatiecode 'm ook kan gebruiken zonder blokken.
function wrapForWordPress(html) {
  return `<!-- wp:html -->\n${html}\n<!-- /wp:html -->`;
}

module.exports = { renderPageHtml, wrapForWordPress };
