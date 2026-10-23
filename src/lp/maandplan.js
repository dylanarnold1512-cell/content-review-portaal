// Maandplan op de 1e (Pagr., 16-10-2026): voor klanten met de Pagr. module en een vast aantal pagina's per maand
// zet de server zelf een plan klaar. Dylan keurt het nog steeds goed. Hier staat de logica zonder Notion of AI.
const { onderwerpTekst } = require('./autoPagina');

// 'YYYY-MM' in de tijd van Amsterdam, zodat de 1e om middernacht Nederlandse tijd telt.
function huidigeMaand(nu = new Date()) {
  const delen = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit' }).formatToParts(nu);
  const jaar = delen.find((d) => d.type === 'year').value;
  const maand = delen.find((d) => d.type === 'month').value;
  return `${jaar}-${maand}`;
}

// 'YYYY-MM' van de maand erna.
function volgendeMaand(maand) {
  const [j, m] = String(maand).split('-').map(Number);
  return m === 12 ? `${j + 1}-01` : `${j}-${String(m + 1).padStart(2, '0')}`;
}

// Hoeveel pagina's zijn er in deze maand echt gemaakt? Pagina's met stand Idee (voorstellen die nog niet zijn goedgekeurd)
// tellen niet mee, ook niet als de AI ze vandaag heeft klaargezet.
function aantalDezeMaand(paginas, maand) {
  return (paginas || []).filter((p) => p && p.aangemaakt && p.status !== 'Idee' && huidigeMaand(new Date(p.aangemaakt)) === maand).length;
}

// Voor welke maand is een plan? Is het aantal pagina's van deze maand al gemaakt, dan is een plan voor de maand erna.
function planMaand(huidige, gemaakt, paginasPerMaand) {
  return Number(paginasPerMaand) > 0 && gemaakt >= Number(paginasPerMaand) ? volgendeMaand(huidige) : huidige;
}

function maandStart(maand) { return new Date(`${maand}-01T00:00:00+01:00`); }

// Moet er voor deze klant dit moment een plan komen?
function moetPlannen({ pagr, paginasPerMaand, planBestaat, gedaan }) {
  if (!pagr) return false;
  if (!(Number(paginasPerMaand) > 0)) return false;
  if (planBestaat || gedaan) return false;
  return true;
}

// Een pagina telt als onderdeel van het plan van deze maand als hij een plan heeft en deze maand is aangemaakt.
function isPlanVanMaand(page, maand) {
  const plan = page && page.invoer && page.invoer.plan;
  if (!plan) return false;
  if (plan.maand === maand) return true;
  if (plan.goedgekeurdOp && String(plan.goedgekeurdOp).startsWith(maand)) return true;
  return false;
}

// Invoer van een voorgesteld (nog niet goedgekeurd) plan.
function invoerVoorVoorgesteld(v, maand) {
  return {
    plaatsnaam: v.plaats || '',
    dienstFocus: v.dienst || '',
    onderwerp: v.titel,
    _watGaatDezePaginaOver: onderwerpTekst({ dienstFocus: v.dienst, plaatsnaam: v.plaats, plan: { reden: v.reden } }, v.titel),
    plan: { status: 'voorgesteld', maand, soort: v.soort || '', reden: v.reden || '', signaal: v.signaal == null ? null : v.signaal, volume: typeof v.volume === 'number' ? v.volume : null }
  };
}

const MAAND_NAMEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
function maandNaam(maand) {
  const m = Number(String(maand).split('-')[1]);
  return MAAND_NAMEN[m - 1] || maand;
}

module.exports = { huidigeMaand, volgendeMaand, aantalDezeMaand, planMaand, maandStart, moetPlannen, isPlanVanMaand, invoerVoorVoorgesteld, maandNaam };
