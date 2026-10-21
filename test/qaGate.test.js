// Testset voor de QA Gate (BA - QA Gate - Shared, node "Deterministische checks").
// De code in qa/deterministische-checks.node.js is precies wat in die node staat.
// Wijzig je de node in n8n, werk dan dit bestand bij en draai npm test.
// Elke fout die ooit door de QA Gate heen kwam, komt hier als testgeval bij.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'qa', 'deterministische-checks.node.js'), 'utf8');
const BCU_BLOG = fs.readFileSync(path.join(__dirname, 'fixtures', 'qa', 'bcu-blog-20-oktober.html'), 'utf8');

// Draait de node-code zoals n8n dat doet.
function qa(input) {
  const f = new Function('$input', 'return (function(){' + CODE + '\n})()');
  return f({ first: () => ({ json: input }) })[0].json;
}

const BCU = {
  minWords: 600,
  maxWords: 1050,
  headingStyle: 'h3-only',
  verbodenTermen: 'parkeren is altijd gratis; DeFabrique; Kanaal30; The Colour Kitchen',
  vasteTermen: 'Basecamp Utrecht; Campus Werkspoor; Nijverheidsweg 16A; Station Utrecht Zuilen; Yellow Room; Tipi',
  canonicalTerms: 'Naam altijd voluit "Basecamp Utrecht".'
};

const LIGGING_ZINNEN = / Basecamp Utrecht is gevestigd aan Nijverheidsweg 16A in Utrecht, op Campus Werkspoor\. Basecamp Utrecht is bereikbaar met de auto, fiets en het openbaar vervoer; Station Utrecht Zuilen ligt op ongeveer tien minuten lopen\./;
const zonderLigging = BCU_BLOG.replace(LIGGING_ZINNEN, '');

test('de blog van 20 oktober (ligging aan het eind van een andere alinea) wordt afgekeurd met de exacte zin', () => {
  const r = qa({ ...BCU, html: BCU_BLOG });
  assert.equal(r.detPass, false);
  assert.equal(r.detReasons.length, 1, r.detReasons.join(' | '));
  assert.match(r.detReasons[0], /^Plaatsing:/);
  assert.match(r.detReasons[0], /Rond de dag af met een uitvoerbaar vervolg/);
  assert.match(r.detReasons[0], /Nijverheidsweg 16A/);
});

test('dezelfde blog zonder de ligging zinnen slaagt (geen valse afkeur)', () => {
  assert.ok(zonderLigging.length < BCU_BLOG.length);
  const r = qa({ ...BCU, html: zonderLigging });
  assert.equal(r.detPass, true, r.detReasons.join(' | '));
});

test('ligging onder een FAQ vraag over locatie is goed', () => {
  const html = zonderLigging.replace('<p>Wil je zien', '<h4>Waar vind ik Basecamp Utrecht?</h4>\n<p>Basecamp Utrecht is gevestigd aan Nijverheidsweg 16A in Utrecht, op Campus Werkspoor. Station Utrecht Zuilen ligt op ongeveer tien minuten lopen.</p>\n\n<p>Wil je zien');
  const r = qa({ ...BCU, html });
  assert.equal(r.detPass, true, r.detReasons.join(' | '));
});

test('ligging onder een kop over bereikbaarheid is goed', () => {
  const html = zonderLigging.replace('<h3>Veelgestelde vragen</h3>', '<h3>Bereikbaarheid van de locatie</h3>\n<p>Basecamp Utrecht is bereikbaar met de auto, fiets en het openbaar vervoer.</p>\n\n<h3>Veelgestelde vragen</h3>');
  const r = qa({ ...BCU, html });
  assert.equal(r.detPass, true, r.detReasons.join(' | '));
});

test('ligging in twee alinea\'s, ook onder goede koppen, wordt afgekeurd', () => {
  const html = zonderLigging
    .replace('<h3>Veelgestelde vragen</h3>', '<h3>Bereikbaarheid van de locatie</h3>\n<p>Basecamp Utrecht is bereikbaar met de auto, fiets en het openbaar vervoer.</p>\n\n<h3>Veelgestelde vragen</h3>')
    .replace('<p>Wil je zien', '<h4>Waar vind ik Basecamp Utrecht?</h4>\n<p>Basecamp Utrecht is gevestigd aan Nijverheidsweg 16A in Utrecht.</p>\n\n<p>Wil je zien');
  const r = qa({ ...BCU, html });
  assert.equal(r.detPass, false);
  assert.match(r.detReasons.join(' '), /komt in 2 alinea/);
});

