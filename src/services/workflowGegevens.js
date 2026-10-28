// Gegevens per klant die de n8n workflows gebruiken (de Clients-tabel in n8n):
// reviewmail, contactnaam, blogs per maand, WordPress, schrijfstijl en AI meting.
// Dit is alleen een frontend erop, zodat Dylan ze in het portaal kan aanpassen
// en kan zien of alles klopt voor livegang. Net als het Kennisdocument praat dit
// rechtstreeks met de n8n data table REST API (header X-N8N-API-KEY).
//
// Wachtwoorden en tokens worden nooit teruggegeven, alleen of ze zijn ingevuld.
// De kolom status wordt niet hier gezet: die volgt de Klantstatus in het portaal
// via de workflow "BA - Klantstatus Sync".

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const CLIENTS_TABLE_ID = process.env.N8N_CLIENTS_TABLE_ID || '42vYfT6ktan72bpa';

const FAQ_MODI = [
  { waarde: 'uit', label: 'Uit' },
  { waarde: 'aan', label: 'Aan' }
];

// type: tekst | lang | getal | schakelaar | keuze (met opties)
const GROEPEN = [
  {
    id: 'review', titel: 'Reviewmail en contact',
    velden: [
      { veld: 'notification_email', label: 'E-mailadres voor de reviewmail', type: 'tekst', tip: 'Hier komt de mail met de blog die de klant moet goedkeuren. Meerdere adressen kun je met een komma scheiden.', placeholder: 'info@voorbeeld.nl' },
      { veld: 'contact_naam', label: 'Aanhef in de mail', type: 'tekst', tip: 'De mail begint met "Beste" en dan deze naam. Leeg betekent dat de bedrijfsnaam wordt gebruikt.', placeholder: 'Nick' }
    ]
  },
  {
    id: 'publicatie', titel: 'Blogs en publicatie',
    velden: [
      { veld: 'blogs_per_maand', label: 'Blogs per maand', type: 'getal', min: 0, max: 31, tip: 'Hoeveel blogs de planning per maand klaarzet.' },
      { veld: 'publicatie_vertraging_uren', label: 'Vertraging na goedkeuring (uren)', type: 'getal', min: 0, max: 720, tip: 'Hoe lang na goedkeuring de blog wordt gepubliceerd. Leeg of 0 betekent bij de eerstvolgende run.' },
      { veld: 'taal', label: 'Taal van de blogs', type: 'tekst', tip: 'Bijvoorbeeld nl of de.', placeholder: 'nl' }
    ]
  },
  {
    id: 'wordpress', titel: 'WordPress',
    velden: [
      { veld: 'wp_url', label: 'Website', type: 'tekst', tip: 'Adres van de WordPress site, met https://.', placeholder: 'https://www.voorbeeld.nl' },
      { veld: 'wp_username', label: 'Gebruikersnaam', type: 'tekst', tip: 'Gebruiker waarmee blogs worden aangemaakt.' },
      { veld: 'wp_post_type', label: 'Berichttype', type: 'tekst', tip: 'Meestal posts.', placeholder: 'posts' }
    ],
    geheimen: [
      { veld: 'wp_app_password', label: 'Applicatiewachtwoord' },
      { veld: 'notion_token', label: 'Notion token' },
      { veld: 'notion_database_id', label: 'Notion database' }
    ]
  },
  {
    id: 'schrijven', titel: 'Schrijfstijl en inhoud',
    velden: [
      { veld: 'branche', label: 'Branche', type: 'tekst' },
      { veld: 'doelgroep', label: 'Doelgroep', type: 'lang' },
      { veld: 'tone_of_voice', label: 'Tone of voice', type: 'lang' },
      { veld: 'cta', label: 'Call to action', type: 'lang' },
      { veld: 'diensten', label: 'Diensten', type: 'lang' },
      { veld: 'usps', label: 'USPs', type: 'lang' },
      { veld: 'niet_onderwerpen', label: 'Niet over schrijven', type: 'lang' },
      { veld: 'beeld_map_id', label: 'Fotomap (Google Drive map id)', type: 'tekst' }
    ]
  },
  {
    id: 'ai', titel: 'AI zichtbaarheid',
    velden: [
      { veld: 'ai_meting', label: 'AI meting aan', type: 'schakelaar', tip: 'Aan: de wekelijkse meting in ChatGPT en Gemini draait voor deze klant.' },
      { veld: 'ai_domein', label: 'Domein voor de meting', type: 'tekst', placeholder: 'voorbeeld.nl' },
      { veld: 'ai_zoektermen', label: 'Zoektermen voor de meting', type: 'lang' },
      { veld: 'ai_runs', label: 'Aantal runs per vraag', type: 'getal', min: 1, max: 10 }
    ]
  },
  {
    id: 'faq', titel: 'FAQ\'s uit AI vragen',
    velden: [
      { veld: 'faq_modus', label: 'FAQ voorstellen', type: 'keuze', opties: FAQ_MODI, standaard: 'uit', tip: 'Alleen aanzetten voor klanten die hiervoor betalen. Aan: een AI vraag vervangt een algemene vraag in de FAQ van een bestaande pagina of blog. Er is geen goedkeuring, de aanpassingen komen in Telegram en in het FAQ scherm.' },
      { veld: 'faq_html_sjabloon', label: 'Opmaak van een FAQ blok (HTML)', type: 'lang', tip: 'Leeg is een eenvoudig blok met kop en uitklapbare vragen. Gebruik {{vragen}} voor de plek van de vragen.' }
    ]
  }
];

