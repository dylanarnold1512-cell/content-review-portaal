// Melding aan de klant als Dylan een door de klant aangedragen idee goedkeurt.
// De mail zelf wordt verstuurd door de n8n workflow "BA - Shared - Idee Ingepland Mail"
// (zoekt het mailadres van de klant op in de Clients tabel). Een mislukte melding mag
// het goedkeuren nooit blokkeren.

const N8N_BASE_URL = (process.env.N8N_BASE_URL || 'https://n8n.advertisr.nl').replace(/\/+$/, '');

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// '2027-03-02' wordt '2 maart 2027'. Onbekend of ongeldig geeft een lege tekst.
function datumNl(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const maand = MAANDEN[Number(m[2]) - 1];
  if (!maand) return '';
  return `${Number(m[3])} ${maand} ${m[1]}`;
}

function bouwPayload(config, clientId, item) {
  return {
    clientNaam: config.naam,
    portaalSlug: clientId,
    pageId: item.id,
    blogTitel: item.titel || '',
    publicatiedatum: item.publicatiedatum || '',
    publicatiedatumTekst: datumNl(item.publicatiedatum)
  };
}

async function stuurIdeeIngepland(config, clientId, item, fetchFn = fetch) {
  try {
    const res = await fetchFn(`${N8N_BASE_URL}/webhook/stuur-idee-ingepland`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bouwPayload(config, clientId, item)),
      signal: AbortSignal.timeout(15000)
    });
    return res.ok;
  } catch (err) {
    console.error('Melding idee ingepland mislukt:', err.message);
    return false;
  }
}

module.exports = { datumNl, bouwPayload, stuurIdeeIngepland };
