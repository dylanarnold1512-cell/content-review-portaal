const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../src/services/cockpit');
const model = require('../public/cockpit.js');

const NU = new Date('2026-10-27T12:00:00Z').getTime();
const sv = { idea: 'Idee', planned: 'Gepland', generating: 'In generatie', review: 'Ter review', approved: 'Goedgekeurd', published: 'Gepubliceerd' };
const blog = (status, datum, extra = {}) => ({ titel: `Blog ${status} ${datum || ''}`, status, publicatiedatum: datum || '', laatstGewijzigd: '2026-10-27T11:00:00Z', ...extra });
const signalen = (blogs, opts = {}) => c.blogSignalen(blogs, { statussen: sv, blogsPerMaand: null, nu: NU, ...opts }).signalen;
const niveaus = (lijst) => lijst.map((s) => s.niveau);

test('een gezonde planning geeft geen rode of oranje signalen', () => {
  const s = signalen([blog('Gepubliceerd', '2026-10-20'), blog('Gepland', '2026-11-03')]);
  assert.deepEqual(niveaus(s).filter((n) => n !== 'info'), []);
});

test('een blog op Fout is rood en noemt de titel', () => {
  const s = signalen([blog('Fout', '2026-10-26'), blog('Gepubliceerd', '2026-10-20'), blog('Gepland', '2026-11-03')]);
  assert.equal(s[0].niveau, 'rood');
  assert.match(s[0].tekst, /1 blog staat op Fout/);
  assert.equal(s[0].details.length, 1);
});

test('In generatie is pas vastgelopen na 6 uur', () => {
  const kort = signalen([blog('In generatie', '2026-10-28', { laatstGewijzigd: '2026-10-27T09:00:00Z' }), blog('Gepubliceerd', '2026-10-20')]);
  assert.ok(!kort.some((x) => /hangt/.test(x.tekst)));
  const lang = signalen([blog('In generatie', '2026-10-27', { laatstGewijzigd: '2026-10-26T20:00:00Z' }), blog('Gepubliceerd', '2026-10-20')]);
  assert.ok(lang.some((x) => x.niveau === 'rood' && /hangt/.test(x.tekst)));
});

test('In generatie met een publicatiedatum in de toekomst is een wachtrij, geen storing', () => {
  const wacht = signalen([blog('In generatie', '2026-11-02', { laatstGewijzigd: '2026-10-09T07:57:00Z' }), blog('Gepubliceerd', '2026-10-20')]);
  assert.ok(!wacht.some((x) => /hangt|hangen/.test(x.tekst)));
});

test('een geplande blog met een datum die ruim voorbij is, is oranje', () => {
  const s = signalen([blog('Gepland', '2026-10-20'), blog('Gepland', '2026-11-01'), blog('Gepubliceerd', '2026-10-19')]);
  assert.ok(s.some((x) => x.niveau === 'oranje' && /niet geschreven/.test(x.tekst)));
  const gisteren = signalen([blog('Gepland', '2026-10-26'), blog('Gepubliceerd', '2026-10-19')]);
  assert.ok(!gisteren.some((x) => /niet geschreven/.test(x.tekst)));
});

test('een lege planning geeft oranje, behalve bij 0 blogs per maand', () => {
  const s = signalen([blog('Gepubliceerd', '2026-10-20')]);
  assert.ok(s.some((x) => x.niveau === 'oranje' && /Geen blog gepland/.test(x.tekst)));
  assert.ok(!signalen([blog('Gepubliceerd', '2026-10-20')], { blogsPerMaand: 0 }).some((x) => /Geen blog gepland/.test(x.tekst)));
  assert.ok(!signalen([blog('Gepubliceerd', '2026-10-20'), blog('Ter review', '2026-12-20')]).some((x) => /Geen blog gepland/.test(x.tekst)));
});

