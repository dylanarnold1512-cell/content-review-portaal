// Welke feiten van een klant horen bij een pagina? Bij een NIEUWE pagina staan alle feiten van de klant vanzelf aan
// (elk feit heeft een bron), zodat niemand ze per pagina met de hand hoeft aan te vinken. Zodra de feitensheet van een
// pagina is opgeslagen telt alleen nog wat daarin staat (ook als dat minder is), zodat een keuze van Dylan altijd wint.
// Dezelfde regel staat in public/lp.js (renderFeitenList) voor wat het scherm toont.
function gebruikteFeitIds(feitensheet, feiten) {
  if (feitensheet && Array.isArray(feitensheet.gebruikt)) return feitensheet.gebruikt;
  return (Array.isArray(feiten) ? feiten : []).filter((f) => f && f.id && f.bron).map((f) => f.id);
}

module.exports = { gebruikteFeitIds };
