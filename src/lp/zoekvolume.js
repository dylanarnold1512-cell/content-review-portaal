// Echt zoekvolume voor het plan (Pagr., 14-10-2026), via DataForSEO (Google Ads zoekvolume, Nederland, Nederlands).
// Alleen actief als DATAFORSEO_LOGIN en DATAFORSEO_PASSWORD op de server staan. Anders geeft dit lege waarden terug en
// werkt het plan gewoon door met alleen het Google suggestie signaal. Nooit blokkerend.

const URL_VOLUME = 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live';
const LOCATIE_NL = 2528;

function beschikbaar() {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

function zoekterm(v) {
  return [v.dienst, v.plaats].filter(Boolean).join(' ').trim().toLowerCase();
}

// Geeft { [zoekterm]: maandelijks volume } terug. Leeg object bij een fout of zonder inloggegevens.
async function haalVolumes(termen, { fetchImpl } = {}) {
  const uniek = [...new Set((termen || []).map((t) => String(t || '').trim().toLowerCase()).filter(Boolean))].slice(0, 100);
  if (!uniek.length || !beschikbaar()) return {};
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
