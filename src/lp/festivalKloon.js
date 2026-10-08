// LP Fabriek: festivalpagina maken op basis van de WordPress kloon (08-10-2026).
// Dylan geeft een festival (naam en eventueel een link), het portaal haalt de feiten van die pagina op,
// combineert ze met de feiten van de klant en laat de AI de teksten van de kloonbron herschrijven. Daarna
// toont het portaal de echte bronpagina met die teksten erin (voorbeeld), kan Dylan in gewone taal aangeven
// wat anders moet, en zet pas daarna een concept in WordPress (src/lp/wpKloon.js).

const { stelInhoudVoor, controleerHtmlStructuur } = require('./wpKloon');
const { ICON_LIBRARY, ICON_NAMES } = require('./slotEngine');

const MAX_BYTES = 1500000;
const TIMEOUT_MS = 12000;

function veiligeUrl(invoer) {
  let u;
  try { u = new URL(String(invoer || '').trim()); } catch { throw new Error('Dit is geen geldige link.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Alleen http en https links zijn toegestaan.');
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === '::1' || h.startsWith('[')) {
    throw new Error('Deze link is niet toegestaan.');
  }
  return u;
}

async function haalPagina(url, fetchFn = fetch) {
  const u = veiligeUrl(url);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(u.toString(), {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LPFabriek/1.0)', Accept: 'text/html,application/xhtml+xml' }
    });
    if (!res.ok) throw new Error(`De pagina gaf status ${res.status}.`);
    const tekst = await res.text();
    return tekst.length > MAX_BYTES ? tekst.slice(0, MAX_BYTES) : tekst;
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('De pagina reageerde te langzaam.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function paginaTekst(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<(nav|footer|header|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14000);
}

const FEITEN_SYSTEEM = [
  'Je haalt feiten over een festival of evenement uit de tekst van een webpagina.',
  'Gebruik ALLEEN wat letterlijk in de tekst staat. Staat iets er niet in, laat het veld dan leeg. Verzin niets.',
  'Antwoord uitsluitend met JSON: {"naam":"","plaats":"","datum":"","tijden":"","locatie":"","bijzonderheden":""}.',
  'datum: volledig uitgeschreven in het Nederlands, bv. "12 t/m 14 oktober 2026". tijden: bv. "vanaf 12:00 uur". locatie: naam van de plek of het terrein.',
  'bijzonderheden: maximaal twee korte zinnen, alleen feiten die voor bezoekers relevant zijn (bv. aantal podia, soort muziek).'
].join('\n');

// Geeft { feiten: [{label, waarde}], festival: {...}, waarschuwingen: [] }. Zonder link of bij een fout werken we
// met wat Dylan zelf invulde.
async function haalFestivalFeiten({ naam, plaats, url, wensen }, { callAi, fetchFn } = {}) {
  const ai = callAi || require('./ai').callOpenAi;
  const waarschuwingen = [];
  let uitgelezen = {};
  if (url && String(url).trim()) {
    try {
      const html = await haalPagina(url, fetchFn);
      const tekst = paginaTekst(html);
      if (tekst.length < 80) {
        waarschuwingen.push('De festivalpagina gaf bijna geen tekst (waarschijnlijk wordt de inhoud met scripts geladen). Vul de datum en tijden zelf in bij extra wensen.');
      } else {
        const antwoord = await ai({
          systemPrompt: FEITEN_SYSTEEM,
          userPrompt: JSON.stringify({ opgegevenNaam: naam || '', opgegevenPlaats: plaats || '', paginaTekst: tekst })
        });
        if (antwoord && typeof antwoord === 'object') uitgelezen = antwoord;
      }
    } catch (err) {
      waarschuwingen.push(`De festivalpagina kon niet worden gelezen (${err.message}). Vul de gegevens zelf in bij extra wensen.`);
    }
  }
  const festival = {
    naam: String(naam || uitgelezen.naam || '').trim(),
    plaats: String(plaats || uitgelezen.plaats || '').trim(),
    datum: String(uitgelezen.datum || '').trim(),
    tijden: String(uitgelezen.tijden || '').trim(),
    locatie: String(uitgelezen.locatie || '').trim(),
    bijzonderheden: String(uitgelezen.bijzonderheden || '').trim(),
    wensen: String(wensen || '').trim()
  };
  if (!festival.naam) throw new Error('Vul de naam van het festival in.');
  const feiten = [
    ['Festival', festival.naam],
    ['Plaats van het festival', festival.plaats],
    ['Datum van het festival', festival.datum],
    ['Tijden van het festival', festival.tijden],
    ['Locatie van het festival', festival.locatie],
    ['Bijzonderheden van het festival', festival.bijzonderheden],
    ['Extra wensen van de opdrachtgever', festival.wensen]
  ].filter(([, w]) => w).map(([label, waarde]) => ({ label, waarde }));
  return { festival, feiten, waarschuwingen };
}

