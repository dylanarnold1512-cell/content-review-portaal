const test = require('node:test');
const assert = require('node:assert');
const { bouwKopie, vervangPlaats, titelVoorPlaats, lokaleFeiten } = require('../src/lp/dupliceer');
const g = require('../src/lp/gelijkenis');
const { bouwZusterBlok } = require('../src/lp/ai');

const origineel = {
  klant: 'macbouw',
  blueprint: 'dienst',
  titel: 'Aannemer Hillegom',
  invoer: { plaatsnaam: 'Hillegom', _watGaatDezePaginaOver: 'Verbouw in Hillegom' },
  feitensheet: { gebruikt: ['a'], extra: [{ label: 'Lokale informatie Hillegom', waarde: 'Oude wijk', bron: 'x' }, { label: 'Ander', waarde: 'Blijft', bron: 'y' }] },
  content: { meta: { metaTitle: 'Aannemer in Hillegom' }, slotData: { heroTitle: 'Uw aannemer in Hillegom', imageSrc: 'https://x/hillegom.jpg', items: [{ titel: 'Verbouw Hillegom' }] } },
  wpUrl: 'https://wp/x', status: 'Gepubliceerd'
};

test('vervangPlaats werkt op hele woorden', () => {
  assert.strictEqual(vervangPlaats('In Hillegom en Hillegoms', 'Hillegom', 'Lisse'), 'In Lisse en Hillegoms');
});

test('titelVoorPlaats vervangt of voegt toe', () => {
  assert.strictEqual(titelVoorPlaats('Aannemer Hillegom', 'Hillegom', 'Lisse'), 'Aannemer Lisse');
  assert.strictEqual(titelVoorPlaats('Aannemer', '', 'Lisse'), 'Aannemer Lisse');
});

test('modus opzet: geen content, oude lokale informatie weg, nieuwe erbij', () => {
  const k = bouwKopie(origineel, { invoer: { plaatsnaam: 'Lisse' }, lokaleGegevens: '* Wijk A\nWijk B', datum: '2026-09-30' });
  assert.strictEqual(k.content, null);
  assert.strictEqual(k.titel, 'Aannemer Lisse');
  assert.strictEqual(k.slug, 'aannemer-lisse');
  assert.strictEqual(k.invoer.plaatsnaam, 'Lisse');
  assert.deepStrictEqual(k.feitensheet.extra.map((f) => f.waarde), ['Blijft', 'Wijk A', 'Wijk B']);
  assert.match(k.feitensheet.extra[1].bron, /opgegeven door de beheerder.*Lisse.*2026-09-30/);
  assert.strictEqual(k.wpUrl, undefined);
  assert.strictEqual(k.status, undefined);
});

test('modus kopieer: tekst mee met vervangen plaats, urls blijven', () => {
  const k = bouwKopie(origineel, { invoer: { plaatsnaam: 'Lisse' }, modus: 'kopieer' });
  assert.strictEqual(k.content.meta.metaTitle, 'Aannemer in Lisse');
  assert.strictEqual(k.content.slotData.heroTitle, 'Uw aannemer in Lisse');
  assert.strictEqual(k.content.slotData.items[0].titel, 'Verbouw Lisse');
  assert.strictEqual(k.content.slotData.imageSrc, 'https://x/hillegom.jpg');
  assert.strictEqual(origineel.content.slotData.heroTitle, 'Uw aannemer in Hillegom');
});

test('lokaleFeiten slaat lege regels over', () => {
  assert.strictEqual(lokaleFeiten('\n  \n', 'Lisse', 'd').length, 0);
});

const tekstA = 'Wij verbouwen uw woning in Hillegom met zorg en aandacht voor elk detail en leveren altijd op tijd op.';
const pag = (plaats, tekst, titel) => ({ titel: titel || `Pagina ${plaats}`, invoer: { plaatsnaam: plaats }, content: { slotData: { heroIntro: tekst } } });

test('gelijkenis: alleen plaats gewisseld telt als bijna gelijk', () => {
  const a = pag('Hillegom', tekstA);
  const b = pag('Lisse', tekstA.replace('Hillegom', 'Lisse'));
  const w = g.gelijkenisWaarschuwingen(a, [b]);
  assert.strictEqual(w.length, 1);
  assert.match(w[0], /100%/);
});

test('gelijkenis: andere tekst geeft geen waarschuwing', () => {
  const a = pag('Hillegom', tekstA);
  const b = pag('Lisse', 'Een ander verhaal over keukens, badkamers en aanbouwen met veel eigen voorbeelden uit de buurt.');
  assert.strictEqual(g.gelijkenisWaarschuwingen(a, [b]).length, 0);
});

test('restanten: plaats van zusterpagina in de tekst', () => {
  const a = pag('Lisse', 'Wij bouwen in Lisse en ook nog in Hillegom voor u.');
  const w = g.restantWaarschuwingen(a, [pag('Hillegom', 'x y z')]);
  assert.strictEqual(w.length, 1);
  assert.match(w[0], /Hillegom/);
  assert.strictEqual(g.restantWaarschuwingen(pag('Lisse', 'Alleen Lisse hier'), [pag('Hillegom', 'x')]).length, 0);
});

test('werkgebied: zacht waarschuwen als plaats ontbreekt', () => {
  assert.match(g.werkgebiedWaarschuwing('Lisse', 'Hillegom en omstreken'), /werkgebied/);
  assert.strictEqual(g.werkgebiedWaarschuwing('Hillegom', 'Hillegom en omstreken'), null);
  assert.strictEqual(g.werkgebiedWaarschuwing('Lisse', ''), null);
});

test('heeftLokaleGegevens', () => {
  assert.strictEqual(g.heeftLokaleGegevens({ extra: [{ label: 'Lokale informatie Lisse', waarde: 'x' }] }), true);
  assert.strictEqual(g.heeftLokaleGegevens({ extra: [{ label: 'Ander', waarde: 'x' }] }), false);
  assert.strictEqual(g.heeftLokaleGegevens(null), false);
});

test('zusterblok in de prompt', () => {
  assert.strictEqual(bouwZusterBlok([]), '');
  assert.match(bouwZusterBlok([{ titel: 'T', tekst: 'abc' }]), /NIET op deze zusterpagina/);
});
