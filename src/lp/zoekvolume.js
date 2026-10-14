// Echt zoekvolume voor het plan (Pagr., 14-10-2026), via DataForSEO (Google Ads zoekvolume, Nederland, Nederlands).
// Voorkeursroute: een n8n webhook (env N8N_VOLUME_WEBHOOK_URL). De inlog van DataForSEO blijft dan in n8n en n8n houdt
// een cache bij, zodat dezelfde zoekterm niet steeds opnieuw geld kost. De webhook krijgt { termen: [...] } en geeft
// { volumes: { term: aantal } } terug.
// Reserve: direct naar DataForSEO als DATAFORSEO_LOGIN en DATAFORSEO_PASSWORD op de server staan.
// Zonder een van beide geeft dit lege waarden terug en werkt het plan door met alleen het Google suggestie signaal.
// Nooit blokkerend.

const URL_VOLUME = 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live';
const LOCATIE_NL = 2528;

function webhookUrl() {
  return String(process.env.N8N_VOLUME_WEBHOOK_URL || '').trim();
}

function beschikbaar() {
  return Boolean(webhookUrl() || (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD));
}

function zoekterm(v) {
  return [v.dienst, v.plaats].filter(Boolean).join(' ').trim().toLowerCase();
}

async function haalViaWebhook(termen, { fetchImpl } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await (fetchImpl || fetch)(webhookUrl(), {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ termen })
    });
    if (!res.ok) return {};
    const data = JSON.parse(await res.text());
    const uit = {};
    Object.entries((data && data.volumes) || {}).forEach(([term, v]) => {
      if (typeof v === 'number') uit[String(term).toLowerCase()] = v;
    });
    return uit;
  } catch (err) {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

// Geeft { [zoekterm]: maandelijks volume } terug. Leeg object bij een fout of zonder inloggegevens.
async function haalVolumes(termen, { fetchImpl } = {}) {
  const uniek = [...new Set((termen || []).map((t) => String(t || '').trim().toLowerCase()).filter(Boolean))].slice(0, 100);
  if (!uniek.length || !beschikbaar()) return {};
  if (webhookUrl()) return haalViaWebhook(uniek, { fetchImpl });
  const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await (fetchImpl || fetch)(URL_VOLUME, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ keywords: uniek, location_code: LOCATIE_NL, language_code: 'nl' }])
    });
    if (!res.ok) return {};
    const data = JSON.parse(await res.text());
    const rijen = (((data || {}).tasks || [])[0] || {}).result || [];
    const uit = {};
    rijen.forEach((r) => {
      if (r && r.keyword) uit[String(r.keyword).toLowerCase()] = typeof r.search_volume === 'number' ? r.search_volume : 0;
    });
    return uit;
  } catch (err) {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

// Voegt volume toe aan voorstellen. volume is null als het niet gemeten kon worden.
async function voegVolumeToe(voorstellen, opties) {
  const volumes = await haalVolumes((voorstellen || []).map(zoekterm), opties);
  return (voorstellen || []).map((v) => {
    const t = zoekterm(v);
    return { ...v, volume: t && Object.prototype.hasOwnProperty.call(volumes, t) ? volumes[t] : null };
  });
}

module.exports = { beschikbaar, haalVolumes, voegVolumeToe, zoekterm };