// Welke velden de AI mag herschrijven: koppen en lopende tekst, plus elk tekstveld waarin de plaats van de
// bronpagina (bv. Breda) nog voorkomt.
function kiesAiVelden(velden, bronPlaats) {
  const plaats = String(bronPlaats || '').trim().toLowerCase();
  return (velden || []).filter((v) => v.soort === 'tekst' && String(v.waarde || '').trim() !== '' &&
    (v.standaardAi || (plaats && String(v.waarde).toLowerCase().includes(plaats))));
}

function opdrachtVoor(festival, bronPlaats) {
  const delen = [`De nieuwe pagina is voor mensen die naar ${festival.naam}${festival.plaats ? ` in ${festival.plaats}` : ''} gaan en dichtbij willen overnachten.`];
  if (festival.datum) delen.push(`Het festival is ${festival.datum}.`);
  if (bronPlaats) delen.push(`De bronpagina gaat over ${bronPlaats}. Geen enkele verwijzing naar ${bronPlaats} mag blijven staan, tenzij die echt klopt voor dit festival.`);
  delen.push('Schrijf de koppen en teksten opnieuw voor dit festival. Verzin geen datums, tijden of afstanden die niet in FEITEN staan.');
  return delen.join(' ');
}

async function maakFestivalVoorstel({ velden, festival, feiten, klantFeiten, nietToegestaan, toonNotitie, bronPlaats, callAi }) {
  const teSchrijven = kiesAiVelden(velden, bronPlaats).map((v) => ({ id: v.id, groep: v.groep, label: v.label, huidig: v.waarde }));
  if (!teSchrijven.length) throw new Error('Geen teksten gevonden om te herschrijven.');
  const res = await stelInhoudVoor({
    opdracht: opdrachtVoor(festival, bronPlaats),
    feiten: [...(klantFeiten || []), ...feiten],
    nietToegestaan,
    toonNotitie,
    velden: teSchrijven,
    callAi
  });
  return res;
}


// Blokken die de AI mag vragen. De opmaak komt van ons (inline stijlen, geen eigen CSS van de AI of van een ander
// sjabloon), zodat een blok in elke kolom van een Beaver Builder pagina netjes past.
function renderBlok(b) {
  if (!b || typeof b !== 'object') return '';
  const t = (x, max) => esc(String(x === undefined || x === null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, max));
  if (b.type === 'tekst') {
    const kop = t(b.kop, 120);
    const tekst = t(b.tekst, 600);
    if (!kop && !tekst) return '';
    return `<div class="lpf-blok">${kop ? `<p style="margin:0 0 6px;font-weight:700;font-size:1.1em;line-height:1.2">${kop}</p>` : ''}${tekst ? `<p style="margin:0;line-height:1.5">${tekst}</p>` : ''}</div>`;
  }
  if (b.type === 'infostrook') {
    const items = (Array.isArray(b.items) ? b.items : []).filter((i) => i && String(i.titel || '').trim()).slice(0, 6);
    if (!items.length) return '';
    const lijn = '2px solid currentColor';
    const cellen = items.map((i) => {
      const naam = String(i.icoon || '').trim();
      const icoon = naam && ICON_LIBRARY[naam]
        ? `<span style="flex:0 0 28px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:1px solid currentColor;border-radius:50%;box-sizing:border-box">${ICON_LIBRARY[naam].replace(/width="22" height="22"/, 'width="16" height="16"')}</span>`
        : '';
      const toel = t(i.tekst, 140);
      return `<div style="display:flex;gap:10px;align-items:flex-start;min-width:0;padding:14px 13px;border-right:${lijn};border-bottom:${lijn};box-sizing:border-box">${icoon}<div style="min-width:0"><strong style="display:block;font-size:.86em;line-height:1.1;text-transform:uppercase;letter-spacing:.01em">${t(i.titel, 60)}</strong>${toel ? `<span style="display:block;margin-top:4px;font-size:.8em;line-height:1.3">${toel}</span>` : ''}</div></div>`;
    }).join('');
    return `<div class="lpf-blok" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));max-width:620px;margin:24px 0;border-top:${lijn};border-left:${lijn};color:inherit">${cellen}</div>`;
  }
  return '';
}