test('ligging aan het eind van een alinea onder een Veelgestelde vragen antwoord over iets anders wordt afgekeurd', () => {
  const html = zonderLigging.replace('Basecamp Utrecht denkt mee over ruimte en inrichting.', 'Basecamp Utrecht denkt mee over ruimte en inrichting. Basecamp Utrecht is gevestigd aan Nijverheidsweg 16A in Utrecht.');
  const r = qa({ ...BCU, html });
  assert.equal(r.detPass, false);
  assert.match(r.detReasons.join(' '), /Welke vergaderruimtes heeft Basecamp Utrecht voor kleine groepen/);
});

test('Campus Werkspoor of Utrecht noemen zonder ligging zin is geen ligging', () => {
  const r = qa({ ...BCU, html: zonderLigging });
  assert.equal(r.detPass, true);
  assert.ok(zonderLigging.includes('op Campus Werkspoor kun je'));
});

test('Duits: gelegen of befindet sich onder een gewone kop wordt afgekeurd, onder Anfahrt is goed', () => {
  const basis = (kop) => '<h2>Trockenblumen</h2><p>Ein Text.</p><h2>' + kop + '</h2><p>Das Lager befindet sich in der Nähe von Köln. Das Lager ist mit dem Auto erreichbar über die A4.</p>';
  const opts = { minWords: 1, maxWords: 5000, headingStyle: 'h2-h3' };
  assert.equal(qa({ ...opts, html: basis('Preise und Mengen') }).detPass, false);
  assert.equal(qa({ ...opts, html: basis('Anfahrt und Standort') }).detPass, true);
});

test('Engels: located at onder een gewone kop wordt afgekeurd, onder Where to find us is goed', () => {
  const basis = (kop) => '<h2>Our flowers</h2><p>Some text.</p><h2>' + kop + '</h2><p>The warehouse is located at Main Street 5 in Utrecht.</p>';
  const opts = { minWords: 1, maxWords: 5000, headingStyle: 'h2-h3' };
  assert.equal(qa({ ...opts, html: basis('Why choose us') }).detPass, false);
  assert.equal(qa({ ...opts, html: basis('Where to find us') }).detPass, true);
});

test('plaatsingscheck kan per aanroep worden uitgezet', () => {
  const r = qa({ ...BCU, html: BCU_BLOG, plaatsingscheck: false });
  assert.equal(r.detPass, true, r.detReasons.join(' | '));
});

test('verboden term wordt afgekeurd, maar niet als hij in een vaste term zit', () => {
  const slecht = zonderLigging.replace('Basecamp Utrecht verzorgt catering uit eigen keuken, van ontbijt tot diner.', 'Basecamp Utrecht verzorgt catering uit eigen keuken, net als DeFabrique.');
  const r = qa({ ...BCU, html: slecht });
  assert.equal(r.detPass, false);
  assert.match(r.detReasons.join(' '), /DeFabrique/);
  const ok = qa({ ...BCU, vasteTermen: BCU.vasteTermen + '; net als DeFabrique', html: slecht });
  assert.equal(ok.detPass, true, ok.detReasons.join(' | '));
});

test('woordenaantal buiten de band wordt afgekeurd', () => {
  const r = qa({ ...BCU, maxWords: 500, html: zonderLigging });
  assert.equal(r.detPass, false);
  assert.match(r.detReasons.join(' '), /Woordenaantal/);
});

test('h2 bij een h3 only klant en vetgedrukte tekst worden afgekeurd', () => {
  const h2 = qa({ ...BCU, html: zonderLigging.replace('<h3>Begin met een scherp eindpunt</h3>', '<h2>Begin met een scherp eindpunt</h2>') });
  assert.equal(h2.detPass, false);
  assert.match(h2.detReasons.join(' '), /H3-only/);
  const vet = qa({ ...BCU, html: zonderLigging.replace('Daarom is de agenda', '<strong>Daarom</strong> is de agenda') });
  assert.equal(vet.detPass, false);
  assert.match(vet.detReasons.join(' '), /vetgedrukte/);
});

test('kapotte HTML en een h1 worden afgekeurd', () => {
  const r = qa({ ...BCU, html: zonderLigging.replace('</h3>', '</h3></div>').replace('<p>Een vergaderdag', '<h1>Titel</h1><p>Een vergaderdag') });
  assert.equal(r.detPass, false);
  assert.match(r.detReasons.join(' '), /Ongebalanceerde <div>/);
  assert.match(r.detReasons.join(' '), /<h1>/);
});
