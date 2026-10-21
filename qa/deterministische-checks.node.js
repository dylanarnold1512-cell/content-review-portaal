const input = $input.first().json;
const html = input.html || input.content || '';
const minWords = input.minWords || 600;
const maxWords = input.maxWords || 1300;
const headingStyle = input.headingStyle || 'h2-h3';
const reasons = [];
function checkBalanced(tag) {
  const openRe = new RegExp('<' + tag + '(\\s[^>]*)?>', 'gi');
  const closeRe = new RegExp('<\\/' + tag + '>', 'gi');
  const opens = (html.match(openRe) || []).length;
  const closes = (html.match(closeRe) || []).length;
  return opens === closes;
}
['h1','h2','h3','h4','p','ul','li','a','div'].forEach(tag => {
  if (!checkBalanced(tag)) reasons.push('Ongebalanceerde <' + tag + '>-tags gevonden.');
});
if (/<h1[\s>]/i.test(html)) reasons.push('Body bevat een <h1> - WordPress toont de titel al als H1.');
const h2Count = (html.match(/<h2[\s>]/gi) || []).length;
const h3Count = (html.match(/<h3[\s>]/gi) || []).length;
if (headingStyle === 'h2-h3') {
  if (h2Count === 0) reasons.push('Geen enkele <h2> gevonden terwijl H2/H3-structuur verwacht wordt.');
} else if (headingStyle === 'h3-only') {
  if (h2Count > 0) reasons.push('Body bevat <h2> terwijl deze klant een H3-only structuur gebruikt.');
  if (h3Count === 0) reasons.push('Geen enkele <h3> gevonden.');
}
const textOnly = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const wordCount = textOnly.length > 0 ? textOnly.split(' ').length : 0;
if (wordCount < minWords || wordCount > maxWords) {
  reasons.push('Woordenaantal (' + wordCount + ') buiten de afgesproken bandbreedte ' + minWords + '-' + maxWords + '.');
}
if (/<(strong|b)[\s>]/i.test(html)) reasons.push('Body bevat <strong> of <b> - vetgedrukte tekst is niet toegestaan.');
const verbodenLijst = String(input.verbodenTermen || '').split(';').map(t => t.trim()).filter(t => t.length >= 3);
if (verbodenLijst.length > 0) {
  const vasteLijst = (String(input.vasteTermen || '') + ';' + String(input.canonicalTerms || '')).split(/[;,]/).map(t => t.trim().toLowerCase()).filter(t => t.length >= 3);
  const esc = (t) => t.replace(/[\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const lager = textOnly.toLowerCase();
  const gevonden = [];
  verbodenLijst.forEach(term => {
    const tl = term.toLowerCase();
    let tekstCheck = lager;
    vasteLijst.filter(v => v !== tl && v.indexOf(tl) !== -1).sort((a, b) => b.length - a.length).forEach(v => { tekstCheck = tekstCheck.split(v).join(' '); });
    const re = new RegExp('(?<![\\p{L}\\p{N}])' + esc(tl) + '(?![\\p{L}\\p{N}])', 'u');
    if (re.test(tekstCheck)) gevonden.push(term);
  });
  if (gevonden.length > 0) reasons.push('Verboden term(en) in de tekst: ' + gevonden.map(t => '"' + t + '"').join(', ') + '. Schrap het woord of herschrijf de zin zonder deze term. Een naam of vaste term waar zo\'n woord deel van uitmaakt mag wel blijven staan.');
}
// PLAATSINGSCHECK: ligging en bereikbaarheid van de klant mogen alleen onder een kop of vraag over locatie staan.
// Geldt voor alle klanten (BCU, PPE en Shared). Uitzetten per aanroep kan met plaatsingscheck: false.
if (input.plaatsingscheck !== false) {
  const locatieZin = new RegExp([
    'gevestigd\\s+(aan|op|in|nabij)\\b',
    'bereikbaar\\s+(met|via|per|vanaf)\\b',
    '\\bminuten\\s+(lopen|fietsen|rijden|reizen|te\\s+voet)\\b',
    '\\bop\\s+(loop|fiets)afstand\\b',
    '\\b[A-ZÀ-Ý][\\p{L}\\-]+(weg|straat|laan|plein|kade|singel|gracht|dijk|steeg)\\s+\\d+\\s?[A-Za-z]?\\b',
    '\\bgelegen\\s+(aan|op|in|nabij)\\b',
    '\\bbefindet\\s+sich\\b',
    '\\berreichbar\\s+(mit|über|per)\\b',
    '\\bMinuten\\s+(zu\\s+Fuß|Fußweg|Autofahrt)\\b',
    '\\bis\\s+located\\s+(at|in|on)\\b',
    '\\bminutes\\s+(walk|by\\s+(car|bike|train))\\b'
  ].join('|'), 'iu');
  const locatieKop = /\b(locatie|ligging|bereik|route|adres|waar|vind|parkeer|reis|openbaar vervoer|openbaar-vervoer|station|aankomst|hoe kom|standort|lage|anfahrt|erreich|adresse|wo|finden|parken|location|address|directions|find us|getting here|where)(?![\p{L}])|\b(locatie|ligging|bereik|route|adres|parkeer|openbaar|station|aankomst|standort|anfahrt|erreich|adresse|location|address|directions)/iu;
  const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const blokRe = /<(h[1-6]|p|li)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let kop = '';
  let m;
  const locAlinea = [];
  while ((m = blokRe.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const tekst = strip(m[3]);
    if (tag[0] === 'h') { kop = tekst; continue; }
    if (!tekst) continue;
    const zinnen = tekst.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý"“])/u);
    const locZinnen = zinnen.filter(z => locatieZin.test(z));
    if (locZinnen.length > 0) locAlinea.push({ kop, zinnen: locZinnen, alleen: locZinnen.length === zinnen.length });
  }
  const verkeerd = locAlinea.filter(a => !locatieKop.test(a.kop));
  verkeerd.slice(0, 2).forEach(a => {
    reasons.push('Plaatsing: de ligging of bereikbaarheid van de klant staat onder de kop "' + (a.kop || 'zonder kop') + '", waar het niet bij hoort: "' + a.zinnen.join(' ').slice(0, 300) + '". Schrap deze zin(nen). Noem de ligging alleen onder een kop of vraag over locatie of bereikbaarheid, of laat haar helemaal weg. Sluit een alinea nooit af met een adres of routebeschrijving.');
  });
  if (locAlinea.length > 1 && verkeerd.length === 0) {
    reasons.push('Plaatsing: de ligging of bereikbaarheid van de klant komt in ' + locAlinea.length + ' alinea\'s voor. Noem haar hooguit een keer.');
  }
}
const detPass = reasons.length === 0;
return [{ json: { ...input, detPass, detReasons: reasons, wordCount } }];
