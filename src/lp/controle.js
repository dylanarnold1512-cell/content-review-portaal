// Vertaalt de uitkomst van de validatie naar punten met een oplossing, voor het controlescherm (Pagr., 16-10-2026).
// Blokkerende fouten staan apart van aandachtspunten. De oplossing zegt welke knop er bij hoort.
const OPLOSSINGEN = [
  { re: /heeft geen inhoud en wordt niet gepubliceerd/i, soort: 'info', knop: null },
  { re: /meta (title|description)/i, soort: 'opnieuw', knop: 'Laat de AI de tekst opnieuw schrijven' },
  { re: /verplichte (lijst-)?slot|slot "heroTitle"|cta is verplicht/i, soort: 'opnieuw', knop: 'Laat de AI de tekst opnieuw schrijven' },
  { re: /interne links|links naar zusterpagina|interne link/i, soort: 'opnieuw', knop: 'Laat de AI de tekst opnieuw schrijven' }
];

function oplossingVoor(tekst) {
  const gevonden = OPLOSSINGEN.find((o) => o.re.test(tekst));
  return gevonden ? { soort: gevonden.soort, knop: gevonden.knop } : { soort: 'info', knop: null };
}

function maakControle(validatie, opties) {
  const v = validatie || {};
  const fouten = (v.errors || []).map((tekst) => ({ tekst, ...oplossingVoor(tekst) }));
  const letOp = (v.warnings || []).map((tekst) => ({ tekst, ...oplossingVoor(tekst) }));
  const aantalChecks = (opties && opties.aantalChecks) || 0;
  const klaar = fouten.length === 0;
  return {
    ok: klaar,
    fouten,
    letOp,
    samenvatting: klaar
      ? (letOp.length ? `Geen fouten, ${letOp.length} ${letOp.length === 1 ? 'aandachtspunt' : 'aandachtspunten'}. Je kunt hem live zetten.` : 'Alles is in orde. Je kunt hem live zetten.')
      : `${fouten.length} ${fouten.length === 1 ? 'fout blokkeert' : 'fouten blokkeren'} het live zetten.`,
    aantalChecks
  };
}

module.exports = { maakControle, oplossingVoor };
