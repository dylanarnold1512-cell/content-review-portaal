// Planning en agenda (23-10-2026, Dylan): het systeem plant per klant welke pagina wanneer geschreven wordt en waarom, zonder
// dat Dylan het plan eerst hoeft goed te keuren. Dylan en de klant zien de agenda. Dylan controleert de geschreven pagina's.
// Hier staat de logica zonder Notion of AI. Een ingeplande pagina is stand Idee met plan.status 'ingepland' en plan.schrijfOp.

const DAG_MS = 24 * 60 * 60 * 1000;

// 'YYYY-MM-DD' in de tijd van Amsterdam.
function vandaagAms(nu = new Date()) {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu);
  return d;
}

function naarDatum(iso) { return new Date(`${iso}T12:00:00Z`); }
function naarIso(d) { return d.toISOString().slice(0, 10); }
function werkdag(d) { const x = new Date(d.getTime()); while (x.getUTCDay() === 0 || x.getUTCDay() === 6) x.setTime(x.getTime() + DAG_MS); return x; }

// Spreid n pagina's over de werkdagen van een maand ('YYYY-MM'), vanaf vandaag of de 1e. De laatste datum is uiterlijk de 25e,
// zodat er tijd is om te controleren. Is de maand bijna om, dan komen er meerdere op dezelfde dag.
function schrijfDatums(n, maand, vandaag) {
  const aantal = Number(n) || 0;
  if (aantal <= 0) return [];
  const eerste = `${maand}-01`;
  const begin = vandaag && vandaag > eerste ? vandaag : eerste;
  const einde = `${maand}-25`;
  const start = naarDatum(begin);
  const stop = naarDatum(einde < begin ? begin : einde);
  const span = Math.max(0, Math.round((stop - start) / DAG_MS));
  const uit = [];
  for (let i = 0; i < aantal; i += 1) {
    const dag = Math.round(((i + 0.5) * span) / aantal);
    let d = werkdag(new Date(start.getTime() + dag * DAG_MS));
    // Nooit twee op dezelfde dag als dat te vermijden is: schuif naar de eerstvolgende werkdag na de vorige.
    if (uit.length && naarIso(d) <= uit[uit.length - 1]) d = werkdag(new Date(naarDatum(uit[uit.length - 1]).getTime() + DAG_MS));
    uit.push(naarIso(d));
  }
  return uit;
}

// Moet het systeem deze pagina nu gaan schrijven?
function isRijp(plan, vandaag) {
  return Boolean(plan && plan.status === 'ingepland' && plan.schrijfOp && String(plan.schrijfOp) <= String(vandaag));
}

// Zelfstandig plannen is de standaard. Alleen een klant met autoPlan op false laat Dylan het plan eerst goedkeuren.
function planZelfstandig(profile) {
  return !(profile && profile.autoPlan === false);
}

// De agenda: pagina's met een plan, op datum. paginas: [{ id, titel, status, stand, invoer }]. Zonder datum komen ze achteraan.
function bouwPlanning(paginas) {
  return (paginas || []).map((p) => {
    const plan = (p.invoer && p.invoer.plan) || {};
    if (!plan.status && !plan.schrijfOp) return null;
    if (plan.status === 'idee van klant') return { id: p.id, titel: p.titel, reden: plan.toelichting || '', schrijfOp: '', stand: p.stand, vanKlant: true, wacht: true };
    return { id: p.id, titel: p.titel, reden: plan.reden || '', schrijfOp: plan.schrijfOp || '', maand: plan.maand || '', stand: p.stand, wacht: plan.status === 'voorgesteld', volume: typeof plan.volume === 'number' ? plan.volume : null };
  }).filter(Boolean).sort((a, b) => (a.schrijfOp || '9999').localeCompare(b.schrijfOp || '9999'));
}

module.exports = { vandaagAms, schrijfDatums, isRijp, planZelfstandig, bouwPlanning };
