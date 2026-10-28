const test = require('node:test');
const assert = require('node:assert/strict');
const w = require('../src/services/workflowGegevens');

const basisRij = {
  client_name: 'Hirs Installaties', status: 'actief', portaal_slug: 'hirs-installaties',
  notification_email: 'info@hirs-installaties.nl', contact_naam: 'Nick', blogs_per_maand: 2,
  wp_url: 'https://www.hirs-installaties.nl', wp_username: 'api', wp_app_password: 'geheim',
  notion_database_id: 'abc', notion_token: 'tok', taal: 'nl', doelgroep: 'x', tone_of_voice: 'y', diensten: 'z', ai_meting: false
};
const stuur = (rij, extra = {}) => w.bouwControle({ rij, clientId: 'hirs-installaties', portaalStatus: 'actief', portaalStatusIngesteld: true, ...extra });

test('een volledige rij heeft geen open kritieke punten', () => {
  assert.equal(stuur(basisRij).filter((r) => !r.ok && r.kritiek).length, 0);
});

test('zonder rij is er een kritiek punt', () => {
  const c = stuur(null);
  assert.equal(c.length, 1);
  assert.equal(c[0].ok, false);
});

test('onboarding status, leeg e-mailadres en 0 blogs zijn kritiek', () => {
  const c = stuur({ ...basisRij, status: 'onboarding', notification_email: '', blogs_per_maand: 0 });
  assert.equal(c.filter((r) => !r.ok && r.kritiek).length, 3);
});

test('geen contactnaam is alleen een aandachtspunt', () => {
  const c = stuur({ ...basisRij, contact_naam: '' });
  assert.equal(c.filter((r) => !r.ok && r.kritiek).length, 0);
  assert.equal(c.filter((r) => !r.ok).length, 1);
});

test('portaalstatus niet gekozen of afwijkend geeft een aandachtspunt', () => {
  assert.equal(stuur(basisRij, { portaalStatusIngesteld: false }).filter((r) => !r.ok).length, 1);
  assert.equal(stuur(basisRij, { portaalStatus: 'gepauzeerd' }).filter((r) => !r.ok).length, 1);
});

test('AI meting aan zonder domein is kritiek', () => {
  const c = stuur({ ...basisRij, ai_meting: true });
  assert.equal(c.filter((r) => !r.ok && r.kritiek).length, 1);
});

test('geheimen worden nooit teruggegeven, alleen of ze ingevuld zijn', () => {
  const { waarden, geheimen } = w.bouwWaarden(basisRij);
  assert.equal(geheimen.wp_app_password, true);
  assert.equal(JSON.stringify(waarden).includes('geheim'), false);
  assert.equal('wp_app_password' in waarden, false);
});

test('alleen bekende velden zijn te bewerken, status en wachtwoord niet', () => {
  assert.throws(() => w.valideerVeld('status', 'actief'), /kan niet via/);
  assert.throws(() => w.valideerVeld('wp_app_password', 'x'), /kan niet via/);
  assert.throws(() => w.valideerVeld('notion_token', 'x'), /kan niet via/);
});

test('validatie van e-mail, getal en website', () => {
  assert.equal(w.valideerVeld('notification_email', ' a@b.nl , c@d.nl '), 'a@b.nl , c@d.nl');
  assert.throws(() => w.valideerVeld('notification_email', 'geen mail'), /geldig/);
  assert.equal(w.valideerVeld('blogs_per_maand', '4'), 4);
  assert.equal(w.valideerVeld('blogs_per_maand', ''), null);
  assert.throws(() => w.valideerVeld('blogs_per_maand', '99'), /maximaal/);
  assert.throws(() => w.valideerVeld('blogs_per_maand', '1.5'), /geheel/);
  assert.throws(() => w.valideerVeld('wp_url', 'www.x.nl'), /https/);
  assert.equal(w.valideerVeld('ai_meting', true), true);
});

test('faq_modus: leeg of onbekend wordt uit, aan blijft staan', () => {
  assert.equal(w.bouwWaarden({ ...basisRij }).waarden.faq_modus, 'uit');
  assert.equal(w.bouwWaarden({ ...basisRij, faq_modus: 'raar' }).waarden.faq_modus, 'uit');
  assert.equal(w.bouwWaarden({ ...basisRij, faq_modus: 'automatisch' }).waarden.faq_modus, 'uit');
  assert.equal(w.bouwWaarden({ ...basisRij, faq_modus: 'voorstel' }).waarden.faq_modus, 'uit');
  assert.equal(w.bouwWaarden({ ...basisRij, faq_modus: 'aan' }).waarden.faq_modus, 'aan');
});

test('faq_modus: alleen uit of aan mag worden opgeslagen', () => {
  assert.equal(w.valideerVeld('faq_modus', 'aan'), 'aan');
  assert.throws(() => w.valideerVeld('faq_modus', 'voorstel'));
  assert.throws(() => w.valideerVeld('faq_modus', 'automatisch'));
  assert.throws(() => w.valideerVeld('faq_modus', 'altijd'));
  assert.throws(() => w.valideerVeld('faq_modus', ''));
});

test('faq_html_sjabloon is een bewerkbaar tekstveld', () => {
  assert.equal(w.valideerVeld('faq_html_sjabloon', ' <div>{{vragen}}</div> '), '<div>{{vragen}}</div>');
});
