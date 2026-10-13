// Rekenlaag van het Blogs-tabblad (Fase 7 stap 3): welke blogs bij welk filter horen, hoe de lijst per maand
// wordt gegroepeerd en welke kleur een status krijgt. Los van het scherm zodat het getest kan worden.
(function () {
  const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const dag = (iso) => String(iso || '').slice(0, 10);
  const geldig = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);

  // Vier filters voor de klant: Alles, Wacht op jou, Gepland, Live. "Afgewezen" blijft bij Gepland, want de blog wordt herschreven.
  function groepVan(item, sv) {
    if (!item || !sv) return 'gepland';
    if (item.status === sv.published) return 'live';
    if (item.status === sv.review) return 'wacht';
    return 'gepland';
  }

  function pastBijFilter(item, filter, sv) {
    if (!filter || filter === 'alle') return true;
    if (['wacht', 'gepland', 'live'].includes(filter)) return groepVan(item, sv) === filter;
    return item.status === filter; // oude waarde: een exacte status
  }

  function telPerFilter(items, sv) {
    const t = { alle: 0, wacht: 0, gepland: 0, live: 0 };
    (items || []).forEach((i) => { t.alle += 1; t[groepVan(i, sv)] += 1; });
    return t;
  }

  function toonVan(status, sv) {
    if (!sv) return 'neutraal';
    if (status === sv.published) return 'goed';
    if (status === sv.review) return 'let-op';
    if (status === sv.rejected) return 'fout';
    if (status === sv.idea) return 'neutraal';
    return 'plan';
  }

  function maandSleutel(d) { return d.slice(0, 7); }
  function maandLabel(sleutel) {
    const [j, m] = sleutel.split('-').map(Number);
    return MAANDEN[m - 1] + ' ' + j;
  }

  // sorteer: 'komend' (standaard: vanaf deze maand vooruit, daarna het verleden terug), 'nieuw' of 'oud'.
  function groepeerPerMaand(items, sorteer, vandaagIso) {
    const vandaag = dag(vandaagIso);
    const huidige = geldig(vandaag) ? maandSleutel(vandaag) : '';
    const metDatum = [];
    const zonder = [];
    (items || []).forEach((i) => (geldig(dag(i.publicatiedatum)) ? metDatum : zonder).push(i));
    const perMaand = new Map();
    metDatum.forEach((i) => {
      const k = maandSleutel(dag(i.publicatiedatum));
      if (!perMaand.has(k)) perMaand.set(k, []);
      perMaand.get(k).push(i);
    });
    const sleutels = [...perMaand.keys()].sort();
    let volgorde;
    if (sorteer === 'oud') volgorde = sleutels;
    else if (sorteer === 'nieuw') volgorde = sleutels.slice().reverse();
    else volgorde = [...sleutels.filter((k) => k >= huidige), ...sleutels.filter((k) => k < huidige).reverse()];
    const oplopend = sorteer === 'oud' || sorteer === 'komend';
    const groepen = volgorde.map((k) => {
      const lijst = perMaand.get(k).slice().sort((a, b) => (dag(a.publicatiedatum) < dag(b.publicatiedatum) ? -1 : dag(a.publicatiedatum) > dag(b.publicatiedatum) ? 1 : 0));
      const verleden = huidige && k < huidige;
      const items2 = sorteer === 'komend' && verleden ? lijst.slice().reverse() : (oplopend ? lijst : lijst.slice().reverse());
      return { sleutel: k, label: maandLabel(k), items: items2 };
    });
    if (zonder.length) groepen.push({ sleutel: 'zonder', label: 'Nog geen datum', items: zonder });
    return groepen;
  }

  const api = { groepVan, pastBijFilter, telPerFilter, toonVan, groepeerPerMaand, maandLabel };
  if (typeof window !== 'undefined') window.BlogsModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
