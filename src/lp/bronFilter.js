// LP Fabriek: bronfilter voor de teksten van de klantsite (Dylan, 19-10-2026).
//
// Aanleiding: op mac-bouw.nl/nieuwbouw-en-verbouw/ staat onder de tekst een blok Engelse tekst over online casino's met
// een link naar een Italiaanse site (waarschijnlijk een hack of een ongewenste plugin). De tool leest die pagina als bron
// voor de AI, dus zulke tekst mag nooit in de bron terechtkomen. Ook demo teksten van een WordPress thema ("We Build
// Building and Great Constructive Homes", "Uniquely repurpose ...") horen er niet in.
//
// Het filter werkt per regel van de al uitgelezen hoofdtekst en is voor elke klant gelijk:
//  1. spam: een regel met twee of meer verschillende gok, medicijn of oplichtingswoorden;
//  2. vreemde taal: een lange regel die duidelijk niet in de taal van de klant is (alleen bij taal "nl");
//  3. placeholders van thema's en plugins (lorem ipsum, "View More", demo koppen).
// Het geeft ook terug wat er is weggehaald, zodat dat zichtbaar wordt voor Dylan. Een korte kop of naam in een andere taal
// blijft staan, alleen lange regels (14 woorden of meer) tellen mee voor de taalcontrole.

const SPAM_RE = /\b(casino'?s?|gambling|gamble|betting|bookmakers?|sportsbook|poker|roulette|blackjack|jackpots?|slots?|free spins|welcome bonus(?:es)?|payday loans?|viagra|cialis|porn|escorts?|binary options|forex|gokken|gokkasten|gokkast|goksites?|wedden)\b/gi;

const PLACEHOLDER_RE = /lorem ipsum|dolor sit amet|consectetur adipiscing|we build building and great constructive homes|got a project in mind|uniquely repurpose|client-centered imperatives/i;
const LOSSE_PLACEHOLDER_RE = /^[#\s-]*(let'?s talk|view more|read more|learn more|meer lezen|lees meer|click here)\s*[.!]?$/i;

const WOORDEN = {
  nl: 'de het een en van voor met op je wij dat die te bij naar ook om aan maar uw ons onze zijn niet als dan nog wel kunt kan worden wordt door uit over zo ze er heeft hebben jij jouw',
  en: 'the and to are for with that this you your our on by an from be at it have will can not or more all their they was were has',
  it: 'il di che per con non una sono gli delle della nel più anche come questo questa tutti nostri alla dei',
  de: 'der die das und ist nicht mit für auf ein eine den dem von zu auch wir sie haben werden',
  fr: 'le la les des est pour avec dans une sur pas qui nous vous sont aux ces'
};
const WOORDSETS = Object.fromEntries(Object.entries(WOORDEN).map(([taal, lijst]) => [taal, new Set(lijst.split(' '))]));
const MIN_WOORDEN_TAALCONTROLE = 14;

function woordenVan(regel) {
  return String(regel).toLowerCase().match(/[a-zà-ÿ']+/g) || [];
}

// Aandeel van de woorden uit een taal. Alleen zinvol voor een regel met genoeg woorden.
function taalAandelen(regel) {
  const woorden = woordenVan(regel);
  const uit = { woorden: woorden.length };
  Object.keys(WOORDSETS).forEach((t) => {
    uit[t] = woorden.length ? woorden.filter((w) => WOORDSETS[t].has(w)).length / woorden.length : 0;
  });
  return uit;
}

function spamTreffers(regel) {
  const gevonden = new Set((String(regel).match(SPAM_RE) || []).map((w) => w.toLowerCase().replace(/'s?$/, '').replace(/s$/, '')));
  return [...gevonden];
}

// Beoordeelt een regel. Geeft null als de regel goed is, anders een reden.
function beoordeelRegel(regel, { taal = 'nl' } = {}) {
  const tekst = String(regel || '').trim();
  if (!tekst) return null;
  if (PLACEHOLDER_RE.test(tekst) || LOSSE_PLACEHOLDER_RE.test(tekst)) return 'placeholder van het thema of de plugin';
  if (spamTreffers(tekst).length >= 2) return 'lijkt spam (gokken, medicijnen of oplichting)';
  if (taal === 'nl') {
    const a = taalAandelen(tekst);
    if (a.woorden >= MIN_WOORDEN_TAALCONTROLE && a.nl < 0.08) {
      const vreemd = ['en', 'it', 'de', 'fr'].map((t) => ({ t, w: a[t] })).sort((x, y) => y.w - x.w)[0];
      if (vreemd.w >= 0.12) return `staat in een andere taal dan Nederlands (${{ en: 'Engels', it: 'Italiaans', de: 'Duits', fr: 'Frans' }[vreemd.t]})`;
    }
  }
  return null;
}

// Filtert de hoofdtekst van een pagina (regels gescheiden door nieuwe regels). Bij een kop waarvan alle tekst eronder is
// weggehaald blijft de kop staan, dat is onschuldig.
function filterBrontekst(tekst, opties = {}) {
  const verwijderd = [];
  const over = [];
  for (const regel of String(tekst || '').split('\n')) {
    const reden = beoordeelRegel(regel, opties);
    if (reden) verwijderd.push({ regel: regel.trim().slice(0, 140), reden });
    else over.push(regel);
  }
  return { tekst: over.join('\n'), verwijderd };
}

module.exports = { filterBrontekst, beoordeelRegel, spamTreffers, taalAandelen };
