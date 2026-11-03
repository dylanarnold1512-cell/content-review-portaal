// Mailpakket voor de Excel rapportage klanten (bijvoorbeeld Bubbelbroeders, JMB Bouw en VariantZorg).
// Eerst werkt het portaal het Sheet bij (Excel workflow), daarna maakt dit een pakket dat Dylan in ChatGPT plakt.
// ChatGPT schrijft er een kant en klare mail van in Dylans stijl, met twee eerdere mails aan dezelfde klant als voorbeeld.
// Bronnen: de cijfers uit het Sheet van de klant (leidend), de Google Ads en Meta data, de context van Dylan en de voorbeeldmails.

const pakket = require('./pakket');

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const MAIL_TABLE_ID = process.env.N8N_RAPPORT_MAILS_TABLE_ID || 'QWU8VtkG42b88CLt';
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const MAX_VOORBEELDEN = 2;

const OPDRACHT_MAIL = [
  'OPDRACHT VOOR CHATGPT (lees dit eerst)',
  'Schrijf een kant en klare mail van Dylan aan de klant over de resultaten van deze maand. De mail moet direct verstuurd kunnen worden.',
  'Werkwijze:',
  '1. Loop eerst alle onderdelen van dit pakket langs voordat je schrijft: de cijfers uit het Sheet, de data per kanaal, de context van Dylan en wat hij in de mail kwijt wil.',
  '2. Schrijf in de stijl van de VOORBEELDMAILS: aanhef, toon, opbouw, lengte, hoe cijfers in de tekst worden verwerkt en hoe de mail eindigt. Neem geen zinnen, cijfers, namen of afspraken over uit de voorbeelden, want die gaan over andere maanden. Zijn er geen voorbeeldmails, schrijf dan in gewone, directe en persoonlijke taal.',
  '3. De cijfers uit het Sheet zijn leidend voor de totalen van de maand en voor de vergelijking met eerdere maanden. Gebruik de data van Google Ads en Meta om te laten zien wat erachter zit, bijvoorbeeld zoektermen, producten, campagnes, locaties, advertenties en wijzigingen. Wijkt een platformcijfer af van het Sheet, gebruik dan voor totalen het Sheet.',
  '4. Kies de twee of drie punten die voor deze klant het meest tellen en werk die uit met concrete cijfers. Vergelijk met vorige maand waar dat iets toevoegt. Vertel kort wat Dylan heeft gedaan of aangepast, op basis van de wijzigingen en de context, en sluit af met een concrete vraag, voorstel of volgende stap voor de klant.',
  '5. Gebruik de context van Dylan en wat hij in deze mail kwijt wil. Staat daar iets dat niet in de data terug te vinden is, neem het dan over zoals Dylan het schrijft.',
  '6. Noem conversies altijd als hele getallen. Rond af, maar zorg dat de getallen die je noemt kloppen met het Sheet.',
  '7. Noem de bron niet in de tekst en schrijf geen technische uitleg, bijvoorbeeld over toerekening, tracking of meetverschillen. Schrijf cijfers als feit. Kosten zijn geen prestatie op zich: noem ze met de opbrengst erbij.',
  '8. Schrijf in het Nederlands, zonder streepjes als leesteken, zonder emoticons en zonder vette tekst. Gebruik een zoekwoord altijd als "zoekwoord", zonder type erbij. Wat mensen intypten is een zoekterm. Vermijd woorden als onderstreept, substantieel en significant.',
  '9. Maak geen beweringen die de data niet draagt. Noem kleine aantallen als klein. Verzin geen afspraken, namen of gebeurtenissen die niet in dit pakket staan. Search Console staat niet in dit pakket: noem organische klikken alleen als Dylan ze in de context noemt.',
  '10. Controleer elk cijfer en elke bewering tegen het pakket voordat je antwoordt.',
  'Geef als antwoord alleen: de onderwerpregel op de eerste regel (Onderwerp: ...), daarna de mail. Onder de mail zet je alleen als dat nodig is een apart blok met de kop "Opmerkingen voor Dylan": ontbrekende data, geen of te weinig voorbeeldmails, of verschillen tussen het Sheet en het platform. Geen uitleg over je werkwijze.'
];

