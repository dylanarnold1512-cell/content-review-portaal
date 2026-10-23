// Klaar voor live (23-10-2026, Dylan): na het schrijven bepaalt de controle of een pagina schoon is.
// Schoon betekent: geen validatiefouten, geen openstaande redactiepunten (hij, wij-vorm, claims, lege koppen, enz.) en een
// uitgevoerd werk dat bij het onderwerp past. Een schone pagina krijgt de stand "Klaar voor live" en komt in de bulkknop.
// Automatisch live zetten is een schakelaar per klant (profile.autoLive) en werkt pas na AUTO_LIVE_MIN_LIVE live pagina's.

const AUTO_LIVE_MIN_LIVE = 5;
const STATUS_KLAAR = 'Klaar voor live';

// Bewijs (reviews of projecten die ontbreken) blokkeert niet: sommige klanten hebben dat gewoon niet.
function beslisKlaar({ contentLeeg, validatieFouten, punten, fitPunten }) {
  const redenen = [];
  if (contentLeeg) redenen.push('Er is nog geen tekst.');
  (validatieFouten || []).forEach((f) => redenen.push(String(f)));
  (punten || []).filter((p) => p && p.soort !== 'bewijs').forEach((p) => redenen.push(String(p.tekst || p)));
  (fitPunten || []).forEach((p) => redenen.push(String((p && p.tekst) || p)));
  return { klaar: redenen.length === 0, redenen };
}

// Mag deze klant automatisch live? Alleen met de schakelaar aan en genoeg live pagina's als bewijs dat het goed gaat.
function autoLiveToegestaan(profile, aantalLive) {
  return Boolean(profile && profile.autoLive === true && Number(aantalLive) >= AUTO_LIVE_MIN_LIVE);
}

// Mag het systeem het maandplan van deze klant zelf goedkeuren? Zelfde drempel als automatisch live: pas na genoeg live
// pagina's, als bewijs dat de plannen van deze klant goed zijn (Werkplaats fase 4, 23-10-2026).
function autoPlanToegestaan(profile, aantalLive) {
  return Boolean(profile && profile.autoPlan === true && Number(aantalLive) >= AUTO_LIVE_MIN_LIVE);
}

module.exports = { AUTO_LIVE_MIN_LIVE, STATUS_KLAAR, beslisKlaar, autoLiveToegestaan, autoPlanToegestaan };
