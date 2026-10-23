// Welke geplande pagina's neemt de bulkknop mee (Pagr. Werkplaats fase 1, 23-10-2026). Alleen pagina's die Dylan
// zelf maakte of die al zijn goedgekeurd. Een voorstel van de AI (plan.status 'voorgesteld') of een idee van de klant
// wacht nog op Dylan en krijgt dus nog geen tekst.
const WACHT_OP_BESLUIT = ['voorgesteld', 'idee van klant'];

function isBulkKandidaat(planStatus) {
  return !WACHT_OP_BESLUIT.includes(planStatus);
}

module.exports = { isBulkKandidaat, WACHT_OP_BESLUIT };
