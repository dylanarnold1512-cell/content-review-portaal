const test = require('node:test');
const assert = require('node:assert/strict');
const { bouwSjabloon, vindLayoutCssUrls } = require('../src/lp/bbSjabloon');
const { renderSlotTemplate, templateSafetyCheck } = require('../src/lp/slotEngine');

const HTML = `<html><body><div class="fl-builder-content fl-builder-content-1"><div class="fl-row fl-row-full-width fl-node-r1" data-node="r1"><div class="fl-row-content-wrap"><div class="fl-col-group"><div class="fl-col fl-node-c1"><div class="fl-col-content">
<div class="fl-module fl-module-heading fl-node-h1 fl-animation fl-fade-in"><div class="fl-module-content"><h2 class="fl-heading"><span class="fl-heading-text">Ga je naar BAEST&#8217;s festival?</span></h2></div></div>
<div class="fl-module fl-module-rich-text fl-node-t1"><div class="fl-module-content"><div class="fl-rich-text"><p>Boek <strong>nu</strong> je bed &amp; ontbijt.</p><p>Tweede alinea</p></div></div></div>
<div class="fl-module fl-module-button fl-node-b1"><div class="fl-module-content"><div class="fl-button-wrap"><a href="https://www.hostelroots.nl/rooms/" class="fl-button"><span class="fl-button-text">Boek nu</span></a></div></div></div>
<div class="fl-module fl-module-photo fl-node-p1"><img src="https://www.hostelroots.nl/wp-content/uploads/a.jpg" srcset="x 1x" alt="Een kamer" loading="lazy"></div>
<script>alert(1)</script><noscript><img src="https://x/y.jpg"></noscript>
</div></div></div></div></div><div class="fl-row fl-node-r2"><div class="fl-row-content-wrap"><h3>Tweede sectie</h3></div></div></div></body></html>`;
const CSS = `.fl-node-r2 > .fl-row-content-wrap{background-image:url(https://www.hostelroots.nl/wp-content/uploads/bg.jpg);padding:10px}.fl-node-r1{color:red}@font-face{src:url(https://x/f.woff)}`;

test('bbSjabloon: tekst, foto, link en achtergrond worden slots, scripts en animaties verdwijnen', () => {
  const r = bouwSjabloon({ html: HTML, css: CSS, titel: 'Hostel' });
  const bp = r.blueprint;
  assert.equal(bp.templateFormat, 'slots');
  assert.match(bp.htmlTemplate, /<h1 class="fl-heading"><span class="fl-heading-text">\{\{heroTitle\}\}/);
  assert.match(bp.htmlTemplate, /href="\{\{ctaHref\}\}"/);
  assert.match(bp.htmlTemplate, /\{\{ctaLabel\}\}/);
  assert.match(bp.htmlTemplate, /src="\{\{foto1ImageSrc\}\}"/);
  assert.match(bp.htmlTemplate, /<section class="fl-row fl-node-r2"/);
  assert.doesNotMatch(bp.htmlTemplate, /<script|noscript|srcset|fl-animation|fl-fade-in/);
  assert.equal(bp.voorbeeldSlotData.heroTitle, 'Ga je naar BAEST’s festival?');
  assert.equal(bp.voorbeeldSlotData.s1Tekst1, 'Boek nu je bed & ontbijt.');
  assert.doesNotMatch(bp.cssTemplate, /https?:/);
  assert.equal(templateSafetyCheck(bp.htmlTemplate, bp.cssTemplate).ok, true);
});

test('bbSjabloon: het sjabloon rendert terug naar dezelfde tekst', () => {
  const bp = bouwSjabloon({ html: HTML, css: CSS, titel: 'Hostel' }).blueprint;
  const uit = renderSlotTemplate(bp.htmlTemplate, bp.voorbeeldSlotData);
  assert.match(uit, /Boek nu je bed &amp; ontbijt\./);
  assert.match(uit, /Een kamer/);
  assert.match(uit, /a\.jpg/);
});

test('bbSjabloon: geen Beaver Builder inhoud geeft een duidelijke fout', () => {
  assert.throws(() => bouwSjabloon({ html: '<html><body><p>x</p></body></html>', css: '' }), /fl-builder-content/);
});

test('vindLayoutCssUrls vindt de layout stylesheet', () => {
  const u = vindLayoutCssUrls('<link rel="stylesheet" href="/wp-content/uploads/bb-plugin/cache/14894-layout.css?ver=1" media="all"><link href="/x.css">', 'https://www.hostelroots.nl/hostel-breda/');
  assert.deepEqual(u, ['https://www.hostelroots.nl/wp-content/uploads/bb-plugin/cache/14894-layout.css?ver=1']);
});

test('bbSjabloon: opmaakregels van de kop die H1 wordt volgen de nieuwe tag', () => {
  const html = '<div class="fl-builder-content"><div class="fl-row fl-node-r1"><div class="fl-module fl-module-heading fl-node-h1x"><div class="fl-module-content"><h2 class="fl-heading"><span class="fl-heading-text">Kop</span></h2></div></div></div></div>';
  const css = '.fl-node-h1x h2.fl-heading a,.fl-node-h1x h2.fl-heading .fl-heading-text{font-size:30px}.fl-node-zz h2.fl-heading{color:red}';
  const bp = bouwSjabloon({ html, css }).blueprint;
  assert.match(bp.cssTemplate, /\.fl-node-h1x h1\.fl-heading \.fl-heading-text\{font-size:30px\}/);
  assert.match(bp.cssTemplate, /\.fl-node-zz h2\.fl-heading\{color:red\}/);
});

test('themaRegelsVoorTag: neemt de regels voor een kale h2 over, ook in media queries', () => {
  const { themaRegelsVoorTag } = require('../src/lp/bbSjabloon');
  const uit = themaRegelsVoorTag('h1,h2,h3{margin:0}h1{font-size:50px}h2{font-size:40px}@media (max-width:600px){h2{font-size:28px}h1{font-size:34px}}.x h2{color:red}', 'h2', '.k h1');
  assert.equal(uit, '.k h1{margin:0}.k h1{font-size:40px}@media (max-width:600px){.k h1{font-size:28px}}');
});

test('bbSjabloon: layout CSS komt in een @layer zodat het thema voorrang houdt, net als op de originele pagina', () => {
  const bp = bouwSjabloon({ html: HTML, css: CSS, titel: 'Hostel' }).blueprint;
  assert.match(bp.cssTemplate, /^@layer lpbb\{/);
  assert.match(bp.cssTemplate, /\.fl-node-r1\{color:red\}/);
});
