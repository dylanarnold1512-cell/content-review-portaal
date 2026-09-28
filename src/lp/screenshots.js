// Screenshots van een referentiepagina voor het sjabloon-voorstel (stap A, 28-09-2026).
// De browser knipt één lange screenshot in stukken (public/lp.js) en stuurt die als data-URL's mee.
// Hier controleren we ze streng voordat ze naar de AI gaan: alleen echte afbeeldingen, beperkt aantal
// en beperkte grootte.

const MAX_STUKKEN = 10;
const MAX_BYTES_PER_STUK = 4 * 1024 * 1024;
const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

// Geeft een schone lijst data-URL's terug (of []), gooit een Nederlandse fout bij ongeldige invoer.
function schoonScreenshots(raw) {
  if (raw === undefined || raw === null || (Array.isArray(raw) && !raw.length)) return [];
  if (!Array.isArray(raw)) throw new Error('Screenshots moeten als lijst worden doorgegeven.');
  if (raw.length > MAX_STUKKEN) {
    throw new Error(`Te veel screenshot-stukken (${raw.length}, maximaal ${MAX_STUKKEN}). Gebruik een kleinere afbeelding.`);
  }
  return raw.map((url, i) => {
    const m = typeof url === 'string' ? DATA_URL_RE.exec(url) : null;
    if (!m) throw new Error(`Screenshot ${i + 1} is geen geldige afbeelding (jpeg, png of webp).`);
    const bytes = Math.floor((m[2].length * 3) / 4);
    if (bytes > MAX_BYTES_PER_STUK) throw new Error(`Screenshot ${i + 1} is te groot (maximaal 4 MB per stuk).`);
    return url;
  });
}

// Uitleg aan de AI bij de afbeeldingen. Bewust: structuur en indruk overnemen, geen teksten of merkbeelden.
function screenshotUitleg(aantal) {
  return `BIJGEVOEGDE SCREENSHOT van de referentiepagina (${aantal} opeenvolgende stuk${aantal === 1 ? '' : 'ken'}, van boven naar beneden, samen één lange pagina).
Bouw een sjabloon met DEZELFDE opzet: dezelfde secties in dezelfde volgorde, dezelfde indeling (bv. aantal kolommen in een raster,
foto boven of naast tekst, iconenrij, hero met vinkjes), dezelfde verhoudingen, dezelfde ritmiek van lichte en getinte vlakken en
dezelfde soort knoppen en kaarten. Neem de opzet en de uitstraling over, NIET de teksten en NIET de foto's van de referentie:
teksten en foto's lopen via slots. De kleuren, lettertypes en vormtaal komen van de huisstijl van deze klant (CSS-variabelen),
ook als de referentie andere kleuren gebruikt. Laat niets weg wat op de screenshot staat, tenzij het een cookiebanner, menu of
footer van de site zelf is. Bij elk onderdeel dat repeteert (kaarten, iconen, vinkjes) gebruik je een lijst-slot.`;
}

module.exports = { schoonScreenshots, screenshotUitleg, MAX_STUKKEN, MAX_BYTES_PER_STUK };