const REVISIE_SYSTEEM = [
  'Je past de pagina van een opdrachtgever aan volgens een instructie. De pagina is voor een festival (zie FEITEN).',
  'Regels:',
  '1. Voer de instructie letterlijk uit. Vraagt de instructie om iets weg te halen, haal het dan weg (bv. hele alinea\'s of regels). Vraagt ze om iets toe te voegen aan een bestaande tekst, voeg het toe.',
  '2. Aangepaste teksten geef je terug in "velden". Geef alleen velden terug die door de instructie veranderen. Behoud de HTML opmaak van een veld (tags, style attributen). Een tekst zonder HTML blijft tekst zonder HTML.',
  '3. Vraagt de instructie om nieuwe blokken, blokjes, kaartjes of een nieuw onderdeel toe te voegen op een plek, geef dan in "blokken" voor elk nieuw blok: {"plek":"voor" of "na","veld":"<id van een bestaand veld in het onderdeel waarboven of waaronder het blok komt, mag je weglaten>","titel":"korte naam","type":"infostrook","items":[{"titel":"korte kop","tekst":"optionele toelichting","icoon":"naam"}]}. Een infostrook is een rij kleine blokjes met een kader (bv. datum, plek, aankomst). Wil iemand alleen een losse tekst toevoegen, gebruik dan {"type":"tekst","kop":"...","tekst":"..."}. Andere soorten blokken kunnen niet; leg dat dan uit in "opmerking". Maak een blok alleen als erom wordt gevraagd.',
  '4. Kies "icoon" uit deze lijst: ICONEN (laat leeg als niets past). Een titel is kort (max 5 woorden), een toelichting hooguit 1 korte zin en mag leeg blijven.',
  '6. Verzin geen feiten. Gebruik alleen wat in FEITEN, in de instructie of in de huidige tekst staat. Staat een gevraagde inhoud van een blok er niet in, gebruik dan precies wat de instructie noemt.',
  '7. Schrijf in het Nederlands, in eenvoudige woorden en korte zinnen.',
  'Antwoord uitsluitend met JSON: {"velden":[{"id":"...","waarde":"..."}],"blokken":[...],"opmerking":""}. Gebruik precies de id\'s die je krijgt.'
].join('\n');