async function n8nTabel(pad, opties) {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, het portaal kan niet bij n8n.');
  const res = await fetch(`${N8N_BASE_URL}/api/v1${pad}`, { ...opties, headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', ...((opties && opties.headers) || {}) } });
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (err) { /* geen json */ }
  if (!res.ok) throw new Error(`n8n gaf een fout (${res.status}): ${data.message || raw.slice(0, 200)}`);
  return data;
}

async function alleMails() {
  const rijen = [];
  let cursor = null;
  for (let i = 0; i < 10; i++) {
    const data = await n8nTabel(`/data-tables/${MAIL_TABLE_ID}/rows?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    rijen.push(...(data.data || []));
    cursor = data.nextCursor;
    if (!cursor) break;
  }
  return rijen;
}

// De nieuwste voorbeeldmails van een klant: per periode de laatst toegevoegde, daarna de nieuwste perioden eerst.
function kiesVoorbeelden(rijen, klant, aantal) {
  const perPeriode = {};
  rijen.filter((r) => r.klant === klant && String(r.tekst || '').trim()).forEach((r) => {
    const huidig = perPeriode[r.periode];
    if (!huidig || String(r.toegevoegd).localeCompare(String(huidig.toegevoegd)) > 0) perPeriode[r.periode] = r;
  });
  return Object.values(perPeriode)
    .sort((a, b) => String(b.periode).localeCompare(String(a.periode)))
    .slice(0, aantal || MAX_VOORBEELDEN)
    .map((r) => ({ klant: r.klant, periode: r.periode, tekst: r.tekst, toegevoegd: r.toegevoegd }));
}

async function voorbeelden(klant, aantal) {
  return kiesVoorbeelden(await alleMails(), String(klant || ''), aantal || 10);
}

async function bewaarVoorbeeld({ klant, jaar, maand, tekst }) {
  klant = String(klant || '').trim();
  tekst = String(tekst || '').trim();
  if (!klant) throw new Error('Kies een klant.');
  if (tekst.length < 80) throw new Error('Plak de volledige mail. Deze tekst is te kort.');
  if (tekst.length > 20000) throw new Error('De mail is te lang om te bewaren.');
  const m = Number(maand); const j = Number(jaar);
  if (!(m >= 1 && m <= 12) || !(j >= 2024 && j <= 2100)) throw new Error('Maand of jaar klopt niet.');
  const periode = `${j}-${String(m).padStart(2, '0')}`;
  const vervangen = (await alleMails()).some((r) => r.klant === klant && r.periode === periode);
  // Een nieuwe rij is genoeg: bij dezelfde klant en periode telt de laatst toegevoegde mail.
  await n8nTabel(`/data-tables/${MAIL_TABLE_ID}/rows`, { method: 'POST', body: JSON.stringify({ data: [{ klant, periode, tekst, toegevoegd: new Date().toISOString() }], returnType: 'count' }) });
  return { ok: true, vervangen, periode };
}

async function haalSheet({ klant, jaar }) {
  try {
    const res = await fetch(`${N8N_BASE_URL}/webhook/excel-maandcijfers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ klant, jaar }), signal: AbortSignal.timeout(60000) });
    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (err) { /* geen json */ }
    if (Array.isArray(data)) data = data[0];
    if (!res.ok || !data) return { fout: `status ${res.status}${raw ? `, ${raw.slice(0, 150)}` : ''}` };
    return data;
  } catch (err) {
    return { fout: err.message };
  }
}

function sectieSheet(sheet, maand, jaar) {
  const regels = ['CIJFERS UIT HET SHEET (leidend voor de totalen)'];
  if (!sheet || sheet.fout) { regels.push(`Het Sheet kon niet worden gelezen: ${(sheet && sheet.fout) || 'geen antwoord'}.`); return regels; }
  regels.push(`Dit is het Sheet dat de klant ziet. De kolom ${MAANDEN[maand - 1]} hoort bij ${MAANDEN[maand - 1]} ${jaar}, de andere maandkolommen zijn andere maanden. Cellen staan gescheiden door een verticale streep.`);
  const tabs = sheet.tabbladen || [];
  if (!tabs.length) regels.push('Geen tabbladen gevonden.');
  tabs.forEach((t) => {
    regels.push(`Tabblad ${t.tabblad}:`);
    (t.rijen || []).forEach((r) => regels.push(r.join(' | ')));
  });
  return regels;
}

