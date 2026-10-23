// Wat een klant ziet van zijn landingspagina's in het portaal (Pagr. stap 5, 14-10-2026).
// Geen goedkeuring door de klant: hij ziet welke pagina's er zijn, de stand en waarom een pagina gepland staat.
// Google en AI cijfers per pagina volgen in stap 6, tot die tijd staat er "nog niet gemeten".

const { standVan } = require('./standen');

// Pagina's uit Notion naar wat de klant mag zien. details: { [pageId]: invoer } voor pagina's met stand Gepland.
function maakKlantLijst(paginas, details = {}) {
  return (paginas || []).filter((p) => p && p.titel).map((p) => {
    const stand = standVan(p.status);
    const invoer = details[p.id] || {};
    const plan = invoer.plan || {};
    const vanKlant = plan.status === 'idee van klant';
    return {
      id: p.id,
      titel: p.titel,
      stand,
      vanKlant,
      reden: stand === 'Gepland' ? (vanKlant ? 'Jullie idee, wij beoordelen het.' : (plan.reden || '')) : '',
      schrijfOp: stand === 'Gepland' && plan.schrijfOp && !vanKlant ? plan.schrijfOp : '',
      url: stand === 'Live' && p.wpUrl ? p.wpUrl : '',
      liveDatum: stand === 'Live' ? (p.liveDatum || '') : '',
      bijgewerkt: p.laatstGewijzigd || ''
    };
  });
}

function telKerncijfers(lijst, nu = new Date()) {
  const maand = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}`;
  const live = lijst.filter((p) => p.stand === 'Live');
  return {
    live: live.length,
    gepland: lijst.filter((p) => p.stand === 'Gepland').length,
    inDeMaak: lijst.filter((p) => p.stand === 'In de maak' || p.stand === 'Ter controle').length,
    dezeMaandLive: live.filter((p) => String(p.liveDatum || p.bijgewerkt).startsWith(maand)).length
  };
}

module.exports = { maakKlantLijst, telKerncijfers };