test('lang geen publicatie is oranje, nog nooit gepubliceerd is alleen info', () => {
  assert.ok(signalen([blog('Gepubliceerd', '2026-09-01'), blog('Gepland', '2026-11-01')]).some((x) => x.niveau === 'oranje' && /Laatste publicatie/.test(x.tekst)));
  const nieuw = signalen([blog('Gepland', '2026-11-01')]);
  assert.deepEqual(niveaus(nieuw), ['info']);
});

test('mislukte runs: laatste 48 uur rood, ouder oranje, gegroepeerd per workflow', () => {
  const s = c.foutSignalen([
    { id: '1', workflowId: 'a', workflowNaam: 'BA - BCU - Blog Generatie', startedAt: '2026-10-27T06:00:00Z', bericht: 'Notion 400', node: 'Haal blogs op' },
    { id: '2', workflowId: 'a', workflowNaam: 'BA - BCU - Blog Generatie', startedAt: '2026-10-24T06:00:00Z' },
    { id: '3', workflowId: 'b', workflowNaam: 'BA - BCU - Publicatie Sync', startedAt: '2026-10-22T06:00:00Z' }
  ], NU);
  assert.equal(s.length, 2);
  const a = s.find((x) => /Blog Generatie/.test(x.tekst));
  assert.equal(a.niveau, 'rood');
  assert.match(a.tekst, /2 mislukte runs/);
  assert.match(a.details[0], /Haal blogs op: Notion 400/);
  assert.match(a.link, /\/workflow\/a\/executions\/1$/);
  assert.equal(s.find((x) => /Publicatie/.test(x.tekst)).niveau, 'oranje');
});

test('workflows worden aan de juiste klant gekoppeld', () => {
  assert.equal(c.klantVanWorkflow('BA - BCU - Blog Generatie'), 'basecamp-utrecht');
  assert.equal(c.klantVanWorkflow('BA - PPE - Topic Generator'), 'ppe');
  assert.equal(c.klantVanWorkflow('BA - Shared - Blog Generatie'), null);
  assert.ok(c.isBlogWorkflow('BA - Shared - Blog Generatie'));
  assert.ok(!c.isBlogWorkflow('BA - Test - Blogprompt Shared TBG'));
  assert.ok(!c.isBlogWorkflow('Excel Rapportages - Alle Klanten'));
});

test('verwacht interval uit de schedule trigger', () => {
  const wf = (rule) => ({ nodes: [{ type: 'n8n-nodes-base.scheduleTrigger', parameters: { rule } }] });
  assert.equal(c.verwachtInterval(wf({ interval: [{ field: 'hours' }] })), 1);
  assert.equal(c.verwachtInterval(wf({ interval: [{ field: 'days', triggerAtHour: 8 }] })), 24);
  assert.equal(c.verwachtInterval(wf({ interval: [{ field: 'weeks' }] })), 168);
  assert.equal(c.verwachtInterval(wf({ interval: [{ field: 'months' }] })), 744);
  assert.equal(c.verwachtInterval(wf({ interval: [{ field: 'cronExpression', expression: '0 9 * * *' }] })), 24);
  assert.equal(c.verwachtInterval(wf({ interval: [{ field: 'cronExpression', expression: '0 * * * 1' }] })), 168);
  assert.equal(c.verwachtInterval({ nodes: [{ type: 'n8n-nodes-base.webhook' }] }), null);
});

test('stilgevallen pas na twee keer het interval plus marge', () => {
  assert.equal(c.isStilgevallen(24, '2026-10-26T08:00:00Z', NU), false);
  assert.equal(c.isStilgevallen(24, '2026-10-24T08:00:00Z', NU), true);
  assert.equal(c.isStilgevallen(1, '2026-10-27T10:00:00Z', NU), false);
  assert.equal(c.isStilgevallen(1, '2026-10-27T06:00:00Z', NU), true);
  assert.equal(c.isStilgevallen(24, null, NU), false);
});

