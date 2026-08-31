// Register van alle blokken: type-string (zoals gebruikt in de content JSON
// van een pagina) naar de bijbehorende render-functie. Nieuw bloktype
// toevoegen = hier een regel bijzetten, geen wijziging elders nodig.

const hero = require('./hero');
const intro = require('./intro');
const tekstblok = require('./tekstblok');
const uspGrid = require('./usp-grid');
const aanbodGrid = require('./aanbod-grid');
const doelgroep = require('./doelgroep');
const stappen = require('./stappen');
const bewijs = require('./bewijs');
const reviews = require('./reviews');
const praktisch = require('./praktisch');
const links = require('./links');
const faq = require('./faq');
const cta = require('./cta');

const blocks = {
  hero,
  intro,
  tekstblok,
  'usp-grid': uspGrid,
  'aanbod-grid': aanbodGrid,
  doelgroep,
  stappen,
  bewijs,
  reviews,
  praktisch,
  links,
  faq,
  cta
};

function renderBlock(block) {
  const definition = blocks[block.type];
  if (!definition) {
    throw new Error(`Onbekend bloktype: ${block.type}`);
  }
  return definition.render(block.data || {});
}

module.exports = { blocks, renderBlock };
