// Vertaalt de uitkomst van de validatie naar punten met een oplossing, voor het controlescherm (Pagr., 16-10-2026).
// Blokkerende fouten staan apart van aandachtspunten. De oplossing zegt welke knop er bij hoort.
const OPLOSSINGEN = [
  { re: /heeft geen inhoud en wordt niet gepubliceerd/i, soort: 'info', knop: null },
  { re: /meta (title|description)/i, soort: 'opnieuw', knop: 'Laat de AI de tekst opnieuw schrijven' },
  { re: /verplichte (lijst-)?slot|slot "heroTitle"|cta is verplicht/i, soort: 'opnieuw', knop: 'Laat de AI de tekst opnieuw schrijven' },
  { re: /veelgestelde vraag .* lijkt sterk op/i, soort: 'opnieuw', knop: 'Schrijf opnieuw met andere vragen' },
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
  // Extra punten met een eigen oplossing (acties), bijvoorbeeld "verberg deze sectie". Altijd aandachtspunten.
  ((opties && opties.extraPunten) || []).forEach((p) => letOp.push({ tekst: p.tekst, soort: 'info', knop: null, acties: p.acties || [], sectieIndex: p.sectieIndex == null ? null : p.sectieIndex }));
  const klaar = fouten.length === 0;
  return {
    ok: klaar,
    fouten,
    letOp,
    samenvatting: klaar
      ? (letOp.length ? `Geen fouten, ${letOp.length} ${letOp.length === 1 ? 'aandachtspunt' : 'aandachtspunten'}. Je kunt hem live zetten.` : 'Alles is in orde. Je kunt hem live zetten.')
      : `${fouten.length} ${fouten.length === 1 ? 'fout blokkeert' : 'fouten blokkeren'} het live zetten.`,
    aantalChecks,
    inOrde: (opties && opties.inOrde) || []
  };
}

// Wat in orde is, als korte zinnen. Alleen wat we echt gecontroleerd hebben: niet in de fouten of aandachtspunten.
function inOrdePunten({ content, validatie, zusterAantal, gelijkenisGemeld }) {
  const alles = [...((validatie && validatie.errors) || []), ...((validatie && validatie.warnings) || [])].join(' ');
  const slotData = (content && content.slotData) || {};
  const uit = [];
  if (slotData.metaTitle && slotData.metaDescription && !/meta (title|description)/i.test(alles)) uit.push('SEO titel en beschrijving staan er en hebben de goede lengte');
  const links = Array.isArray(slotData.linksItems) ? slotData.linksItems.length : 0;
  if (links && !/interne link/i.test(alles)) uit.push(`${links} interne ${links === 1 ? 'link' : 'links'}, allemaal met een reden`);
  const faq = Array.isArray(slotData.faqItems) ? slotData.faqItems.length : 0;
  if (faq && !/veelgestelde vraag/i.test(alles)) uit.push(`${faq} veelgestelde vragen, geen kopie van een zusterpagina`);
  if (zusterAantal && !gelijkenisGemeld) uit.push('De tekst lijkt niet op die van de zusterpagina\'s');
  if (!/verplicht|ontbreekt/i.test(alles)) uit.push('Alle verplichte onderdelen van het sjabloon zijn ingevuld');
  return uit;
}

module.exports = { maakControle, oplossingVoor, inOrdePunten };
