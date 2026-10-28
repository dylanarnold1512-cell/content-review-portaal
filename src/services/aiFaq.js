// FAQ voorstellen uit AI vragen (stap 2 van AI kansen).
//
// De n8n workflow "BA - AI FAQ Voorstel" maakt per week voorstellen in de data table ai_faq_voorstellen:
// een vraag waarbij AI het merk niet noemt, de pagina die erbij past en een antwoord dat alleen uit het
// kennisdocument of de pagina zelf komt. Dylan keurt ze hier goed of af.
//
// Toepassen:
// * Blogs en gewone pagina's: goedkeuren zet de status op "goedgekeurd". De n8n workflow "BA - AI FAQ Toepassen"
//   plaatst het FAQ blok dan veilig in WordPress (back up, modified controle, teruglezen).
// * Pagr. pagina's (pagina_type "pagr"): het portaal voegt de vraag toe aan de FAQ van de pagina in Pagr. zelf en
//   publiceert opnieuw. Zo verdwijnt de FAQ niet bij het opnieuw publiceren van de pagina.
//
// Statussen: voorstel, goedgekeurd, toegepast, afgewezen, staat_er_al, geen_bron, mislukt.

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');
const TABLE_ID = process.env.N8N_AI_FAQ_TABLE_ID || 'kPhlO5AWU6bOmTyo';

const MAX_VRAAG = 200;
const MAX_ANTWOORD = 700;
const MIN_ANTWOORD = 40;

function getApiKey() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error('N8N_API_KEY is niet gezet, dus het portaal kan niet bij de FAQ voorstellen in n8n.');
  return key;
}