// stijl: { styles, open, inner, close } uit zoekStijlvoorbeeld, of null. Geeft { voorstellen, blokken, waarschuwingen }.
async function reviseerTeksten({ instructie, velden, feiten, nietToegestaan, stijl, scope, anker, callAi }) {
  if (!String(instructie || '').trim()) throw new Error('Typ eerst wat er anders moet.');
  const lijst = (Array.isArray(velden) ? velden : []).filter((v) => v && v.id && typeof v.huidig === 'string' && v.huidig.trim());
  const ankerOk = anker && anker.node ? { node: String(anker.node), groep: String(anker.groep || 'onderdeel') } : null;
  if (!lijst.length && !ankerOk) throw new Error('Geen teksten om aan te passen.');
  const ai = callAi || require('./ai').callOpenAi;
  const antwoord = await ai({
    systemPrompt: REVISIE_SYSTEEM,
    userPrompt: JSON.stringify({
      instructie: String(instructie).trim(),
      ...(scope ? { SCOPE: `De instructie geldt alleen voor dit onderdeel van de pagina: "${String(scope).slice(0, 100)}". Alle velden hieronder horen bij dat onderdeel. Nieuwe blokken komen direct boven of onder dit onderdeel; laat "veld" weg of kies een veld hieronder.` } : {}),
      nietToegestaan: nietToegestaan || [],
      FEITEN: (feiten || []).map((f) => ({ label: f.label, waarde: f.waarde })),
      ICONEN: ICON_NAMES,
      velden: lijst.map((v) => ({ id: v.id, label: `${v.groep}, ${v.label}`, huidig: v.huidig }))
    }, null, 2)
  });
  const perId = new Map(lijst.map((v) => [v.id, v]));
  const voorstellen = [];
  const waarschuwingen = [];
  for (const item of Array.isArray(antwoord && antwoord.velden) ? antwoord.velden : []) {
    const bron = perId.get(item && item.id);
    if (!bron || typeof item.waarde !== 'string' || item.waarde === bron.huidig) continue;
    voorstellen.push({ id: item.id, waarde: item.waarde });
    if (!controleerHtmlStructuur(bron.huidig, item.waarde) && !/(weg|verwijder|haal|toevoeg|voeg)/i.test(String(instructie))) {
      waarschuwingen.push(`${bron.groep}, ${bron.label}: de opmaak is anders dan het origineel. Controleer in het voorbeeld.`);
    }
  }
  const blokken = [];
  const gevraagd = Array.isArray(antwoord && antwoord.blokken) ? antwoord.blokken : [];
  for (const b of gevraagd) {
    const veld = perId.get(b && b.veld) || (ankerOk ? { node: ankerOk.node, groep: ankerOk.groep } : null);
    const html = renderBlok(b);
    if (!veld || !veld.node || !html) { waarschuwingen.push('Een gevraagd blok kon niet op een plek worden gezet. Zeg bij welke tekst of kop het moet komen.'); continue; }
    blokken.push({ na: String(veld.node), waar: b.plek === 'voor' ? 'voor' : 'na', titel: String((b && b.titel) || 'Nieuw blok').slice(0, 80), plekNaam: veld.groep, html });
  }
  if (antwoord && typeof antwoord.opmerking === 'string' && antwoord.opmerking.trim()) waarschuwingen.push(antwoord.opmerking.trim().slice(0, 300));
  return { voorstellen, blokken, waarschuwingen };
}

// ---- Voorbeeld: de echte bronpagina met de nieuwe teksten erin ----

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function regexEsc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Patroon dat een tekst uit Beaver Builder terugvindt in de HTML van de pagina, ook als WordPress er aanhalingstekens,
// streepjes of witruimte anders van heeft gemaakt (wptexturize).
function maakPatroon(tekst) {
  const delen = String(tekst).split(/(\s+|&nbsp;| )/).filter((x) => x !== '');
  const stukken = delen.map((d) => {
    if (/^(\s+|&nbsp;| )$/.test(d)) return '(?:\\s|&nbsp;|\\u00a0|&#160;)+';
    let uit = '';
    for (const ch of d) {
      if (ch === "'") uit += "(?:'|&#8217;|&#8216;|&#039;|&#39;|’|‘)";
      else if (ch === '"') uit += '(?:"|&quot;|&#8220;|&#8221;|&#8243;|“|”)';
      else if (ch === '-') uit += '(?:-|&#8211;|&#8212;|–|—)';
      else if (ch === '&') uit += '(?:&amp;|&#038;|&)';
      else uit += regexEsc(ch);
    }
    return uit;
  });
  return new RegExp(stukken.join(''), 'g');
}

function zetVoorbeeldOm(html, baseUrl) {
  let uit = String(html || '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<meta[^>]+http-equiv=["']?(refresh|content-security-policy)["']?[^>]*>/gi, '');
  const kop = `<base href="${baseUrl}" target="_blank"><style>.fl-animation,[class*="fl-animation"]{opacity:1!important;visibility:visible!important;animation:none!important;transform:none!important}a{cursor:default}</style>`;
  if (/<head[^>]*>/i.test(uit)) uit = uit.replace(/<head[^>]*>/i, (m) => `${m}${kop}`);
  else uit = `${kop}${uit}`;
  return uit;
}

// Beaver Builder zet om elke module een element met class "fl-node-<id>". Dat id is hetzelfde als de node in de
// layoutdata, dus een tekst is zo terug te vinden zonder de tekst zelf te hoeven matchen (die matcht niet na wpautop).
function vindElementBalans(html, startIdx) {
  const open = /^<([a-zA-Z][a-zA-Z0-9]*)\b/.exec(html.slice(startIdx));
  if (!open) return -1;
  const tag = open[1].toLowerCase();
  const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, 'gi');
  re.lastIndex = startIdx;
  let diepte = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] === '/') {
      diepte -= 1;
      if (diepte === 0) return m.index + m[0].length;
    } else if (m[2] !== '/') {
      diepte += 1;
    }
  }
  return -1;
}

