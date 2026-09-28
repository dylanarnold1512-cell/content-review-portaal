// Welke feiten van een klant horen bij een pagina? Een feit met standaard: true (bv. inchecktijden,
// kamertypes) staat bij een NIEUWE pagina automatisch aan, zodat dit niet bij elke pagina opnieuw
// met de hand aangevinkt hoeft te worden. Zodra de feitensheet van een pagina is opgeslagen telt
// alleen nog wat daarin staat (ook als dat minder is), zodat een keuze van Dylan altijd wint.
// Dezelfde regel staat in public/lp.js (renderFeitenList) voor wat het scherm toont.
function gebruikteFeitIds(feitensheet, feiten) {
  if (feitensheet && Array.isArray(feitensheet.gebruikt)) return feitensheet.gebruikt;
  return (Array.isArray(feiten) ? feiten : []).filter((f) => f && f.standaard).map((f) => f.id);
}

module.exports = { gebruikteFeitIds };
