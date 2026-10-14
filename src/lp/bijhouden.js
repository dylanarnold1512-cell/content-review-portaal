// Updatevoorstellen per maand (Pagr. stap 6, 14-10-2026). Regelgebaseerd op de meting per pagina: dus uitlegbaar en
// goedkoop. Elke regel zegt in gewone woorden wat er aan de hand is en wat de volgende stap is.

const DAG_MS = 24 * 60 * 60 * 1000;

function dagenLive(p, nu) {
  const d = new Date(p.liveDatum || p.bijgewerkt || nu);
  return Math.floor((nu - d) / DAG_MS);
}

// paginas: lijst uit verrijkMetMeting (stand, titel, google, ai). Geeft voorstellen, belangrijkste eerst.
function maakUpdateVoorstellen(paginas, { nu = new Date(), aiBeschikbaar = false } = {}) {
  const uit = [];
  (paginas || []).filter((p) => p.stand === 'Live').forEach((p) => {
    const g = p.google;
    const dagen = dagenLive(p, nu);
    if (g && dagen >= 28 && g.vertoningen < 10) {
      uit.push({ paginaId: p.id, titel: p.titel, soort: 'niet-gevonden', prioriteit: 1,
        reden: `Staat ${dagen} dagen live maar kreeg maar ${g.vertoningen} vertoningen in Google.`,
        actie: 'Controleer of de pagina geindexeerd is, maak de titel specifieker en link ernaar vanaf andere pagina\'s.' });
    } else if (g && g.positie != null && g.positie > 7 && g.positie <= 20 && g.vertoningen >= 50) {
      uit.push({ paginaId: p.id, titel: p.titel, soort: 'bijna-pagina-1', prioriteit: 2,
        reden: `Gemiddelde positie ${g.positie} bij ${g.vertoningen} vertoningen. Dit is vlak onder de eerste pagina.`,
        actie: 'Vul de veelgestelde vragen aan met nieuwe zoekvragen en breid de tekst uit waar de pagina dun is.' });
    }
    if (g && g.trend === 'zakt') {
      uit.push({ paginaId: p.id, titel: p.titel, soort: 'zakt', prioriteit: 1,
        reden: `Klikken zakten van ${g.vorigeKlikken} naar ${g.klikken} ten opzichte van de periode ervoor.`,
        actie: 'Bekijk of een concurrent erbij kwam en ververs de pagina met actuele informatie.' });
    }
    if (aiBeschikbaar && p.ai && p.ai.geciteerd === 0 && dagen >= 28) {
      uit.push({ paginaId: p.id, titel: p.titel, soort: 'ai-noemt-niet', prioriteit: 3,
        reden: 'AI assistenten noemen deze pagina niet als bron.',
        actie: 'Zet de antwoorden op de belangrijkste vragen bovenaan de pagina en maak de FAQ concreet, met eigen cijfers en bronnen.' });
    }
  });
  return uit.sort((a, b) => a.prioriteit - b.prioriteit);
}

module.exports = { maakUpdateVoorstellen, dagenLive };