async function n8nFaq(pad, options = {}) {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/data-tables/${TABLE_ID}${pad}`, {
    ...options,
    headers: { 'X-N8N-API-KEY': getApiKey(), 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (err) { /* geen JSON */ }
  if (!res.ok) throw new Error(`n8n FAQ tabel gaf een fout (${res.status}): ${data.message || raw || res.statusText}`);
  return data;
}

function filterOp(filters) {
  return encodeURIComponent(JSON.stringify({ type: 'and', filters }));
}

async function leesRijen(filters) {
  const alle = [];
  let cursor = '';
  for (let i = 0; i < 10; i += 1) {
    const data = await n8nFaq(`/rows?limit=250&filter=${filterOp(filters)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    alle.push(...(data.data || []));
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return alle;
}

function schoonTekst(tekst, max) {
  return String(tekst === undefined || tekst === null ? '' : tekst)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Controleert vraag en antwoord voordat ze worden opgeslagen of toegepast.
function valideerFaq({ vraag, antwoord }) {
  const v = schoonTekst(vraag, MAX_VRAAG + 1);
  const a = schoonTekst(antwoord, MAX_ANTWOORD + 1);
  if (!v) throw new Error('De vraag is leeg.');
  if (v.length > MAX_VRAAG) throw new Error(`De vraag is te lang (maximaal ${MAX_VRAAG} tekens).`);
  if (a.length < MIN_ANTWOORD) throw new Error(`Het antwoord is te kort (minimaal ${MIN_ANTWOORD} tekens).`);
  if (a.length > MAX_ANTWOORD) throw new Error(`Het antwoord is te lang (maximaal ${MAX_ANTWOORD} tekens).`);
  return { vraag: v, antwoord: a };
}

function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Het FAQ blok voor een blog of gewone pagina. Sjabloon per klant (Clients kolom faq_html_sjabloon) met {{vragen}}.
function bouwFaqHtml(items, sjabloon, id) {
  const lijst = (items || []).filter((i) => i && i.vraag && i.antwoord);
  const vragen = lijst.map((i) => `<details class="ai-faq-item"><summary>${esc(i.vraag)}</summary><p>${esc(i.antwoord)}</p></details>`).join('\n');
  const basis = String(sjabloon || '').includes('{{vragen}}')
    ? String(sjabloon).replace('{{vragen}}', vragen)
    : `<section class="ai-faq"><h2>Veelgestelde vragen</h2>\n${vragen}\n</section>`;
  return `<!-- ai-faq:${id || 'blok'} -->\n${basis}\n<!-- /ai-faq -->`;
}

function groepeerPerPagina(rijen) {
  const kaart = new Map();
  for (const r of rijen) {
    const sleutel = `${r.klant}|${r.pagina_url}`;
    if (!kaart.has(sleutel)) kaart.set(sleutel, { klant: r.klant, url: r.pagina_url, titel: r.pagina_titel, type: r.pagina_type, rijen: [] });
    kaart.get(sleutel).rijen.push(r);
  }
  return [...kaart.values()];
}

function normVraag(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Voegt vragen toe aan slotData.faqItems van een Pagr. pagina, zonder dubbele vragen en zonder de rest aan te raken.
// Heeft een vraag een veld "vervang" (de tekst van een bestaande vraag), dan komt de nieuwe vraag op die plek en gaat de
// oude eruit. Wordt de oude vraag niet gevonden, dan wordt de nieuwe vraag toegevoegd.
function voegFaqItemsToe(content, vragen) {
  const kopie = JSON.parse(JSON.stringify(content || {}));
  kopie.slotData = kopie.slotData || {};
  const items = Array.isArray(kopie.slotData.faqItems) ? kopie.slotData.faqItems : [];
  const nieuw = [];
  const vervangen = [];
  for (const v of vragen || []) {
    if (!v || !v.question || !v.answer) continue;
    const sleutel = normVraag(v.question);
    if (items.some((b) => normVraag(b.question) === sleutel) || nieuw.some((n) => normVraag(n.question) === sleutel)) continue;
    const plek = v.vervang ? items.findIndex((b) => normVraag(b.question) === normVraag(v.vervang)) : -1;
    if (plek >= 0) {
      vervangen.push({ vraag: items[plek].question, antwoord: items[plek].answer });
      items[plek] = { question: v.question, answer: v.answer };
    } else {
      nieuw.push({ question: v.question, answer: v.answer });
    }
  }
  kopie.slotData.faqItems = [...items, ...nieuw];
  return { content: kopie, toegevoegd: nieuw.length, vervangen };
}

function zelfdeUrl(a, b) {
  const n = (u) => String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[#?].*$/, '').replace(/\/+$/, '');
  return Boolean(n(a)) && n(a) === n(b);
}

async function lijstVoorstellen() {
  const [voorstellen, recent] = await Promise.all([
    leesRijen([{ columnName: 'status', condition: 'eq', value: 'voorstel' }]),
    leesRijen([{ columnName: 'status', condition: 'eq', value: 'toegepast' }])
  ]);
  const sorteer = (a, b) => String(b.aangemaakt || '').localeCompare(String(a.aangemaakt || ''));
  return {
    voorstellen: voorstellen.sort(sorteer),
    toegepast: recent.sort((a, b) => String(b.toegepast || '').localeCompare(String(a.toegepast || ''))).slice(0, 30)
  };
}

async function leesRij(id) {
  const rijen = await leesRijen([{ columnName: 'id', condition: 'eq', value: Number(id) }]);
  if (!rijen.length) throw new Error('Dit voorstel bestaat niet meer.');
  return rijen[0];
}

async function werkRijBij(id, data) {
  await n8nFaq('/rows/update', {
    method: 'PATCH',
    body: JSON.stringify({
      filter: { type: 'and', filters: [{ columnName: 'id', condition: 'eq', value: Number(id) }] },
      data,
      returnData: false
    })
  });
}

// Goedkeuren. voegToe is een functie voor Pagr. pagina's: ({ klant, url, vragen }) => Promise.
async function keurGoed({ id, vraag, antwoord, voegToe, nu = () => new Date().toISOString() }) {
  const rij = await leesRij(id);
  if (rij.status !== 'voorstel') throw new Error(`Dit voorstel staat al op "${rij.status}".`);
  const schoon = valideerFaq({ vraag: vraag === undefined ? rij.vraag : vraag, antwoord: antwoord === undefined ? rij.antwoord : antwoord });
  if (rij.pagina_type === 'pagr') {
    if (typeof voegToe !== 'function') throw new Error('Pagr. pagina\'s kunnen hier niet worden aangepast.');
    try {
      await voegToe({ klant: rij.klant, url: rij.pagina_url, vragen: [{ question: schoon.vraag, answer: schoon.antwoord, vervang: rij.vervangt_vraag || '' }] });
    } catch (err) {
      await werkRijBij(id, { vraag: schoon.vraag, antwoord: schoon.antwoord, status: 'voorstel', reden: `Toepassen in Pagr. mislukte: ${err.message}`.slice(0, 500) });
      throw err;
    }
    await werkRijBij(id, { vraag: schoon.vraag, antwoord: schoon.antwoord, status: 'toegepast', toegepast: nu(), reden: '' });
    return { status: 'toegepast' };
  }
  await werkRijBij(id, { vraag: schoon.vraag, antwoord: schoon.antwoord, status: 'goedgekeurd', reden: '' });
  return { status: 'goedgekeurd' };
}

async function wijsAf({ id, reden }) {
  const rij = await leesRij(id);
  if (rij.status !== 'voorstel') throw new Error(`Dit voorstel staat al op "${rij.status}".`);
  await werkRijBij(id, { status: 'afgewezen', reden: schoonTekst(reden, 300) });
  return { status: 'afgewezen' };
}

// Voor het klantportaal: de status per vraag van een klant. Alleen wat de klant mag zien, geen concepttekst.
function statusPerVraag(rijen) {
  const volgorde = { toegepast: 3, goedgekeurd: 2, voorstel: 1 };
  const uit = {};
  for (const r of rijen || []) {
    if (!volgorde[r.status]) continue;
    const huidig = uit[r.prompt_id];
    if (!huidig || volgorde[r.status] > volgorde[huidig.status]) uit[r.prompt_id] = { status: r.status, toegepast: r.toegepast || '' };
  }
  return uit;
}

module.exports = {
  TABLE_ID,
  leesRijen,
  lijstVoorstellen,
  keurGoed,
  wijsAf,
  valideerFaq,
  bouwFaqHtml,
  groepeerPerPagina,
  normVraag,
  voegFaqItemsToe,
  zelfdeUrl,
  statusPerVraag,
  schoonTekst
};
