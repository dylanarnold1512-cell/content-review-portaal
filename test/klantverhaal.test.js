const test = require('node:test');
const assert = require('node:assert');
const kv = require('../src/lp/klantverhaal');
const { schoonProfiel } = require('../src/lp/klantgegevens');

const PAGINAS = [
  { url: 'https://voorbeeld.nl/over-ons/', titel: 'Over ons', tekst: 'Ik ben Mitchell en ik help je graag met je verbouwing. Je krijgt altijd een vaste contactpersoon die je belt als er iets is. Wij werken netjes en maken heldere afspraken over de planning.' },
  { url: 'https://voorbeeld.nl/reviews/', titel: 'Reviews', tekst: 'Mitchell dacht echt mee over de indeling en alles was op tijd klaar. Sinds 2014 bouwen wij in de regio. Sinds 2012 bouwen wij in de regio.' }
];

test('schoonKlantverhaal eist een bron per onderdeel', () => {
  assert.throws(() => schoonKlantverhaal({ waaromKiezen: [{ punt: 'Vaste contactpersoon', uitleg: 'x' }] }), /bron/);
  const ok = kv.schoonKlantverhaal({ waaromKiezen: [{ punt: 'Vaste contactpersoon', uitleg: 'x', bron: 'https://voorbeeld.nl/over-ons/' }] });
  assert.strictEqual(ok.waaromKiezen.length, 1);
  assert.strictEqual(ok.status, 'concept');
});

function schoonKlantverhaal(x) { return kv.schoonKlantverhaal(x); }

test('een leeg klantverhaal kan niet goedgekeurd worden', () => {
  assert.throws(() => schoonKlantverhaal({ status: 'goedgekeurd' }), /leeg/);
});

test('controleerVoorstel houdt alleen onderdelen met een letterlijk citaat', () => {
  const ruw = {
    stem: { kenmerken: ['persoonlijk', 'praktisch'], voorbeeldzinnen: [
      { tekst: 'Ik ben Mitchell en ik help je graag met je verbouwing.', bron: 'https://voorbeeld.nl/over-ons/' },
      { tekst: 'Wij leveren excellentie in elk detail en meesterwerk.', bron: 'https://voorbeeld.nl/over-ons/' }
    ] },
    gezicht: { naam: 'Mitchell', rol: 'eigenaar', tekst: 'Helpt je graag.', bron: 'https://voorbeeld.nl/over-ons/', citaat: 'Ik ben Mitchell en ik help je graag met je verbouwing' },
    waaromKiezen: [
      { punt: 'Vaste contactpersoon', uitleg: 'Een vast aanspreekpunt.', bron: 'https://voorbeeld.nl/over-ons/', citaat: 'Je krijgt altijd een vaste contactpersoon die je belt' },
      { punt: 'Verzonnen', uitleg: 'x', bron: 'https://voorbeeld.nl/over-ons/', citaat: 'Wij zijn de beste van heel Nederland sinds jaar en dag' }
    ],
    bewijs: [{ soort: 'review', wie: 'Klant', tekst: 'Mitchell dacht echt mee over de indeling', bron: 'https://voorbeeld.nl/over-ons/', citaat: 'Mitchell dacht echt mee over de indeling en alles was op tijd klaar' }],
    tegenstrijdig: [{ onderwerp: 'oprichting', waarden: [
      { waarde: '2014', bron: 'x', citaat: 'Sinds 2014 bouwen wij in de regio' },
      { waarde: '2012', bron: 'x', citaat: 'Sinds 2012 bouwen wij in de regio' }
    ] }],
    ontbreekt: []
  };
  const { voorstel, waarschuwingen } = kv.controleerVoorstel(ruw, PAGINAS);
  assert.strictEqual(voorstel.waaromKiezen.length, 1);
  assert.strictEqual(voorstel.waaromKiezen[0].punt, 'Vaste contactpersoon');
  assert.strictEqual(voorstel.stem.voorbeeldzinnen.length, 1);
  assert.ok(voorstel.gezicht && voorstel.gezicht.naam === 'Mitchell');
  // de bron wordt gecorrigeerd naar de pagina waar het citaat echt staat
  assert.strictEqual(voorstel.bewijs[0].bron, 'https://voorbeeld.nl/reviews/');
  assert.strictEqual(voorstel.tegenstrijdig.length, 1);
  assert.strictEqual(voorstel.tegenstrijdig[0].gekozen, '');
  assert.strictEqual(voorstel.status, 'concept');
  assert.ok(waarschuwingen.some((w) => /weggelaten/.test(w)));
  assert.ok(voorstel.ontbreekt.some((o) => /twijfels/i.test(o)));
});