const BEWERKBAAR = new Map();
for (const g of GROEPEN) for (const v of g.velden) BEWERKBAAR.set(v.veld, v);

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, dus het portaal kan niet bij de Clients tabel in n8n.');
  return key;
}

async function n8nClients(path, options = {}) {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/data-tables/${CLIENTS_TABLE_ID}${path}`, {
    ...options,
    headers: { 'X-N8N-API-KEY': getApiKey(), 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (err) { /* geen JSON */ }
  if (!res.ok) throw new Error(`n8n Clients tabel gaf een fout (${res.status}): ${data.message || raw || res.statusText}`);
  return data;
}

function filterOp(kolom, waarde) {
  return JSON.stringify({ type: 'and', filters: [{ columnName: kolom, condition: 'eq', value: waarde }] });
}

async function zoekRij(clientId, naam) {
  for (const [kolom, waarde] of [['portaal_slug', clientId], ['client_name', naam]]) {
    if (!waarde) continue;
    const res = await n8nClients(`/rows?limit=1&filter=${encodeURIComponent(filterOp(kolom, waarde))}`);
    const rij = (res.data || [])[0];
    if (rij) return rij;
  }
  return null;
}

function leeg(w) { return w === undefined || w === null || String(w).trim() === ''; }

function geldigeMails(tekst) {
  const lijst = String(tekst || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return lijst.length > 0 && lijst.every((m) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(m));
}

// Maakt van een rij uit n8n de waarden voor het scherm. Geheimen worden niet meegegeven.
function bouwWaarden(rij) {
  const waarden = {};
  for (const [veld, def] of BEWERKBAAR) {
    const w = rij[veld];
    if (def.type === 'schakelaar') waarden[veld] = w === true || w === 'true';
    else if (def.type === 'keuze') waarden[veld] = def.opties.some((o) => o.waarde === w) ? w : def.standaard;
    else if (def.type === 'getal') waarden[veld] = typeof w === 'number' ? w : (leeg(w) ? null : Number(w));
    else waarden[veld] = leeg(w) ? '' : String(w);
  }
  const groep = GROEPEN.find((g) => g.geheimen);
  const geheimen = {};
  for (const g of groep.geheimen) geheimen[g.veld] = !leeg(rij[g.veld]);
  return { waarden, geheimen };
}

// De controle voor livegang. kritiek: zonder dit werkt de klant niet.
function bouwControle({ rij, clientId, portaalStatus, portaalStatusIngesteld }) {
  if (!rij) {
    return [{ ok: false, kritiek: true, tekst: 'Geen rij gevonden in de Clients tabel in n8n. Maak die aan via de onboarding (stap 9).' }];
  }
  const waarden = bouwWaarden(rij);
  const w = waarden.waarden;
  const g = waarden.geheimen;
  const status = String(rij.status || '').trim().toLowerCase();
  const regels = [];
  const voeg = (ok, kritiek, tekstOk, tekstFout) => regels.push({ ok, kritiek, tekst: ok ? tekstOk : tekstFout });

  voeg(status === 'actief', true, 'Status in n8n is actief, de workflows draaien.', `Status in n8n is "${rij.status || 'leeg'}", dus de workflows draaien nog niet. Zet de Klantstatus hierboven op actief, de sync neemt dat binnen een uur over.`);
  if (portaalStatusIngesteld === false) {
    voeg(false, false, '', 'De Klantstatus hierboven is nog niet gekozen. Kies Actief, dan is het portaal de enige bron.');
  } else if (portaalStatus && status && portaalStatus !== status) {
    voeg(false, false, '', `De Klantstatus in het portaal (${portaalStatus}) wijkt af van n8n (${status}). De sync past n8n binnen een uur aan.`);
  }
  voeg(String(rij.portaal_slug || '').trim() === clientId, true, 'Portaal gekoppeld aan de Clients rij.', 'portaal_slug in de Clients rij is niet gelijk aan het Client ID van deze klant.');
  voeg(geldigeMails(w.notification_email), true, `Reviewmail gaat naar ${w.notification_email}.`, 'Geen geldig e-mailadres voor de reviewmail. Zonder dit wordt er geen mail verstuurd.');
  voeg(!leeg(w.contact_naam), false, `Aanhef: Beste ${w.contact_naam}.`, 'Geen contactnaam, de mail begint met de bedrijfsnaam.');
  voeg(typeof w.blogs_per_maand === 'number' && w.blogs_per_maand > 0, true, `${w.blogs_per_maand} blogs per maand.`, 'Blogs per maand is niet ingevuld.');
  voeg(!leeg(w.wp_url) && !leeg(w.wp_username) && g.wp_app_password, true, 'WordPress gegevens zijn ingevuld.', 'WordPress website, gebruikersnaam of applicatiewachtwoord ontbreekt.');
  voeg(g.notion_database_id && g.notion_token, true, 'Notion database en token zijn ingevuld.', 'Notion database of token ontbreekt in de Clients rij.');
  voeg(!leeg(w.taal), false, `Taal: ${w.taal}.`, 'Taal is niet ingevuld.');
  voeg(!leeg(w.doelgroep) && !leeg(w.tone_of_voice) && !leeg(w.diensten), false, 'Doelgroep, tone of voice en diensten zijn ingevuld.', 'Doelgroep, tone of voice of diensten ontbreekt, de blogs worden dan algemener.');
  if (w.ai_meting) {
    voeg(!leeg(w.ai_domein) && !leeg(w.ai_zoektermen), true, 'AI meting heeft een domein en zoektermen.', 'AI meting staat aan, maar domein of zoektermen ontbreekt.');
  }
  return regels;
}

function valideerVeld(veld, waarde) {
  const def = BEWERKBAAR.get(veld);
  if (!def) throw new Error(`Dit veld kan niet via het portaal worden aangepast: ${veld}`);
  if (def.type === 'schakelaar') return Boolean(waarde);
  if (def.type === 'keuze') {
    if (!def.opties.some((o) => o.waarde === waarde)) throw new Error(`Kies een geldige waarde voor ${def.label}.`);
    return waarde;
  }
  if (def.type === 'getal') {
    if (leeg(waarde)) return null;
    const n = Number(waarde);
    if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`${def.label} moet een geheel getal zijn.`);
    if (def.min !== undefined && n < def.min) throw new Error(`${def.label} moet minimaal ${def.min} zijn.`);
    if (def.max !== undefined && n > def.max) throw new Error(`${def.label} mag maximaal ${def.max} zijn.`);
    return n;
  }
  const tekst = String(waarde === undefined || waarde === null ? '' : waarde).trim();
  const max = def.type === 'lang' ? 4000 : 500;
  if (tekst.length > max) throw new Error(`${def.label} is te lang (maximaal ${max} tekens).`);
  if (veld === 'notification_email' && tekst && !geldigeMails(tekst)) throw new Error('Dit is geen geldig e-mailadres.');
  if (veld === 'wp_url' && tekst && !/^https?:\/\/[^\s/]+\.[^\s/]+/.test(tekst)) throw new Error('De website moet beginnen met https://.');
  return tekst;
}

async function leesGegevens({ clientId, naam, portaalStatus, portaalStatusIngesteld }) {
  const rij = await zoekRij(clientId, naam);
  const controle = bouwControle({ rij, clientId, portaalStatus, portaalStatusIngesteld });
  if (!rij) return { gevonden: false, groepen: GROEPEN, controle };
  const { waarden, geheimen } = bouwWaarden(rij);
  return {
    gevonden: true,
    rijNaam: rij.client_name,
    status: rij.status || '',
    groepen: GROEPEN,
    waarden,
    geheimen,
    controle
  };
}

async function bewaarVeld({ clientId, naam, veld, waarde }) {
  const schoon = valideerVeld(veld, waarde);
  const rij = await zoekRij(clientId, naam);
  if (!rij) throw new Error('Geen rij gevonden in de Clients tabel in n8n voor deze klant.');
  // Een lege tekst wordt een lege waarde, een leeg getal wordt null.
  await n8nClients('/rows/update', {
    method: 'PATCH',
    body: JSON.stringify({
      filter: { type: 'and', filters: [{ columnName: 'client_name', condition: 'eq', value: rij.client_name }] },
      data: { [veld]: schoon },
      returnData: false
    })
  });
  return { ok: true };
}

module.exports = {
  GROEPEN,
  zoekRij,
  leesGegevens,
  bewaarVeld,
  valideerVeld,
  bouwControle,
  bouwWaarden,
  geldigeMails,
  FAQ_MODI
};
