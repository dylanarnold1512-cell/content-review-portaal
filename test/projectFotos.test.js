const test = require('node:test');
const assert = require('node:assert');
const { zorgVoorProjectItems, ruimOpProjectItems } = require('../src/lp/projectFotos');

const template = { slots: [
  { key: 'projectsTitle', type: 'text' },
  { key: 'projectsIntro', type: 'text', verplicht: false },
  { key: 'projectsItems', type: 'list', itemFields: ['title', 'location', 'imageSrc', 'imageAlt'] }
] };

test('vult aan tot 3 lege items en haalt items zonder foto weer weg', () => {
  const d = { projectsIntro: 'Een intro', projectsItems: [] };
  zorgVoorProjectItems(template, d);
  assert.equal(d.projectsItems.length, 3);
  d.projectsItems[0].imageSrc = 'a.jpg';
  d.projectsItems[1].imageSrc = 'b.jpg';
  ruimOpProjectItems(template, d);
  assert.equal(d.projectsItems.length, 2);
  assert.equal(d.projectsIntro, '');
});

test('laat echte projecten met tekst en foto staan, intro blijft', () => {
  const d = { projectsIntro: 'Intro', projectsItems: [
    { title: 'A', location: 'x', imageSrc: '1.jpg' }, { title: 'B', location: 'y', imageSrc: '2.jpg' }, { title: 'C', imageSrc: '3.jpg' }] };
  zorgVoorProjectItems(template, d);
  ruimOpProjectItems(template, d);
  assert.equal(d.projectsItems.length, 3);
  assert.equal(d.projectsIntro, 'Intro');
});