test('kleur en volgorde: rood boven oranje boven groen boven uit', () => {
  assert.equal(c.kleurVan([{ niveau: 'info' }]), 'groen');
  assert.equal(c.kleurVan([{ niveau: 'oranje' }, { niveau: 'rood' }]), 'rood');
  const lijst = c.sorteerKlanten([{ naam: 'B', kleur: 'groen' }, { naam: 'A', kleur: 'uit' }, { naam: 'C', kleur: 'rood' }, { naam: 'D', kleur: 'oranje' }]);
  assert.deepEqual(lijst.map((k) => k.naam), ['C', 'D', 'B', 'A']);
});

test('menu teller telt de rode en oranje meldingen, zonder info en zonder steekproef', () => {
  const data = {
    klanten: [{ signalen: [{ niveau: 'rood' }, { niveau: 'oranje' }, { niveau: 'info' }] }, { signalen: [{ niveau: 'oranje' }] }, { signalen: [] }],
    gedeeld: { signalen: [{ niveau: 'rood' }] },
    steekproef: { blogs: [{}, {}, {}] }
  };
  assert.equal(model.aandacht(data), 4);
  assert.equal(model.aandacht({ klanten: [{ signalen: [] }], gedeeld: { signalen: [] } }), 0);
  assert.equal(model.aandacht(null), 0);
});

test('bekijk als klant: een admin komt door requireLogin, ook bij een gepauzeerde klant', async () => {
  const settings = require('../src/services/settings');
  const { requireLogin } = require('../src/middleware/auth');
  const origineel = settings.getClientSettings;
  settings.getClientSettings = async () => ({ klantstatus: 'gepauzeerd' });
  try {
    let door = false;
    await requireLogin({ params: { clientId: 'ppe' }, body: {}, session: { clientId: 'ppe', isAdmin: true } }, {}, () => { door = true; });
    assert.equal(door, true);
  } finally {
    settings.getClientSettings = origineel;
  }
});

const qa = (datum, extra = {}) => ({ klant: 'X', gebeurtenis: 'qa_gate', uitkomst: 'niet geslaagd', datum, redenen: 'Keyword onnatuurlijk', ...extra });

test('kwaliteit: 3 QA afkeuringen in 14 dagen is oranje, 2 niet, oude tellen niet', () => {
  assert.equal(c.kwaliteitSignalen([qa('2026-10-20'), qa('2026-10-22')], NU).length, 0);
  const s = c.kwaliteitSignalen([qa('2026-10-20'), qa('2026-10-22'), qa('2026-10-25', { redenen: 'Te kort' })], NU);
  assert.equal(s[0].niveau, 'oranje');
  assert.match(s[0].tekst, /3 QA afkeuringen/);
  assert.deepEqual(s[0].details, ['Keyword onnatuurlijk', 'Te kort']);
  assert.equal(c.kwaliteitSignalen([qa('2026-09-01'), qa('2026-09-02'), qa('2026-09-03')], NU).length, 0);
});

test('kwaliteit: afwijzingen door de klant vanaf 40% oranje, vanaf 60% rood, pas vanaf 3 beoordelingen', () => {
  const r = (g, datum) => ({ klant: 'X', gebeurtenis: g, uitkomst: g === 'klant_afgewezen' ? 'afgewezen' : 'goedgekeurd', datum, feedback_tekst: 'Te algemeen' });
  assert.equal(c.kwaliteitSignalen([r('klant_afgewezen', '2026-10-20'), r('klant_goedgekeurd', '2026-10-21')], NU).length, 0);
  const oranje = c.kwaliteitSignalen([r('klant_afgewezen', '2026-10-20'), r('klant_afgewezen', '2026-10-21'), r('klant_goedgekeurd', '2026-10-01'), r('klant_goedgekeurd', '2026-10-02'), r('klant_goedgekeurd', '2026-10-03')], NU);
  assert.equal(oranje[0].niveau, 'oranje');
  assert.match(oranje[0].tekst, /2 van 5 blogs af/);
  const rood = c.kwaliteitSignalen([r('klant_afgewezen', '2026-10-20'), r('klant_afgewezen', '2026-10-21'), r('klant_goedgekeurd', '2026-10-01')], NU);
  assert.equal(rood[0].niveau, 'rood');
});

