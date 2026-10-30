// Meting 30-10-2026: AI bezoekers, eerder gelezen, waarde van de klikken en zoekopdrachten op de naam.
const test = require('node:test');
const assert = require('node:assert/strict');
const { bouwPrestaties, schoonPad, cpcKaart, rijenVanPeriode } = require('../src/services/prestaties');
const meting = require('../src/lp/meting');

const overzicht = { periode_start: '2026-09-30', periode_eind: '2026-10-27', clicks: 10, vertoningen: 500 };
const blog = (o) => ({ titel: 'Blog', publicatiedatum: '2026-07-01', vertoningen: 100, clicks: 0, hoofdkeyword: '', zoekwoorden: '[]', ...o });

test('schoonPad en cpcKaart volgen de n8n paden', () => {
  assert.equal(schoonPad('https://www.x.nl/News/Blog-A/?utm_source=chatgpt.com'), '/news/blog-a');
  assert.deepEqual(cpcKaart([{ pad: '/news/blog-a/', cpc: 1.5 }, { pad: '/b', cpc: null }, { pad: '/c', cpc: -1 }]), { '/news/blog-a': 1.5 });
});

test('waarde telt alleen klikken met een bekende klikprijs', () => {
  const r = bouwPrestaties({
    overzicht, weken: [],
    blogs: [blog({ blog_pad: '/news/a', clicks: 6 }), blog({ blog_pad: '/news/b', clicks: 4 })],
    cpcRijen: [{ pad: '/news/a', cpc: 2.5 }]
  }, '2026-10-30');
  assert.deepEqual(r.totalen.waarde, { bedrag: 15, klikkenMetPrijs: 6, klikken: 10, dekking: 60 });
  assert.equal(r.blogs.find((b) => b.url === '' && b.cpc === 2.5).clicks, 6);
});

test('zonder klikprijzen, totalen of merkdata verschijnen de tegels niet', () => {
  const r = bouwPrestaties({ overzicht, weken: [], blogs: [blog({ blog_pad: '/a' })] }, '2026-10-30');
  assert.equal(r.totalen.waarde, null);
  assert.equal(r.totalen.ai, null);
  assert.equal(r.totalen.eerderGelezen, null);
  assert.equal(r.totalen.merk, null);
});

test('AI bezoekers en eerder gelezen komen uit conversie_totalen', () => {
  const r = bouwPrestaties({
    overzicht, weken: [], klantNaam: 'Basecamp Utrecht',
    blogs: [blog({ blog_pad: '/news/a' })],
    conversies: [{ blog_pad: '/news/a', sessies_ai: 3, leads: 1, ondersteund_leads: 2 }],
    conversieTotaal: { sessies_ai: 9, leads_ai: 1, boekingen_ai: 0, ai_bronnen: '[{"bron":"chatgpt.com","sessies":7}]', ondersteund_actief: true, ondersteund_blog_leads: 2, ondersteund_blog_boekingen: 0, leads_totaal: 5, boekingen_totaal: 1 }
  }, '2026-10-30');
  assert.equal(r.totalen.ai.sessies, 9);
  assert.equal(r.totalen.ai.sessiesBlogs, 3);
  assert.equal(r.totalen.ai.bronnen[0].bron, 'chatgpt.com');
  assert.deepEqual([r.totalen.eerderGelezen.leads, r.totalen.eerderGelezen.leadsTotaal], [2, 5]);
  assert.equal(r.blogs[0].gedrag.ondersteundLeads, 2);
});

test('eerder gelezen blijft leeg als de GTM meting niet aan staat', () => {
  const r = bouwPrestaties({ overzicht, weken: [], blogs: [], conversieTotaal: { sessies_ai: 0, ondersteund_actief: false } }, '2026-10-30');
  assert.equal(r.totalen.eerderGelezen, null);
  assert.equal(r.totalen.ai.sessies, 0);
});

test('merkzoekopdrachten met de periode ervoor', () => {
  const r = bouwPrestaties({ overzicht, weken: [], blogs: [], merk: { klikken: 12, vertoningen: 80, vorige_klikken: 8, vorige_vertoningen: 60, zoektermen: '[{"q":"basecamp utrecht","c":10}]' } }, '2026-10-30');
  assert.equal(r.totalen.merk.vertoningen, 80);
  assert.equal(r.totalen.merk.vertoningenVorig, 60);
  assert.equal(r.totalen.merk.zoektermen[0].q, 'basecamp utrecht');
});

test('conversies per periode, oude rijen zonder periode tellen als 28 dagen', () => {
  const rijen = [{ blog_pad: '/a', leads: 1 }, { blog_pad: '/a', leads: 4, periode_type: '90d' }];
  assert.equal(rijenVanPeriode(rijen, '28d')[0].leads, 1);
  assert.equal(rijenVanPeriode(rijen, '90d')[0].leads, 4);
  assert.equal(rijenVanPeriode(rijen, 'maand').length, 0);
});

test('Pagr. pagina krijgt website en waarde op basis van het pad', async () => {
  const tabelFn = async (id) => (id === 'NaN8CfgSzlgDIb90'
    ? [{ pad: '/badkamer-renoveren-haarlem', periode_type: '28d', sessies_totaal: 20, sessies_ai: 2, leads: 1, doorkliks_contact: 3, ondersteund_leads: 2 }]
    : [{ pad: '/badkamer-renoveren-haarlem', cpc: 3.2 }]);
  const website = await meting.haalWebsite('Testklant Pagr', { tabelFn });
  const google = { beschikbaar: true, perUrl: { [meting.schoon('https://www.hirs.nl/badkamer-renoveren-haarlem/')]: { vertoningen: 100, klikken: 5, positie: 8, vorigeVertoningen: 0, vorigeKlikken: 0 } } };
  const [p] = meting.verrijkMetMeting([{ stand: 'Live', url: 'https://www.hirs.nl/badkamer-renoveren-haarlem/' }], google, { beschikbaar: false }, website);
  assert.equal(p.google.waarde, 16);
  assert.deepEqual(p.website, { sessies: 20, sessiesGoogle: null, sessiesAi: 2, leads: 1, boekingen: null, doorkliks: 3, eerderGelezen: 2 });
  const leeg = meting.verrijkMetMeting([{ stand: 'Live', url: 'https://x.nl/a' }], google, { beschikbaar: false }, meting.leegMeting().website);
  assert.equal(leeg[0].website, null);
  assert.equal(leeg[0].google.waarde, null);
});

test('websiteTekst in de agenda', () => {
  global.window = global.window || {};
  const F = require('../public/portaal-format.js');
  window.PortaalFormat = window.PortaalFormat || F;
  const A = require('../public/paginas-agenda.js');
  const p = { stand: 'Live', website: { sessies: 20, leads: 1, boekingen: null, doorkliks: 3, eerderGelezen: 2, sessiesAi: 2 }, google: { waarde: 16 } };
  assert.equal(A.websiteTekst(p, { website: true }), '1 aanvraag, 3 naar contact, 2 na eerder lezen, 2 via AI');
  assert.equal(A.websiteTekst(p, { website: false }), 'nog niet gemeten');
  assert.match(A.waardeTekst(p, { waarde: true }), /16/);
});
