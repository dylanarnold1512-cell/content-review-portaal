#!/usr/bin/env node
// Maakt de klanthandleiding als PDF uit template.html.
//
// Gebruik:
//   HANDLEIDING_WACHTWOORD='...' node handleiding/maak-handleiding.js handleiding/klanten/hirs-installaties.json
//
// Het wachtwoord staat bewust niet in de klantconfig of in git. Geef het mee via
// de omgeving. Zonder wachtwoord blijft er een duidelijke invulplek in de PDF staan.
// Vereist Playwright met Chromium (geen onderdeel van het portaal zelf).

const fs = require('fs');
const path = require('path');

const map = __dirname;
const configPad = process.argv[2];
if (!configPad) { console.error('Geef het pad naar een klantconfig mee.'); process.exit(1); }
const config = JSON.parse(fs.readFileSync(path.resolve(configPad), 'utf8'));

const nummer = (n) => String(n).padStart(2, '0');

function bouwHtml(c, wachtwoord) {
  const s = c.strategie ? 1 : 0;
  let html = fs.readFileSync(path.join(map, 'template.html'), 'utf8');
  const flags = { blogr: Boolean(c.blogr), pagr: Boolean(c.pagr), strategie: Boolean(c.strategie) };
  html = html.replace(/<!--if:(\w+)-->([\s\S]*?)<!--endif-->/g, (_, naam, inhoud) => (flags[naam] ? inhoud : ''));
  const productTitel = [c.blogr ? 'Blogr<span class="dot">.</span>' : '', c.pagr ? 'Pagr<span class="dot">.</span>' : ''].filter(Boolean).join('<br>');
  const waarden = {
    klant: c.klant,
    slug: c.slug,
    email: c.email,
    contact: c.contact || c.klant,
    blogsPerMaand: c.blogsPerMaand,
    paginasPerMaand: c.paginasPerMaand,
    eersteBlog: c.eersteBlog,
    volgendeBlogDatum: c.volgendeBlogDatum,
    volgendeBlogTitel: c.volgendeBlogTitel,
    contactAdvertisr: c.contactAdvertisr || 'marc@advertisr.nl of dylan@advertisr.nl',
    wachtwoord: wachtwoord || '[vul het wachtwoord in]',
    productTitel,
    // Paginanummers: de voorpagina is 01, de strategie (indien aanwezig) 02. De pagina Publiceren is er alleen bij Blogr.
    nrVragen: nummer(6 + s + (c.blogr ? 1 : 0)),
    p2: nummer(2 + s), p3: nummer(3 + s), p4: nummer(4 + s), p5: nummer(5 + s), p6: nummer(6 + s),
    fotoTip: c.fotoTip || 'projectfoto\'s van eigen werk werken het beste.',
    ...(c.strategie ? {
      strategieTempo: c.strategie.tempo, strategieVerdeling: c.strategie.verdeling, strategieVerdelingUitleg: c.strategie.verdelingUitleg,
      strategieGebied: c.strategie.gebied, strategieGebiedUitleg: c.strategie.gebiedUitleg,
      strategieAantalClusters: c.strategie.clusters.length,
      strategieClusters: c.strategie.clusters.map((k) => '<li>' + k + '</li>').join(''),
      strategieGoogle: c.strategie.google, strategieAI: c.strategie.ai, strategieZakelijk: c.strategie.zakelijk, strategieNiet: c.strategie.niet
    } : {})
  };
  const schermen = c.schermenMap || 'schermen';
  html = html.replace(/src="schermen\//g, 'src="' + schermen + '/');
  // Demoschermen: een verzonnen klant met mooie cijfers, zodat ook een nieuwe klant ziet hoe het portaal eruitziet.
  for (const naam of (c.demoSchermen || [])) {
    html = html.replace(new RegExp('src="' + schermen + '/' + naam + '\\.png"', 'g'), 'src="' + (c.demoMap || 'schermen-demo') + '/' + naam + '.png"');
  }
  for (const naam of (c.zonderSchermen || [])) {
    const re = new RegExp('<div class="venster uitsnede"[^>]*><div class="balk">(?:<i></i>)*<span>[^<]*</span></div><img src="[^"]*/' + naam + '\\.png" alt=""></div>');
    const tekst = (c.leegTekst && c.leegTekst[naam]) || 'Zodra er data is, zie je hier de cijfers.';
    html = html.replace(re, '<div class="leeg">' + tekst + '</div>');
  }
  // Ontbreekt een schermafbeelding (bijvoorbeeld voor een nieuw onderdeel), toon dan een nette plek in plaats van een kapot plaatje.
  html = html.replace(/<div class="venster uitsnede"[^>]*><div class="balk">(?:<i><\/i>)*<span>[^<]*<\/span><\/div><img src="([^"]+)" alt=""><\/div>/g, (blok, bron) => (
    fs.existsSync(path.join(map, bron)) ? blok : '<div class="leeg">Zodra er data is, zie je hier de cijfers.</div>'
  ));
  return html.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (waarden[k] === undefined || waarden[k] === null) throw new Error(`Ontbrekende waarde in de klantconfig: ${k}`);
    return String(waarden[k]);
  });
}

async function main() {
  const { chromium } = require('playwright');
  const html = bouwHtml(config, process.env.HANDLEIDING_WACHTWOORD);
  const tijdelijk = path.join(map, `.render-${config.slug}.html`);
  fs.writeFileSync(tijdelijk, html);
  const uitvoer = path.resolve(process.argv[3] || path.join(map, `Handleiding ${config.klant} door Advertisr.pdf`));
  const browser = await chromium.launch(process.env.CHROME_PAD ? { executablePath: process.env.CHROME_PAD, args: ['--no-sandbox'] } : {});
  const pagina = await browser.newPage();
  await pagina.goto('file://' + tijdelijk, { waitUntil: 'networkidle' });
  await pagina.evaluate(() => document.fonts.ready);
  // Een pagina die te vol is, wordt onderaan afgekapt. Meld dat, zodat het voor het versturen opvalt.
  const vol = await pagina.evaluate(() => [...document.querySelectorAll('.page')].map((p, i) => (p.scrollHeight > p.clientHeight + 40 ? i + 1 : 0)).filter(Boolean));
  if (vol.length) console.warn('LET OP: te vol, tekst wordt afgekapt op pagina ' + vol.join(', '));
  await pagina.pdf({ path: uitvoer, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  fs.unlinkSync(tijdelijk);
  console.log('Klaar:', uitvoer);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { bouwHtml };