test('kwaliteit: herschrijving die de controle niet haalt is oranje', () => {
  const s = c.kwaliteitSignalen([{ gebeurtenis: 'herschrijving_check', uitkomst: 'niet geslaagd', datum: '2026-10-20', redenen: 'woordaantal' }, { gebeurtenis: 'herschrijving_check', uitkomst: 'geslaagd', datum: '2026-10-21' }], NU);
  assert.equal(s.length, 1);
  assert.match(s[0].tekst, /1 herschrijving/);
});

test('data: daling in vertoningen en clicks, alleen bij genoeg verkeer', () => {
  const basis = { bijgewerkt: '2026-10-27T05:00:00Z' };
  assert.equal(c.dataSignalen({ ...basis, vertoningen: 900, vertoningen_vorig: 1000, clicks: 50, clicks_vorig: 55 }, NU).length, 0);
  const s = c.dataSignalen({ ...basis, vertoningen: 600, vertoningen_vorig: 1000, clicks: 20, clicks_vorig: 50 }, NU);
  assert.deepEqual(s.map((x) => [x.soort, x.niveau]), [['data', 'oranje'], ['data', 'rood']]);
  assert.equal(c.dataSignalen({ ...basis, vertoningen: 10, vertoningen_vorig: 100, clicks: 0, clicks_vorig: 5 }, NU).length, 0);
  assert.equal(c.dataSignalen(null, NU).length, 0);
});

test('data: prestatiedata die niet meer wordt bijgewerkt is een techniek signaal', () => {
  const s = c.dataSignalen({ bijgewerkt: '2026-10-20T05:00:00Z', vertoningen: 0, vertoningen_vorig: 0 }, NU);
  assert.equal(s[0].soort, 'techniek');
  assert.match(s[0].tekst, /7 dagen niet bijgewerkt/);
});

test('data: de rij van 28 dagen wordt gekozen, oude rij zonder periode als terugval', () => {
  const rijen = [{ client_name: 'Basecamp Utrecht', periode_type: '90d', clicks: 1 }, { client_name: 'basecamp utrecht', periode_type: '28d', clicks: 2 }, { client_name: 'PPExport', clicks: 3 }];
  assert.equal(c.overzichtVoorKlant(rijen, 'Basecamp Utrecht').clicks, 2);
  assert.equal(c.overzichtVoorKlant(rijen, 'PPExport').clicks, 3);
  assert.equal(c.overzichtVoorKlant(rijen, 'Onbekend'), null);
});

test('klant: lang wachtende reviews en lang niet ingelogd, alleen als review aan staat', () => {
  const blogs = [blog('Ter review', '2026-11-01', { laatstGewijzigd: '2026-10-15T10:00:00Z' }), blog('Ter review', '2026-11-02', { laatstGewijzigd: '2026-10-25T10:00:00Z' })];
  const s = c.klantSignalen({ blogs, statussen: sv, reviewEnabled: true, laatsteLogin: '2026-09-01', nu: NU });
  assert.equal(s.length, 2);
  assert.match(s[0].tekst, /1 blog wacht/);
  assert.match(s[1].tekst, /56 dagen niet in het portaal/);
  assert.equal(c.klantSignalen({ blogs, statussen: sv, reviewEnabled: false, laatsteLogin: '2026-09-01', nu: NU }).length, 0);
  assert.equal(c.klantSignalen({ blogs: [], statussen: sv, reviewEnabled: true, laatsteLogin: '', nu: NU }).length, 0);
});

