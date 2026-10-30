const test = require('node:test');
const assert = require('node:assert');
const ui = require('../public/portaal-ui.js');

test('esc maakt tekst veilig', () => {
  assert.strictEqual(ui.esc('<b>"a" & \'b\'</b>'), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
  assert.strictEqual(ui.esc(null), '');
  assert.strictEqual(ui.esc(0), '0');
});

test('pil zet de tekst veilig en kent vaste tonen', () => {
  assert.strictEqual(ui.pil('Gepland', 'plan'), '<span class="p-pil p-pil-plan">Gepland</span>');
  assert.ok(ui.pil('x', 'rood-met-gouden-randje').includes('p-pil-neutraal'));
  assert.ok(ui.pil('<script>', 'goed').includes('&lt;script&gt;'));
});

test('voortgang houdt aandelen binnen 0 en 100', () => {
  const h = ui.voortgang([{ aandeel: 150, toon: 'goed' }, { aandeel: -5, toon: 'plan' }, { aandeel: 'x', toon: 'onbekend' }], '13 van 28');
  assert.ok(h.includes('width:100%'));
  assert.ok(h.includes('width:0%'));
  assert.ok(h.includes('aria-label="13 van 28"'));
  assert.ok(h.includes('p-balk-neutraal'));
  assert.strictEqual(ui.voortgang(undefined).includes('<i'), false);
});

test('staafjes: laagste staaf is minimaal zichtbaar en lege lijst geeft niets', () => {
  assert.strictEqual(ui.staafjes([]), '');
  assert.strictEqual(ui.staafjes(undefined), '');
  const h = ui.staafjes([0, 5, 10]);
  assert.ok(h.includes('height:2px'));
  assert.ok(h.includes('height:30px'));
});

test('kaart toont kop, uitleg, aantal en een actie naar een tabblad', () => {
  const h = ui.kaart({ titel: 'Komende blogs', uitleg: 'Wat er aankomt', aantal: '5 van 15', actie: { tekst: 'Hele planning', tab: 'blogs' }, inhoud: '<p>x</p>' });
  assert.ok(h.includes('<h2 class="p-kaart-titel">Komende blogs</h2>'));
  assert.ok(h.includes('Wat er aankomt'));
  assert.ok(h.includes('5 van 15'));
  assert.ok(h.includes('data-tab="blogs"'));
  assert.ok(h.includes('<p>x</p>'));
});

test('kaart zonder titel heeft geen kop en geen actie', () => {
  const h = ui.kaart({ inhoud: 'binnenkant' });
  assert.strictEqual(h.includes('p-kaart-kop'), false);
  assert.ok(h.includes('binnenkant'));
});

test('kaart zet titel en actie veilig, maar inhoud is bewust al HTML', () => {
  const h = ui.kaart({ titel: '<img src=x>', actie: { tekst: '"x"', tab: 'a" onclick="y' } });
  assert.strictEqual(h.includes('<img src=x>'), false);
  assert.strictEqual(h.includes('onclick="y'), false);
});

test('kerncijfer toont waarde, verschil en vergelijking', () => {
  const h = ui.kerncijfer({ label: 'Keer getoond in Google', icoon: 'oog', waarde: '3.338', verschil: { tekst: '+63%', toon: 'goed' }, vergelijking: '2.046 in de 28 dagen ervoor', staafjes: [1, 2, 3] });
  assert.ok(h.includes('3.338'));
  assert.ok(h.includes('p-verschil-goed'));
  assert.ok(h.includes('+63%'));
  assert.ok(h.includes('2.046 in de 28 dagen ervoor'));
  assert.ok(h.includes('p-staafjes'));
});

test('kerncijfer zonder vergelijking toont geen verschil en geen lege regels', () => {
  const h = ui.kerncijfer({ label: 'Blogs live', waarde: '13' });
  assert.strictEqual(h.includes('p-verschil'), false);
  assert.strictEqual(h.includes('p-kerncijfer-sub'), false);
});

test('kerncijfer met onbekende verschiltoon valt terug op gelijk', () => {
  const h = ui.kerncijfer({ label: 'x', waarde: '1', verschil: { tekst: '+1', toon: 'paars' } });
  assert.ok(h.includes('p-verschil-gelijk'));
});

test('kerncijfer zet tekst veilig', () => {
  const h = ui.kerncijfer({ label: '<i>x</i>', waarde: '<b>1</b>', eenheid: '<u>%</u>' });
  assert.strictEqual(h.includes('<b>1</b>'), false);
  assert.strictEqual(h.includes('<i>x</i>'), false);
  assert.strictEqual(h.includes('<u>%</u>'), false);
});

test('kerncijfers zet de strook om elke tegel', () => {
  const h = ui.kerncijfers([{ label: 'a', waarde: '1' }, { label: 'b', waarde: '2' }]);
  assert.strictEqual((h.match(/p-kerncijfer"/g) || []).length, 2);
  assert.ok(h.startsWith('<section class="p-kerncijfers">'));
  assert.strictEqual(ui.kerncijfers(undefined), '<section class="p-kerncijfers"></section>');
});

test('legeStand zegt wat er hoort te staan en kiest een soort', () => {
  const h = ui.legeStand({ soort: 'wacht', titel: 'De eerste meting volgt', tekst: 'Google heeft een paar weken nodig.' });
  assert.ok(h.includes('p-leeg-wacht'));
  assert.ok(h.includes('De eerste meting volgt'));
  assert.ok(h.includes('Google heeft een paar weken nodig.'));
  assert.ok(ui.legeStand({ soort: 'raar', titel: 't' }).includes('p-leeg-neutraal'));
  assert.ok(ui.legeStand({ soort: 'klaar', titel: 't' }).includes('p-leeg-klaar'));
});

test('foutStand en oudeStand zijn een melding met rol status', () => {
  const f = ui.foutStand({ titel: 'Cijfers niet opgehaald', tekst: 'Blogs lopen door.' });
  assert.ok(f.includes('role="status"'));
  assert.ok(f.includes('Blogs lopen door.'));
  const o = ui.oudeStand('Stand van 12 okt.');
  assert.ok(o.includes('Stand van 12 okt.'));
  assert.ok(o.includes('role="status"'));
});

test('laden geeft blokken met begrensde afmetingen', () => {
  const h = ui.laden([{ breedte: '40%', hoogte: 22 }, { breedte: 'url(x)', hoogte: 99999 }, { breedte: '80px', hoogte: 1 }]);
  assert.ok(h.includes('width:40%;height:22px'));
  assert.ok(h.includes('width:100%;height:400px'));
  assert.ok(h.includes('width:80px;height:8px'));
  assert.ok(h.includes('aria-busy="true"'));
  assert.ok(ui.laden().includes('p-sk'));
});

test('icoon kent alleen bekende namen', () => {
  assert.ok(ui.icoon('oog').includes('<svg'));
  assert.strictEqual(ui.icoon('bestaat-niet'), '');
});

test('kerncijfer toont een i icoon met uitleg en escapet de tekst', () => {
  const U = require('../public/portaal-ui.js');
  const html = U.kerncijfer({ label: 'Test', waarde: '5', info: 'Uitleg <b>x</b>' });
  assert.ok(html.includes('data-p-info'));
  assert.ok(html.includes('Uitleg &lt;b&gt;x&lt;/b&gt;'));
  assert.ok(!U.kerncijfer({ label: 'Test', waarde: '5' }).includes('data-p-info'));
});
