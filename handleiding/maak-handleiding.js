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

function bouwHtml(c, wachtwoord) {
  let html = fs.readFileSync(path.join(map, 'template.html'), 'utf8');
  const flags = { blogr: Boolean(c.blogr), pagr: Boolean(c.pagr) };
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
    productTitel
  };
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
  const browser = await chromium.launch();
  const pagina = await browser.newPage();
  await pagina.goto('file://' + tijdelijk, { waitUntil: 'networkidle' });
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.pdf({ path: uitvoer, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  fs.unlinkSync(tijdelijk);
  console.log('Klaar:', uitvoer);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { bouwHtml };