test('samenvatting: alleen klanten die aandacht vragen, met link, zonder streepjes', () => {
  const data = {
    klanten: [
      { naam: 'Basecamp Utrecht', kleur: 'rood', signalen: [{ niveau: 'rood', tekst: '1 blog staat op Fout' }, { niveau: 'info', tekst: 'Nog geen gepubliceerde blog' }] },
      { naam: 'PPExport', kleur: 'groen', signalen: [] },
      { naam: 'Roots', kleur: 'uit', signalen: [] }
    ],
    gedeeld: { signalen: [{ niveau: 'oranje', tekst: 'BA - Shared - Blog Generatie: 1 mislukte run' }] },
    problemen: []
  };
  const t = c.samenvattingTekst(data, 'https://portaal.advertisr.nl/');
  assert.match(t, /1 direct aandacht, 0 let op, 1 draaien goed/);
  assert.match(t, /Basecamp Utrecht \(direct aandacht\)\n• 1 blog staat op Fout/);
  assert.ok(!/Nog geen gepubliceerde/.test(t));
  assert.ok(!/PPExport/.test(t));
  assert.match(t, /https:\/\/portaal\.advertisr\.nl\/admin#cockpit$/);
  const rustig = c.samenvattingTekst({ klanten: [{ naam: 'A', kleur: 'groen', signalen: [] }], gedeeld: { signalen: [] } });
  assert.match(rustig, /Alle 1 actieve klanten draaien goed/);
});

test('signalen worden gesorteerd op ernst en dan op soort', () => {
  const s = c.sorteerSignalen([{ niveau: 'oranje', soort: 'klant' }, { niveau: 'rood', soort: 'data' }, { niveau: 'oranje', soort: 'techniek' }]);
  assert.deepEqual(s.map((x) => x.soort), ['data', 'techniek', 'klant']);
});

const pub = (titel, datum, extra = {}) => ({ id: 'p' + titel, titel, status: 'Gepubliceerd', publicatiedatum: datum, liveUrl: `https://site.nl/blog/${titel}/`, seoTitle: 'T', seoDescription: 'D', laatstGewijzigd: '2026-10-01T00:00:00Z', ...extra });

test('blog: pad wordt overal hetzelfde gelezen', () => {
  assert.equal(c.padVan('https://www.site.nl/Blog/Test/'), '/blog/test');
  assert.equal(c.padVan('/blog/test'), '/blog/test');
  assert.equal(c.padVan(''), '');
});

test('blog: interne links, lengte, koppen, SEO en afbeelding', () => {
  const blogs = [pub('a', '2026-10-01'), pub('b', '2026-10-05', { seoDescription: '' }), pub('oud', '2026-01-01')];
  const inventaris = [
    { pad: '/blog/a/', links_intern: 0, woorden: 450, koppen: 0 },
    { pad: '/blog/b', links_intern: 3, woorden: 900, koppen: 4 },
    { pad: '/blog/oud', links_intern: 0, woorden: 100, koppen: 0 }
  ];
  const s = c.blogInhoudSignalen({ blogs, statussen: sv, inventaris, indexatie: [], heeftSeoVelden: true, zonderAfbeelding: ['b'], nu: NU });
  const teksten = s.map((x) => x.tekst).join(' | ');
  assert.match(teksten, /1 blog mist een SEO titel/);
  assert.match(teksten, /1 blog heeft geen enkele interne link/);
  assert.ok(!/woorden/.test(teksten), 'lengte telt niet mee');
  assert.match(teksten, /1 blog heeft geen tussenkoppen/);
  assert.match(teksten, /1 blog heeft geen uitgelichte afbeelding/);
  assert.ok(s.every((x) => x.soort === 'blog'));
  assert.ok(!teksten.includes('oud'));
});

test('blog: indexatie, geblokkeerd rood, niet in Google pas na 21 dagen', () => {
  const blogs = [pub('a', '2026-09-20'), pub('b', '2026-10-20'), pub('c', '2026-10-01')];
  const indexatie = [
    { blog_pad: '/blog/a/', status_code: 'gecrawld_niet_geindexeerd' },
    { blog_pad: '/blog/b/', status_code: 'ontdekt_niet_geindexeerd' },
    { blog_pad: '/blog/c/', status_code: 'geblokkeerd', status_tekst: 'Geblokkeerd door robots.txt' },
    { blog_pad: '/andere-pagina/', status_code: 'geblokkeerd' }
  ];
  const s = c.blogInhoudSignalen({ blogs, statussen: sv, inventaris: [], indexatie, heeftSeoVelden: false, zonderAfbeelding: [], nu: NU });
  assert.equal(s.find((x) => x.niveau === 'rood').details[0], 'c: Geblokkeerd door robots.txt');
  const oranje = s.find((x) => /nog niet in Google/.test(x.tekst));
  assert.deepEqual(oranje.details, ['a (37 dagen live)']);
});

test('gedeelde fout: klant wordt gevonden in de invoer van de mislukte stap', () => {
  const klanten = [{ id: 'trockenblumengrosshandel', naam: 'Trockenblumengrosshandel' }, { id: 'ppe', naam: 'PPExport' }];
  assert.deepEqual(c.klantenInTekst('{"client_name":"Trockenblumengrosshandel"}', klanten), ['trockenblumengrosshandel']);
  assert.deepEqual(c.klantenInTekst('niets', klanten), []);
  const exec = {
    workflowData: { connections: { 'Loop per klant': { main: [[{ node: 'Schrijf blog', type: 'main', index: 0 }]] }, 'Haal klanten op': { main: [[{ node: 'Loop per klant', type: 'main', index: 0 }]] } } },
    data: { resultData: { lastNodeExecuted: 'Schrijf blog', runData: {
      'Haal klanten op': [{ data: { main: [[{ json: { client_name: 'PPExport' } }, { json: { client_name: 'Trockenblumengrosshandel' } }]] } }],
      'Loop per klant': [{ data: { main: [[], [{ json: { client_name: 'PPExport' } }]] } }, { data: { main: [[], [{ json: { client_name: 'Trockenblumengrosshandel' } }]] } }]
    } } }
  };
  assert.deepEqual(c.klantenInTekst(c.invoerVanMislukteStap(exec), klanten), ['trockenblumengrosshandel']);
});

test('steekproef: vaste keuze per week, verschillende klanten eerst', () => {
  const k = (klantId, n) => ({ klantId, blogId: klantId + n });
  const kandidaten = [k('a', 1), k('a', 2), k('a', 3), k('b', 1), k('c', 1)];
  const een = c.kiesSteekproef(kandidaten, '2026-W44');
  assert.equal(een.length, 3);
  assert.deepEqual(new Set(een.map((x) => x.klantId)), new Set(['a', 'b', 'c']));
  assert.deepEqual(c.kiesSteekproef(kandidaten, '2026-W44'), een);
  assert.equal(c.kiesSteekproef([k('a', 1)], '2026-W44').length, 1);
  assert.equal(c.weekSleutel(NU), '2026-W44');
  assert.equal(c.weekSleutel(new Date('2027-01-01T12:00:00Z').getTime()), '2026-W53');
});

test('steekproef: afkeuring wordt een kwaliteitssignaal en staat in het weekoverzicht', () => {
  const s = c.kwaliteitSignalen([{ gebeurtenis: 'steekproef', uitkomst: 'niet goed', datum: '2026-10-26', blog_titel: 'Blog X', feedback_tekst: 'Te algemeen' }, { gebeurtenis: 'steekproef', uitkomst: 'goed', datum: '2026-10-26' }], NU);
  assert.equal(s.length, 1);
  assert.equal(s[0].details[0], 'Blog X: Te algemeen');
  const t = c.samenvattingTekst({ klanten: [], gedeeld: { signalen: [] }, steekproef: { blogs: [{ klantNaam: 'PPExport', titel: 'Rozen inkopen', oordeel: '' }, { klantNaam: 'A', titel: 'B', oordeel: 'goed' }] } });
  assert.match(t, /Steekproef deze week: lees 1 blog/);
  assert.match(t, /• PPExport: Rozen inkopen/);
});

test('samenvatting: zonder geldige n8n sleutel geen toegang', async () => {
  const router = require('../src/routes/admin');
  const laag = router.stack.find((l) => l.route && l.route.path === '/cockpit/samenvatting');
  const handler = laag.route.stack[0].handle;
  const origineel = global.fetch;
  global.fetch = async () => ({ ok: false, status: 401 });
  try {
    let code = 200;
    await handler({ get: () => 'een-verkeerde-sleutel-van-lengte' }, { status(c) { code = c; return this; }, json() {} });
    assert.equal(code, 401);
    code = 200;
    await handler({ get: () => '' }, { status(c) { code = c; return this; }, json() {} });
    assert.equal(code, 401);
  } finally {
    global.fetch = origineel;
  }
});

test('meldingenVan zet rood voor oranje, laat info weg en neemt gedeelde workflows mee', () => {
  const data = {
    gedeeld: { signalen: [{ soort: 'techniek', niveau: 'rood', tekst: 'Stuur Review Email: 4 mislukte runs, laatste 22 oktober', details: [] }] },
    klanten: [
      { id: 'a', naam: 'Klant A', signalen: [{ soort: 'blog', niveau: 'oranje', tekst: '2 blogs hebben geen enkele interne link', details: ['x'] }, { soort: 'blog', niveau: 'info', tekst: 'Nog geen gepubliceerde blog', details: [] }] },
      { id: 'b', naam: 'Klant B', signalen: [{ soort: 'techniek', niveau: 'rood', tekst: '1 blog staat op Fout', details: [] }] }
    ]
  };
  const lijst = model.meldingenVan(data);
  assert.deepEqual(lijst.map((m) => m.niveau), ['rood', 'rood', 'oranje']);
  assert.equal(lijst[0].klantNaam, 'Alle klanten');
  assert.equal(lijst[0].gedeeld, true);
  assert.equal(lijst[1].klantId, 'b');
  assert.ok(!lijst.some((m) => m.niveau === 'info'));
  assert.deepEqual(model.meldingenVan(null), []);
});

test('uitlegVan geeft bij elke melding een uitleg en een actiepunt', () => {
  const teksten = [
    ['techniek', '1 blog staat op Fout'], ['techniek', '2 blogs hangen al langer dan 6 uur op In generatie'], ['techniek', 'BA - X draait niet meer: laatste geslaagde run 1 oktober'],
    ['kwaliteit', '4 QA afkeuringen in 14 dagen, de schrijfstap mist vaker dan normaal'], ['blog', '2 blogs hebben geen enkele interne link'], ['data', 'Clicks uit Google 35% lager dan de 28 dagen ervoor'],
    ['klant', 'Klant was 40 dagen niet in het portaal (laatste keer 1 september)'], ['blog', 'iets heel anders']
  ];
  for (const [soort, tekst] of teksten) {
    const u = model.uitlegVan({ soort, tekst });
    assert.ok(u.wat && u.doe, tekst);
  }
  assert.match(model.uitlegVan({ soort: 'techniek', tekst: '1 blog staat op Fout' }).doe, /Gepland/);
  assert.notEqual(model.uitlegVan({ soort: 'blog', tekst: 'iets heel anders' }).wat, model.uitlegVan({ soort: 'data', tekst: 'iets heel anders' }).wat);
});

test('avatarKleur is stabiel per naam en kopieerTekst bevat de melding en de uitleg', () => {
  assert.equal(model.avatarKleur('PPExport'), model.avatarKleur('PPExport'));
  assert.match(model.avatarKleur('Basecamp Utrecht'), /^#[0-9a-f]{6}$/);
  const tekst = model.kopieerTekst({ niveau: 'rood', soort: 'techniek', klantNaam: 'PPExport', tekst: '1 blog staat op Fout', details: ['Blog X'], link: 'https://n8n.example/run/1' });
  assert.match(tekst, /PPExport/);
  assert.match(tekst, /1 blog staat op Fout/);
  assert.match(tekst, /- Blog X/);
  assert.match(tekst, /https:\/\/n8n\.example\/run\/1/);
});