function sectieVoorbeelden(lijst) {
  const regels = ['VOORBEELDMAILS VAN DYLAN AAN DEZE KLANT (alleen voor stijl en opbouw, de inhoud gaat over andere maanden)'];
  if (!lijst.length) { regels.push('Er zijn nog geen voorbeeldmails bewaard voor deze klant. Schrijf in gewone, directe en persoonlijke taal en meld dat onder Opmerkingen voor Dylan.'); return regels; }
  lijst.forEach((v, i) => {
    regels.push(`Voorbeeld ${i + 1}, over ${v.periode}:`);
    regels.push(String(v.tekst).trim());
    regels.push('Einde voorbeeld.');
  });
  if (lijst.length < MAX_VOORBEELDEN) regels.push(`Er is maar ${lijst.length} voorbeeldmail. Twee geven een beter beeld van de stijl. Meld dat onder Opmerkingen voor Dylan.`);
  return regels;
}

function sectieMailWens(wens) {
  return ['WAT DYLAN IN DEZE MAIL KWIJT WIL', wens && String(wens).trim() ? String(wens).trim() : 'Niets specifieks aangegeven. Kies zelf de punten die het meest tellen.'];
}

function bouwMailTekst({ klant, jaar, maand, context, mailWens, verdieping, opties, sheet, voorbeeldMails, kanttekeningen }) {
  const kop = [`MAILPAKKET ${String(klant).toUpperCase()}, ${MAANDEN[maand - 1].toUpperCase()} ${jaar}`,
    'Dit pakket is bedoeld voor een mail aan de klant over deze maand. Het Sheet is leidend voor de totalen. Alle platformcijfers gaan over deze maand, tenzij erbij staat dat het vorige maand is.'];
  const sheetSectie = sectieSheet(sheet, maand, jaar);
  const kt = [...(kanttekeningen || [])];
  if (sheet && !sheet.fout) (sheet.fouten || []).forEach((f) => kt.push(`Het tabblad ${f.tabblad} van het Sheet kon niet worden gelezen: ${f.fout}`));
  return pakket.bouwTekst({
    klant, jaar, maand, context, actiepunten: [], verdieping, opties: { ...(opties || {}), linkedin: false }, rapportData: null, rapportTekst: null,
    opdracht: OPDRACHT_MAIL, kop, zonderActiepunten: true,
    voorSecties: [sectieMailWens(mailWens), sectieVoorbeelden(voorbeeldMails || []), sheetSectie],
    kanttekeningen: kt
  });
}

async function maakMailPakket({ klant, jaar, maand, context, mailWens, opties }) {
  klant = String(klant || '').trim();
  jaar = Number(jaar); maand = Number(maand);
  if (!klant) throw new Error('Kies een klant.');
  if (!(maand >= 1 && maand <= 12) || !(jaar >= 2024 && jaar <= 2100)) throw new Error('Maand of jaar klopt niet.');
  const kanttekeningen = [];
  const [verdiepingUitkomst, extra, sheet, mails] = await Promise.all([
    pakket.haalVerdieping({ klant, jaar, maand }).then((v) => ({ v })).catch((err) => ({ fout: err.message })),
    pakket.haalExtra({ klant, jaar, maand }),
    haalSheet({ klant, jaar }),
    alleMails().catch(() => null)
  ]);
  let verdieping = verdiepingUitkomst.v || { google: null, linkedin: null, meta: null };
  if (verdiepingUitkomst.fout) kanttekeningen.push(`De Google Ads en Meta data kon niet worden opgehaald: ${verdiepingUitkomst.fout}. Schrijf de mail op basis van het Sheet en de context, en meld dit onder Opmerkingen voor Dylan.`);
  verdieping.extra = await pakket.haalGeoNamen({ klant, jaar, maand }, extra);
  if (!mails) kanttekeningen.push('De voorbeeldmails konden niet worden opgehaald.');
  const voorbeeldMails = mails ? kiesVoorbeelden(mails, klant, MAX_VOORBEELDEN) : [];
  const tekst = bouwMailTekst({ klant, jaar, maand, context, mailWens, verdieping, opties, sheet, voorbeeldMails, kanttekeningen });
  return { tekst, bestandsnaam: `Mailpakket ${klant} ${jaar}-${String(maand).padStart(2, '0')}.txt`, aantalVoorbeelden: voorbeeldMails.length, sheetGelezen: !!(sheet && !sheet.fout && (sheet.tabbladen || []).length), googleData: !!verdieping.google };
}

module.exports = { OPDRACHT_MAIL, voorbeelden, bewaarVoorbeeld, kiesVoorbeelden, bouwMailTekst, maakMailPakket, sectieSheet, sectieVoorbeelden };