test('meetAanspreekvorm kiest je of u op basis van de site', () => {
  assert.strictEqual(kv.meetAanspreekvorm(PAGINAS).advies, 'je');
  assert.strictEqual(kv.meetAanspreekvorm([{ tekst: 'Wij helpen u graag. Uw wensen staan voorop. U kunt altijd bellen.' }]).advies, 'u');
});

test('citaatStaatIn accepteert weglatingen en negeert leestekens en hoofdletters', () => {
  const norm = kv.normTekst('Wij werken netjes, en maken heldere afspraken over de planning.');
  assert.ok(kv.citaatStaatIn(norm, 'WIJ WERKEN NETJES ... heldere afspraken over de planning'));
  assert.ok(!kv.citaatStaatIn(norm, 'wij werken altijd netjes en snel'));
});

test('bouwKlantverhaalBlok geeft pas een blok na goedkeuring', () => {
  const concept = schoonKlantverhaal({ waaromKiezen: [{ punt: 'Vast aanspreekpunt', uitleg: 'Een vaste contactpersoon.', bron: 'https://voorbeeld.nl/over-ons/' }] });
  assert.strictEqual(kv.bouwKlantverhaalBlok(concept, { bedrijfsnaam: 'Voorbeeld BV' }), '');
  const goed = schoonKlantverhaal({ status: 'goedgekeurd', stem: { aanspreekvorm: 'u' }, waaromKiezen: concept.waaromKiezen, nietGebruiken: [{ tekst: 'talloze succesvolle projecten', reden: 'niet te bewijzen' }] });
  const blok = kv.bouwKlantverhaalBlok(goed, { bedrijfsnaam: 'Voorbeeld BV' });
  assert.match(blok, /"u"/);
  assert.match(blok, /Vast aanspreekpunt/);
  assert.match(blok, /talloze succesvolle projecten/);
  assert.match(blok, /Voorbeeld BV/);
});

test('bouwKlantverhaalVoorstel leest de site, vraagt de AI en controleert het antwoord', async () => {
  let prompt = '';
  const r = await kv.bouwKlantverhaalVoorstel({
    url: 'https://voorbeeld.nl', bedrijfsnaam: 'Voorbeeld',
    haalTeksten: async () => ({ paginas: PAGINAS, gefilterd: [{ url: 'https://voorbeeld.nl/x/', titel: 'X', regel: 'casino', reden: 'lijkt spam' }] }),
    callAi: async ({ userPrompt }) => { prompt = userPrompt; return { waaromKiezen: [{ punt: 'Planning', uitleg: 'Heldere afspraken.', bron: 'https://voorbeeld.nl/over-ons/', citaat: 'maken heldere afspraken over de planning' }] }; }
  });
  assert.match(prompt, /--- Over ons \(https:\/\/voorbeeld\.nl\/over-ons\/\) ---/);
  assert.strictEqual(r.voorstel.waaromKiezen.length, 1);
  assert.ok(r.waarschuwingen.some((w) => /spam/.test(w)));
  await assert.rejects(() => kv.bouwKlantverhaalVoorstel({ url: 'https://voorbeeld.nl', haalTeksten: async () => ({ paginas: [], fout: 'weg' }), callAi: async () => ({}) }), /niet gelezen/);
});

test('het klantverhaal blijft bewaard in het profiel en verdwijnt niet als het niet wordt meegestuurd', () => {
  const metKv = schoonProfiel({ naam: 'Test', klantverhaal: { waaromKiezen: [{ punt: 'a', uitleg: 'b', bron: 'https://x.nl/' }] } });
  assert.strictEqual(metKv.klantverhaal.waaromKiezen.length, 1);
  assert.strictEqual(schoonProfiel({ naam: 'Test' }).klantverhaal, undefined);
});

test('de AI prompt van Content genereren bevat de opbouwregels en het goedgekeurde klantverhaal', async () => {
  const ai = require('../src/lp/ai');
  assert.ok(ai.buildContentSystemPrompt);
  const sys = ai.buildContentSystemPrompt({ slots: [{ key: 'heroTitel', type: 'text' }] });
  assert.match(sys, /OPBOUW VAN DE PAGINA/);
});
