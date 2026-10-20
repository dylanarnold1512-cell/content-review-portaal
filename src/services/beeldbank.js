// Beeldbank: afbeeldingen die de klant (of Dylan) aanlevert. Het portaal verkleint de afbeelding in de browser
// en stuurt hem hier naartoe. Deze service geeft hem door aan de n8n workflow "BA - Shared - Beeldbank Verwerk",
// die de map, bestandsnaam en alt tekst bepaalt en de afbeelding in de Drive beeldmap van de klant zet.
// De tabel beeldbank (n8n data table) bevat per klant wat er al staat.
const { n8nTabel } = require('./aiZichtbaarheid');

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const TABLE_ID = process.env.N8N_BEELDBANK_TABLE_ID || 'sAkIrfiuFopOFoxw';
const WEBHOOK_URL = process.env.N8N_BEELDBANK_WEBHOOK_URL || `${N8N_BASE_URL}/webhook/beeldbank-upload`;
const TOEGESTANE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BASE64 = 6000000;

// Aan voor klanten met beeldbank: true in clients.js of in de omgevingsvariabele BEELDBANK_KLANTEN (ids, met komma).
// Bestaande klanten met een eigen fotomap blijven buiten beeld tot Dylan ze hier bewust aanzet.
function beeldbankAan(config) {
  if (!config) return false;
  if (config.beeldbank === true) return true;
  const lijst = String(process.env.BEELDBANK_KLANTEN || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return lijst.includes(String(config.id || '').toLowerCase());
}

async function lijstAfbeeldingen(klantNaam) {
  const rijen = await n8nTabel(TABLE_ID, [{ columnName: 'client_name', condition: 'eq', value: klantNaam }]);
  return rijen
    .map((r) => ({
      map: r.drive_map || '',
      bestandsnaam: r.bestandsnaam || '',
      alt: r.alt_tekst || '',
      toegevoegd: r.toegevoegd || r.createdAt || '',
      bron: r.bron || ''
    }))
    .sort((a, b) => String(b.toegevoegd).localeCompare(String(a.toegevoegd)));
}

// Controleert de invoer en geeft hem door aan n8n. Geeft het antwoord van de workflow terug
// (status geplaatst, duplicaat, onzeker of fout).
async function stuurAfbeelding(klantNaam, invoer) {
  const mime = String(invoer.mime || '').toLowerCase();
  const data = String(invoer.dataBase64 || '').replace(/^data:[^,]*,/, '');
  if (!TOEGESTANE_TYPES.includes(mime)) return { status: 'fout', melding: 'Alleen JPG, PNG of WebP is toegestaan.' };
  if (data.length < 100) return { status: 'fout', melding: 'De afbeelding is leeg.' };
  if (data.length > MAX_BASE64) return { status: 'fout', melding: 'De afbeelding is te groot, ook na verkleinen.' };
  const token = process.env.N8N_BEELDBANK_TOKEN;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Beeldbank-Token'] = token;
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      clientName: klantNaam,
      dataBase64: data,
      mime,
      bestandsnaam: String(invoer.bestandsnaam || '').slice(0, 120),
      breedte: Number(invoer.breedte) || 0,
      hoogte: Number(invoer.hoogte) || 0,
      hint: String(invoer.hint || '').slice(0, 200),
      mapNaam: String(invoer.mapNaam || '').trim().slice(0, 40)
    })
  });
  const tekst = await res.text();
  let antwoord = null;
  try { antwoord = JSON.parse(tekst); } catch (e) { /* geen JSON */ }
  if (!antwoord) return { status: 'fout', melding: res.ok ? 'De beeldbank gaf een onbegrijpelijk antwoord.' : `De beeldbank is niet bereikbaar (${res.status}).` };
  return antwoord;
}

module.exports = { beeldbankAan, lijstAfbeeldingen, stuurAfbeelding, TOEGESTANE_TYPES, MAX_BASE64 };
