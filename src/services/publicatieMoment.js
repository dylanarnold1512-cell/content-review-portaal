// Wanneer gaat een goedgekeurde blog live? Dit is de enige plek in het portaal waar die regel staat (27-11-2026).
// De n8n Publicatie Sync plaatst elke blog met status Goedgekeurd bij zijn eerstvolgende ronde. De geplande
// publicatiedatum telt daarbij niet. Klanten dachten dat goedkeuren "prima, op de geplande dag" betekende,
// daarom staat het echte moment op de knop.
//   Gedeelde klanten en Basecamp Utrecht: elke dag om 11:00.
//   PPExport: elk heel uur.
//   Gedeelde klanten met publicatie_vertraging_uren: de eerste ronde die minstens zoveel uur na het goedkeuren valt.
// Verandert het schema van een Publicatie Sync, pas dan ook dit bestand aan.

const TIJDZONE = 'Europe/Amsterdam';
const UUR_VAN_PUBLICEREN = 11;
const ELK_UUR = ['ppe'];
const ZONDER_VERTRAGING = ['ppe', 'basecamp-utrecht'];
const UUR = 3600 * 1000;

const onderdelen = new Intl.DateTimeFormat('en-GB', { timeZone: TIJDZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

// De klok in Amsterdam op een bepaald moment.
function klok(datum) {
  const d = {};
  onderdelen.formatToParts(datum).forEach((p) => { if (p.type !== 'literal') d[p.type] = Number(p.value); });
  return { jaar: d.year, maand: d.month, dag: d.day, uur: d.hour, minuut: d.minute, seconde: d.second };
}

// Het tijdstip waarop het in Amsterdam op deze dag 11:00 is, ook rond zomer en wintertijd.
function omElfUur(jaar, maand, dag) {
  const gok = Date.UTC(jaar, maand - 1, dag, UUR_VAN_PUBLICEREN);
  const k = klok(new Date(gok));
  const verschil = Date.UTC(k.jaar, k.maand - 1, k.dag, k.uur, k.minuut, k.seconde) - gok;
  return new Date(gok - verschil);
}

// Eerste dagelijkse ronde op of na "vanaf" (en altijd na "nu").
function eersteDagRonde(nu, vanaf) {
  const k = klok(vanaf);
  for (let i = 0; i < 3; i += 1) {
    const dag = new Date(Date.UTC(k.jaar, k.maand - 1, k.dag + i));
    const ronde = omElfUur(dag.getUTCFullYear(), dag.getUTCMonth() + 1, dag.getUTCDate());
    if (ronde >= vanaf && ronde > nu) return ronde;
  }
  return null;
}

function dagNummer(datum) {
  const k = klok(datum);
  return Date.UTC(k.jaar, k.maand - 1, k.dag) / (24 * UUR);
}

// "vandaag om 11:00", "morgen om 11:00" of "maandag 30 november om 11:00".
function dagTekst(moment, nu) {
  const verschil = dagNummer(moment) - dagNummer(nu);
  const k = klok(moment);
  const tijd = String(k.uur).padStart(2, '0') + ':' + String(k.minuut).padStart(2, '0');
  if (verschil === 0) return 'vandaag om ' + tijd;
  if (verschil === 1) return 'morgen om ' + tijd;
  const weekdag = DAGEN[new Date(Date.UTC(k.jaar, k.maand - 1, k.dag)).getUTCDay()];
  return weekdag + ' ' + k.dag + ' ' + MAANDEN[k.maand - 1] + ' om ' + tijd;
}

// goedgekeurdOp is alleen nodig bij een blog die al is goedgekeurd en een klant met vertraging.
// Geeft { moment (ISO), tekst } terug.
function volgendePublicatie({ clientId, vertragingUren = 0, goedgekeurdOp = null, nu = new Date() }) {
  if (ELK_UUR.includes(clientId)) {
    const moment = new Date((Math.floor(nu.getTime() / UUR) + 1) * UUR);
    return { moment: moment.toISOString(), tekst: 'binnen een uur' };
  }
  const uren = ZONDER_VERTRAGING.includes(clientId) ? 0 : Math.max(0, Number(vertragingUren) || 0);
  const start = goedgekeurdOp && !Number.isNaN(Date.parse(goedgekeurdOp)) ? new Date(goedgekeurdOp) : nu;
  const vroegst = new Date(start.getTime() + uren * UUR);
  const moment = eersteDagRonde(nu, vroegst > nu ? vroegst : nu);
  return { moment: moment.toISOString(), tekst: dagTekst(moment, nu) };
}

module.exports = { volgendePublicatie, dagTekst };
