// Tests voor getImageSlots en verwijderVerzonnenAfbeeldingen in src/lp/ai.js — regressietests
// voor de bug gevonden bij Roots/Festivals op 28-09-2026 (zie systeem-logboek.md): een
// afbeeldingveld binnen een lijst-item (bv. offerItems[].imageSrc, lowercase i) werd nergens
// herkend, waardoor het nooit klikbaar was in de preview, nooit automatisch gevuld werd, en de
// content-AI er ongestoord een verzonnen placeholder-pad in kon zetten. Puur deze functies
// testen (geen echte OpenAI-aanroep nodig), zelfde opzet als ai-linkfilter.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getImageSlots, verwijderVerzonnenAfbeeldingen } = require('../src/lp/ai');

const template = {
  slots: [
    { key: 'heroImageSrc', type: 'text', label: 'Hero-foto' },
    { key: 'heroImageAlt', type: 'text', label: 'Hero-foto alt-tekst' },
    { key: 'offerItems', type: 'list', label: 'Kamertypes', itemFields: ['title', 'imageSrc', 'imageAlt'] }
  ]
};

test('getImageSlots: vindt zowel een top-level ImageSrc-slot als een imageSrc-itemveld per lijst-item', () => {
  const slotData = {
    offerItems: [
      { title: 'Hotelkamers' },
      { title: 'Gedeelde kamers' }
    ]
  };
  const result = getImageSlots(template, slotData);
  const keys = result.map((s) => s.key);
  assert.ok(keys.includes('heroImageSrc'), 'top-level ImageSrc-slot moet gevonden worden');
  assert.ok(!keys.includes('heroImageAlt'), 'een *ImageAlt-slot is geen afbeelding-slot om te kiezen');
  assert.ok(keys.includes('offerItems.0.imageSrc'), 'itemveld van item 0 moet als eigen entry gevonden worden');
  assert.ok(keys.includes('offerItems.1.imageSrc'), 'itemveld van item 1 moet als eigen entry gevonden worden');
  assert.equal(keys.filter((k) => k.startsWith('offerItems.')).length, 2, 'aantal entries moet gelijk zijn aan het aantal items, niet vast op 1 of 3');
});

test('getImageSlots: zonder slotData (nog geen items) levert geen lijst-item-entries op, geen crash', () => {
  const result = getImageSlots(template);
  const keys = result.map((s) => s.key);
  assert.ok(keys.includes('heroImageSrc'));
  assert.ok(!keys.some((k) => k.startsWith('offerItems.')), 'zonder items is er niets om te kiezen');
});

test('getImageSlots: gebruikt de titel van het item als context, voor betere AI-fotokeuze', () => {
  const slotData = { offerItems: [{ title: 'Female Only Dorm' }] };
  const result = getImageSlots(template, slotData);
  const entry = result.find((s) => s.key === 'offerItems.0.imageSrc');
  assert.equal(entry.context, 'Female Only Dorm');
});

test('verwijderVerzonnenAfbeeldingen: verwijdert een verzonnen top-level ImageSrc/ImageAlt-veld', () => {
  const slotData = { heroImageSrc: '/placeholder-hero.jpg', heroImageAlt: 'Verzonnen alt-tekst', heroTitle: 'Blijft staan' };
  verwijderVerzonnenAfbeeldingen(slotData, template);
  assert.ok(!('heroImageSrc' in slotData));
  assert.ok(!('heroImageAlt' in slotData));
  assert.equal(slotData.heroTitle, 'Blijft staan');
});

test('verwijderVerzonnenAfbeeldingen: verwijdert een verzonnen imageSrc/imageAlt binnen een lijst-item, de rest van het item blijft staan', () => {
  const slotData = {
    offerItems: [
      { title: 'Hotelkamers', imageSrc: '/placeholder-hotel.jpg', imageAlt: 'Verzonnen' },
      { title: 'Groep op pad' }
    ]
  };
  verwijderVerzonnenAfbeeldingen(slotData, template);
  assert.ok(!('imageSrc' in slotData.offerItems[0]));
  assert.ok(!('imageAlt' in slotData.offerItems[0]));
  assert.equal(slotData.offerItems[0].title, 'Hotelkamers', 'de overige velden van dat item blijven gewoon staan');
  assert.equal(slotData.offerItems[1].title, 'Groep op pad');
});
