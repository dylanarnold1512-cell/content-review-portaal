// LP Fabriek: een tekst vervangen of weghalen bij alle pagina's van een klant (13-10-2026).
// Aanleiding: de AI had bij MAC Bouw een verzonnen introzin onder "Projecten" gezet op meerdere pagina's.
// Dit bestand bevat alleen de pure logica (zoeken en vervangen in slotData), zonder Notion of WordPress,
// zodat het goed te testen is. De routes staan in src/routes/lp.js.

// Loopt door alle tekstwaarden in slotData (ook in lijsten en objecten) en roept bezoek(waarde, topSleutel) aan.
// Geeft de nieuwe waarde terug als bezoek iets teruggeeft dat geen undefined is.
function loopDoor(waarde, topSleutel, bezoek) {
  if (typeof waarde === 'string') {
    const nieuw = bezoek(waarde, topSleutel);
    return nieuw === undefined ? waarde : nieuw;
  }
  if (Array.isArray(waarde)) return waarde.map((w) => loopDoor(w, topSleutel, bezoek));
  if (waarde && typeof waarde === 'object') {
    const uit = {};
    for (const [k, v] of Object.entries(waarde)) uit[k] = loopDoor(v, topSleutel, bezoek);
    return uit;
  }
  return waarde;
}

function loopDoorSlotData(slotData, bezoek) {
  const uit = {};
  for (const [sleutel, waarde] of Object.entries(slotData || {})) uit[sleutel] = loopDoor(waarde, sleutel, bezoek);
  return uit;
}

function opschonen(tekst) {
  return tekst.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}

function controleerInvoer({ zoek, slotKey }) {
  if (typeof zoek !== 'string' || zoek.trim().length < 4) {
    throw new Error('Vul minstens 4 tekens in bij "Tekst zoeken", zodat niet per ongeluk te veel wordt aangepast.');
  }
  if (slotKey !== undefined && slotKey !== null && typeof slotKey !== 'string') throw new Error('Ongeldig veld.');
}

// Zoekt waar de tekst voorkomt. Hoofdlettergevoelig en exact, zodat je precies ziet wat er gebeurt.
// slotKey (optioneel) beperkt het zoeken tot een veld van het sjabloon, bijvoorbeeld "projectsIntro".
function vindTekst(slotData, { zoek, slotKey } = {}) {
  controleerInvoer({ zoek, slotKey });
  const velden = new Map();
  loopDoorSlotData(slotData, (waarde, top) => {
    if (slotKey && top !== slotKey) return undefined;
    if (waarde.includes(zoek)) {
      const lijst = velden.get(top) || [];
      const plek = waarde.indexOf(zoek);
      lijst.push(waarde.slice(Math.max(0, plek - 40), plek + zoek.length + 40));
      velden.set(top, lijst);
    }
    return undefined;
  });
  const slotKeys = [...velden.keys()];
  const aantal = [...velden.values()].reduce((som, l) => som + l.length, 0);
  return { aantal, slotKeys, fragmenten: slotKeys.map((k) => ({ veld: k, tekst: velden.get(k)[0] })) };
}

// Vervangt de tekst. heleVeld: true betekent dat een tekstveld waarin de zoektekst voorkomt helemaal wordt
// vervangen (handig als de zin per pagina een beetje verschilt). vervang mag leeg zijn om te verwijderen.
function vervangTekst(slotData, { zoek, vervang, slotKey, heleVeld } = {}) {
  controleerInvoer({ zoek, slotKey });
  const nieuweTekst = typeof vervang === 'string' ? vervang : '';
  let aantal = 0;
  const nieuw = loopDoorSlotData(slotData, (waarde, top) => {
    if (slotKey && top !== slotKey) return undefined;
    if (!waarde.includes(zoek)) return undefined;
    aantal += 1;
    if (heleVeld) return nieuweTekst;
    return opschonen(waarde.split(zoek).join(nieuweTekst));
  });
  return { slotData: nieuw, aantal };
}

// Plaatshouders (19-10-2026): in "Tekst zoeken" en "Vervangen door" mag je {plaats} en {bedrijf} gebruiken. Per
// pagina worden ze ingevuld met de plaatsnaam van die pagina en de naam van het bedrijf, zodat een tekst met een
// plaats er in een keer bij alle pagina's goed in komt. Is er een waarde leeg, dan geeft dit een duidelijke fout.
const PLAATSHOUDER_RE = /\{\s*(plaatsnaam|plaats|bedrijfsnaam|bedrijf)\s*\}/gi;

function heeftPlaatshouders(tekst) {
  return typeof tekst === 'string' && new RegExp(PLAATSHOUDER_RE.source, 'i').test(tekst);
}

function vulPlaatshouders(tekst, { plaats, bedrijf } = {}) {
  if (typeof tekst !== 'string') return tekst;
  return tekst.replace(PLAATSHOUDER_RE, (_m, naam) => {
    const soort = naam.toLowerCase().startsWith('plaats') ? 'plaats' : 'bedrijf';
    const waarde = String((soort === 'plaats' ? plaats : bedrijf) || '').trim();
    if (!waarde) throw new Error(soort === 'plaats' ? 'Bij deze pagina is geen plaatsnaam ingevuld, dus {plaats} kan niet worden ingevuld.' : 'De bedrijfsnaam is niet bekend, dus {bedrijf} kan niet worden ingevuld.');
    return waarde;
  });
}

module.exports = { vindTekst, vervangTekst, loopDoorSlotData, vulPlaatshouders, heeftPlaatshouders };
