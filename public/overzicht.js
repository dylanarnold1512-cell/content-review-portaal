// Overzicht-tabblad: de startpagina van het portaal. Toont in één oogopslag wat
// aandacht vraagt (blogs die wachten op review), hoeveel ideeën er liggen en de
// planning van de komende blogs per maand. Gebruikt alleen de blogs die het
// portaal al heeft geladen, dus er is geen extra aanroep nodig.
// De berekening (maakOverzicht) staat los van het scherm zodat ze getest kan worden.
(function () {
  const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

  function leesDatum(iso) {
    if (!iso) return null;
    const d = String(iso).includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function dagStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function maakOverzicht(items, statusValues, nu) {
    const lijst = Array.isArray(items) ? items : [];
    const vandaag = dagStart(nu || new Date());
    const grens30 = new Date(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate() - 30);
    const review = lijst.filter((i) => i.status === statusValues.review);
    const ideeen = lijst.filter((i) => i.status === statusValues.idea);
    const gepubliceerd30d = lijst.filter((i) => {
      if (i.status !== statusValues.published) return false;
      const d = leesDatum(i.publicatiedatum);
      return d && d >= grens30 && d <= new Date(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate(), 23, 59, 59);
    }).length;

    // Planning: geplande blogs, ideeën en goedgekeurde blogs die nog niet live zijn, op datum.
    // Blogs die op review wachten staan al in hun eigen blok erboven.
    const komend = lijst.filter((i) => [statusValues.planned, statusValues.generating, statusValues.idea, statusValues.approved].filter(Boolean).includes(i.status));
    const metDatum = komend
      .map((i) => ({ item: i, datum: leesDatum(i.publicatiedatum) }))
      .filter((x) => x.datum && dagStart(x.datum) >= vandaag)
      .sort((a, b) => a.datum - b.datum);
    const zonderDatum = komend.filter((i) => !leesDatum(i.publicatiedatum));

    const perMaand = [];
    metDatum.forEach((x) => {
      const sleutel = x.datum.getFullYear() + '-' + String(x.datum.getMonth() + 1).padStart(2, '0');
      let groep = perMaand.find((g) => g.sleutel === sleutel);
      if (!groep) {
        groep = { sleutel, label: MAANDEN[x.datum.getMonth()] + ' ' + x.datum.getFullYear(), items: [] };
        perMaand.push(groep);
      }
      groep.items.push(x.item);
    });

    return {
      review,
      aantalIdeeen: ideeen.length,
      aantalGepland: metDatum.length,
      gepubliceerd30d,
      perMaand,
      zonderDatum
    };
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function datumKort(iso) {
    const d = leesDatum(iso);
    return d ? d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '';
  }

  function rij(item, badgeKlasse) {
    return `
      <button type="button" class="ov-rij" data-id="${esc(item.id)}">
        <span class="ov-rij-titel">${esc(item.titel || '(geen titel)')}</span>
        <span class="ov-rij-meta">${esc(datumKort(item.publicatiedatum))}</span>
        <span class="badge ${badgeKlasse(item.status)}">${esc(item.status || '')}</span>
      </button>`;
  }

  function renderOverzicht(state, badgeKlasse, openBlog) {
    const doel = document.getElementById('overzichtTab');
    if (!doel) return;
    const o = maakOverzicht(state.items, state.statusValues, new Date());
    const toonReview = state.reviewEnabled;
    const reviewBlok = toonReview
      ? `
      <section class="ov-sectie">
        <h2 class="ov-kop">Wacht op jouw beoordeling</h2>
        ${o.review.length
          ? `<div class="ov-lijst">${o.review.map((i) => rij(i, badgeKlasse)).join('')}</div>`
          : '<p class="ov-leeg">Alles is beoordeeld. Er wacht niets op jou.</p>'}
      </section>`
      : '';
    const planningBlok = `
      <section class="ov-sectie">
        <h2 class="ov-kop">Planning</h2>
        ${o.perMaand.length || o.zonderDatum.length
          ? o.perMaand.map((g) => `
            <h3 class="ov-maand">${esc(g.label)}</h3>
            <div class="ov-lijst">${g.items.map((i) => rij(i, badgeKlasse)).join('')}</div>`).join('') +
            (o.zonderDatum.length
              ? `<h3 class="ov-maand">Nog geen datum</h3><div class="ov-lijst">${o.zonderDatum.map((i) => rij(i, badgeKlasse)).join('')}</div>`
              : '')
          : '<p class="ov-leeg">Er staan nog geen blogs gepland.</p>'}
      </section>`;
    doel.innerHTML = `
      <div class="ov-kaarten">
        ${toonReview ? `<div class="ov-kaart ${o.review.length ? 'ov-kaart-aandacht' : ''}"><div class="ov-getal">${o.review.length}</div><div class="ov-label">Wachten op jouw review</div></div>` : ''}
        <div class="ov-kaart"><div class="ov-getal">${o.aantalGepland}</div><div class="ov-label">Gepland</div></div>
        <div class="ov-kaart"><div class="ov-getal">${o.aantalIdeeen}</div><div class="ov-label">Ideeën</div></div>
        <div class="ov-kaart"><div class="ov-getal">${o.gepubliceerd30d}</div><div class="ov-label">Gepubliceerd, laatste 30 dagen</div></div>
      </div>
      ${reviewBlok}
      ${planningBlok}`;
    doel.querySelectorAll('.ov-rij').forEach((knop) => {
      knop.addEventListener('click', () => openBlog(knop.dataset.id));
    });
  }

  if (typeof window !== 'undefined') window.renderOverzicht = renderOverzicht;
  if (typeof module !== 'undefined' && module.exports) module.exports = { maakOverzicht };
})();
