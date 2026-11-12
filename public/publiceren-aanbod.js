// Aanbod "automatisch publiceren" (12-11-2026): wanneer laten we de klant zien dat de keuze bestaat.
// Rekenregels op een rij, zonder scherm, zodat ze te testen zijn.
//   1. Het menu toont een label "Nieuw" zolang de klant het tabblad Publiceren nog niet opende
//      en automatisch publiceren nog uit staat.
//   2. Direct na het goedkeuren van een blog verschijnt een kort aanbod, maar pas als de klant
//      minstens 3 blogs heeft goedgekeurd of live heeft staan en het aanbod niet wegklikte.
(function () {
  const DREMPEL = 3;

  // Aantal blogs dat de klant heeft goedgekeurd of dat al live staat.
  function telGoedgekeurd(items, sv) {
    const goed = [sv && sv.approved, sv && sv.published].filter(Boolean);
    return (items || []).filter(function (i) { return goed.includes(i.status); }).length;
  }

  // standInfo: { beschikbaar, aan } uit /publiceren. weggeklikt: de klant klikte "Nu niet".
  function moetAanbodTonen(opties) {
    const o = opties || {};
    const stand = o.stand || {};
    if (!stand.beschikbaar || stand.aan) return false;
    if (o.weggeklikt) return false;
    return telGoedgekeurd(o.items, o.statusValues) >= (o.drempel || DREMPEL);
  }

  // Het label Nieuw staat in het menu tot de klant het tabblad opent, of als de klant het al aan heeft.
  function moetNieuwTonen(opties) {
    const o = opties || {};
    const stand = o.stand || {};
    return Boolean(stand.beschikbaar) && !stand.aan && !o.gezien;
  }

  const api = { DREMPEL, telGoedgekeurd, moetAanbodTonen, moetNieuwTonen };
  if (typeof window !== 'undefined') window.PubliceerAanbod = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