function vindModule(html, node) {
  const re = new RegExp(`<[a-zA-Z][a-zA-Z0-9]*\\b[^>]*\\bclass=["'][^"']*\\bfl-node-${regexEsc(String(node))}\\b[^"']*["'][^>]*>`, 'i');
  const m = re.exec(html);
  if (!m) return null;
  const einde = vindElementBalans(html, m.index);
  return einde < 0 ? null : { start: m.index, end: einde };
}

// Vervangt de binnenkant van het eerste element in html[start,end) dat bij het patroon past.
function vervangBinnenkant(html, start, end, openPatroon, nieuweInhoud) {
  const stuk = html.slice(start, end);
  const m = openPatroon.exec(stuk);
  if (!m) return null;
  const abs = start + m.index;
  const elEinde = vindElementBalans(html, abs);
  if (elEinde < 0 || elEinde > end) return null;
  const sluitIdx = html.lastIndexOf('</', elEinde - 1);
  const binnenStart = abs + m[0].length;
  if (sluitIdx < binnenStart) return null;
  return html.slice(0, binnenStart) + nieuweInhoud + html.slice(sluitIdx);
}

// Probeert een wijziging via het module id in de pagina te zetten. Geeft de nieuwe html of null.
function zetViaModule(html, w) {
  if (!w.node) return null;
  const mod = vindModule(html, w.node);
  if (!mod) return null;
  const metHtml = /<[a-z!/]/i.test(w.nieuw);
  if (w.pad === 'text' && w.module === 'rich-text') {
    return vervangBinnenkant(html, mod.start, mod.end, /<div\b[^>]*\bclass=["'][^"']*\bfl-rich-text\b[^"']*["'][^>]*>/i, w.nieuw);
  }
  if (w.pad === 'heading' && w.module === 'heading') {
    return vervangBinnenkant(html, mod.start, mod.end, /<[a-zA-Z0-9]+\b[^>]*\bclass=["'][^"']*\bfl-heading-text\b[^"']*["'][^>]*>/i, metHtml ? w.nieuw : esc(w.nieuw));
  }
  return null;
}

// Zet een blok (HTML uit het portaal) voor of na een module in de pagina, in dezelfde vorm als een HTML module van
// Beaver Builder, zodat het voorbeeld lijkt op wat het concept straks krijgt.
function voegBlokIn(html, blok) {
  if (!blok || typeof blok.html !== 'string' || !blok.html.trim() || !blok.na) return { html, ok: false };
  const mod = vindModule(html, blok.na);
  if (!mod) return { html, ok: false };
  const omhulsel = `<div class="fl-module fl-module-html lpf-blok" data-lpf-blok="1"><div class="fl-module-content fl-node-content"><div class="fl-html">${blok.html}</div></div></div>`;
  const plek = blok.waar === 'voor' ? mod.start : mod.end;
  return { html: html.slice(0, plek) + omhulsel + html.slice(plek), ok: true };
}

const RICH_OPEN = /<div\b[^>]*\bclass=["'][^"']*\bfl-rich-text\b[^"']*["'][^>]*>/i;
const HEADING_OPEN = /<[a-zA-Z0-9]+\b[^>]*\bclass=["'][^"']*\bfl-heading-text\b[^"']*["'][^>]*>/i;

// Zet data-lpf="<veld id>" op het element met de tekst van een module, zodat het voorbeeld die tekst kan laten bewerken.
function markeerBewerkbaar(html, veld) {
  if (!veld || !veld.node || !veld.id) return html;
  const mod = vindModule(html, veld.node);
  if (!mod) return html;
  let patroon = null;
  let soort = 'html';
  if (veld.pad === 'text' && veld.module === 'rich-text') patroon = RICH_OPEN;
  else if (veld.pad === 'heading' && veld.module === 'heading') { patroon = HEADING_OPEN; soort = 'plat'; }
  if (!patroon) return html;
  const stuk = html.slice(mod.start, mod.end);
  const m = patroon.exec(stuk);
  if (!m) return html;
  const abs = mod.start + m.index;
  const sluit = abs + m[0].length - 1; // positie van ">"
  const attr = ` data-lpf="${String(veld.id).replace(/"/g, '&quot;')}" data-lpf-soort="${soort}"`;
  return html.slice(0, sluit) + attr + html.slice(sluit);
}

// Script dat in het voorbeeld draait (de scripts van de site zelf zijn weggehaald): klik op een gemarkeerde tekst om hem
// te bewerken, wijzigingen gaan als bericht naar het portaal.
const BEWERK_SCRIPT = `<style>[data-lpf]{transition:outline .1s}[data-lpf]:hover{outline:2px dashed #e0a800;outline-offset:3px;cursor:text}[data-lpf][contenteditable="true"]{outline:2px solid #e0a800;outline-offset:3px}</style><script>
(function(){
  function stuur(t,start){
    var plat=t.getAttribute('data-lpf-soort')==='plat';
    parent.postMessage({lpf:t.getAttribute('data-lpf'),waarde:plat?t.textContent:t.innerHTML,start:!!start},'*');
  }
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a');
    var t=e.target.closest&&e.target.closest('[data-lpf]');
    if(a)e.preventDefault();
    if(!t)return;
    if(t.getAttribute('contenteditable')!=='true'){
      t.setAttribute('contenteditable','true');
      t.focus();
      stuur(t,true);
    }
  },true);
  document.addEventListener('input',function(e){
    var t=e.target.closest&&e.target.closest('[data-lpf]');
    if(t)stuur(t,false);
  });
  var bar=document.createElement('div');
  bar.id='lpf-bar';
  bar.setAttribute('style','position:absolute;z-index:2147483647;display:none;gap:6px;flex-direction:column;font:12px/1.2 sans-serif');
  function knop(w,t){var b=document.createElement('button');b.type='button';b.textContent=t;b.setAttribute('data-w',w);b.setAttribute('style','background:#e0a800;color:#111;border:0;border-radius:6px;padding:5px 9px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.3)');return b;}
  bar.appendChild(knop('mod','AI feedback op dit onderdeel'));
  bar.appendChild(knop('rij','AI feedback op de hele sectie'));
  document.body.appendChild(bar);
  var huidig=null,verberg=null;
  function nodeVan(m){var c=m.classList;for(var i=0;i<c.length;i++){var k=c[i];if(k.indexOf('fl-node-')===0&&k!=='fl-node-content')return k.slice(8);}return null;}
  document.addEventListener('mouseover',function(e){
    var m=e.target.closest&&e.target.closest('.fl-module');
    if(!m||m.getAttribute('data-lpf-blok')||!nodeVan(m))return;
    clearTimeout(verberg);
    huidig=m;
    var r=m.getBoundingClientRect();
    bar.style.display='flex';
    bar.style.left=(window.pageXOffset+r.left+8)+'px';
    bar.style.top=(window.pageYOffset+r.top+8)+'px';
  });
  document.addEventListener('mouseout',function(){clearTimeout(verberg);verberg=setTimeout(function(){bar.style.display='none';},700);});
  bar.addEventListener('mouseover',function(){clearTimeout(verberg);});
  function modulesIn(el){
    var lijst=[];
    if(el.classList.contains('fl-module')){var n0=nodeVan(el);if(n0)lijst.push(n0);}
    var ms=el.querySelectorAll('.fl-module');
    for(var i=0;i<ms.length;i++){var n=nodeVan(ms[i]);if(n&&lijst.indexOf(n)<0)lijst.push(n);}
    return lijst;
  }
  function labelVan(el){
    var h=el.querySelector('h1,h2,h3,h4,h5,h6,.fl-heading-text');
    var t=((h||el).textContent||'').replace(/ +/g,' ').trim();
    return t.slice(0,70);
  }
  bar.addEventListener('click',function(e){
    var w=e.target.getAttribute&&e.target.getAttribute('data-w');
    if(!w||!huidig)return;
    e.stopPropagation();
    var el=w==='rij'?(huidig.closest('.fl-row')||huidig):huidig;
    var nodes=modulesIn(el);
    parent.postMessage({lpfFb:{node:nodeVan(el)||nodeVan(huidig),rij:w==='rij',nodes:nodes,label:labelVan(el)}},'*');
  });
  var gemarkeerd=null;
  window.addEventListener('message',function(e){
    var d=e.data;
    if(!d||typeof d.lpfMark!=='string')return;
    if(gemarkeerd){gemarkeerd.style.outline='';gemarkeerd=null;}
    if(!d.lpfMark)return;
    var m=document.querySelector('.fl-node-'+d.lpfMark);
    if(m){m.style.outline='3px solid #e0a800';m.style.outlineOffset='-3px';gemarkeerd=m;m.scrollIntoView({block:'center'});}
  });
  document.addEventListener('keydown',function(e){
    var t=e.target.closest&&e.target.closest('[data-lpf]');
    if(t&&t.getAttribute('data-lpf-soort')==='plat'&&e.key==='Enter')e.preventDefault();
  });
})();
</script>`;

// wijzigingen: [{ oud, nieuw, soort, node?, pad?, module? }]. Geeft { html, nietGevonden: aantal }.
function bouwVoorbeeldHtml({ html, baseUrl, wijzigingen, bewerkbaar, blokken }) {
  let uit = String(html || '');
  let nietGevonden = 0;
  for (const w of Array.isArray(wijzigingen) ? wijzigingen : []) {
    if (!w || typeof w.oud !== 'string' || typeof w.nieuw !== 'string' || !w.oud.trim() || w.oud === w.nieuw) continue;
    const viaModule = zetViaModule(uit, w);
    if (viaModule !== null) { uit = viaModule; continue; }
    const metHtml = /<[a-z!/]/i.test(w.nieuw);
    const vervanging = metHtml ? w.nieuw : esc(w.nieuw);
    const oudPlat = /<[a-z!/]/i.test(w.oud) ? w.oud : esc(w.oud);
    let gevonden = false;
    for (const kandidaat of [w.oud, oudPlat]) {
      const re = maakPatroon(kandidaat);
      if (re.test(uit)) {
        uit = uit.replace(maakPatroon(kandidaat), () => vervanging);
        gevonden = true;
        break;
      }
    }
    if (!gevonden && /<p[\s>]/i.test(w.oud)) {
      // Rich text: probeer het stuk zonder de buitenste opmaakwhitespace
      const kaal = w.oud.trim();
      const re = maakPatroon(kaal);
      if (re.test(uit)) { uit = uit.replace(maakPatroon(kaal), () => vervanging); gevonden = true; }
    }
    if (!gevonden) nietGevonden += 1;
  }
  let blokkenNietGevonden = 0;
  for (const b of Array.isArray(blokken) ? blokken : []) {
    const r = voegBlokIn(uit, b);
    uit = r.html;
    if (!r.ok) blokkenNietGevonden += 1;
  }
  let metMarkering = uit;
  let bewerkbaarAantal = 0;
  for (const v of Array.isArray(bewerkbaar) ? bewerkbaar : []) {
    const na = markeerBewerkbaar(metMarkering, v);
    if (na !== metMarkering) bewerkbaarAantal += 1;
    metMarkering = na;
  }
  let omgezet = zetVoorbeeldOm(metMarkering, baseUrl);
  omgezet = /<\/body>/i.test(omgezet) ? omgezet.replace(/<\/body>/i, () => `${BEWERK_SCRIPT}</body>`) : omgezet + BEWERK_SCRIPT;
  return { html: omgezet, nietGevonden, blokkenNietGevonden, bewerkbaar: bewerkbaarAantal };
}

module.exports = {
  veiligeUrl,
  haalPagina,
  paginaTekst,
  haalFestivalFeiten,
  kiesAiVelden,
  opdrachtVoor,
  maakFestivalVoorstel,
  reviseerTeksten,
  maakPatroon,
  bouwVoorbeeldHtml
};
