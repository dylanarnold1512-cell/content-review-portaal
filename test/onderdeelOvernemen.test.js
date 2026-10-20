const test = require('node:test');
const assert = require('node:assert/strict');
const o = require('../src/lp/onderdeelOvernemen');

const tpl = { slots: [
  { key: 'heroTitle', label: 'Hero titel', verplicht: true },
  { key: 'projectsTitle', label: 'Projecten titel' },
  { key: 'projectsIntro', label: 'Projecten intro' },
  { key: 'projectsItems', type: 'list', itemFields: ['title', 'location', 'imageSrc', 'imageAlt'] },
  { key: 'metaTitle' }, { key: 'metaDescription' }
] };

test('onderdelen worden gegroepeerd op het eerste woord, meta hoort er niet bij', () => {
  const lijst = o.onderdelenVan(tpl);
  assert.deepEqual(lijst.map((x) => x.id), ['hero', 'projects']);
  assert.deepEqual(lijst[1].slots, ['projectsTitle', 'projectsIntro', 'projectsItems']);
  assert.equal(lijst[1].naam, 'Projecten');
});

test('neemt alleen het onderdeel over, vervangt de plaats en laat verborgen items weg', () => {
  const bron = { slotData: {
    heroTitle: 'Verbouw in Sassenheim', projectsTitle: 'Recente projecten', projectsIntro: 'Werk in Sassenheim en omgeving, ook Sassenheimse klanten.',
    projectsItems: [{ imageSrc: 'https://x/sassenheim-1.png', title: '' }, { imageSrc: 'b.jpg' }, { imageSrc: 'c.jpg' }, { imageSrc: 'verborgen.jpg' }]
  }, overrides: { verborgenItems: [{ lijst: 'projectsItems', index: 3 }] } };
  const doel = { meta: { metaTitle: 'x' }, slotData: { heroTitle: 'Verbouw in Lisse', projectsTitle: 'Van schuur naar tuinhuis', projectsItems: [{ imageSrc: 'a.png', title: 'Tuinhuis', location: 'Hillegom' }], metaTitle: 'Lisse' },
    overrides: { verborgenItems: [{ lijst: 'projectsItems', index: 0 }, { lijst: 'reviewItems', index: 1 }] } };
  const proj = o.onderdelenVan(tpl).find((x) => x.id === 'projects');
  const { content, plaatsVervangen } = o.neemOnderdeelOver({ bronContent: bron, doelContent: doel, slotKeys: proj.slots, bronPlaats: 'Sassenheim', doelPlaats: 'Lisse' });
  assert.equal(content.slotData.heroTitle, 'Verbouw in Lisse', 'de rest blijft staan');
  assert.equal(content.slotData.metaTitle, 'Lisse');
  assert.equal(content.slotData.projectsTitle, 'Recente projecten');
  assert.equal(content.slotData.projectsIntro, 'Werk in Lisse en omgeving, ook Sassenheimse klanten.');
  assert.equal(plaatsVervangen, 1);
  assert.equal(content.slotData.projectsItems.length, 3);
  assert.equal(content.slotData.projectsItems[0].imageSrc, 'https://x/sassenheim-1.png', 'fotoadressen blijven ongewijzigd');
  assert.deepEqual(content.overrides.verborgenItems, [{ lijst: 'reviewItems', index: 1 }]);
  assert.deepEqual(content.meta, { metaTitle: 'x' });
  assert.equal(bron.slotData.projectsItems.length, 4, 'de voorbeeldpagina zelf verandert niet');
});

test('samenvatting telt foto\'s en kort lange tekst in', () => {
  const s = o.samenvatting({ projectsTitle: 'Recente projecten', projectsItems: [{ imageSrc: 'a' }, { imageSrc: '' }] }, ['projectsTitle', 'projectsItems', 'projectsIntro']);
  assert.deepEqual(s, ['Recente projecten', '2 items (1 met foto)']);
});
