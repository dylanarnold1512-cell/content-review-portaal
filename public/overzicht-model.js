// Rekenlaag van het nieuwe Overzicht (Fase 7 stap 2). Geen scherm, geen aanroepen: alleen invoer erin, een
// beschrijving van het startscherm eruit, zodat elke stand getest kan worden.
//
// Invoer: { items, statusValues, reviewEnabled, google, ai, merk, kennis }
// Elke bron (google, ai, merk, kennis) heeft de vorm { status: 'ok' | 'uit' | 'fout', data, stand }.
//   ok   = gegevens zijn er, uit = deze klant heeft dit niet, fout = ophalen mislukt (stand = laatst bekende gegevens).
(function () {
  const dagTekst = (iso) => String(iso || '').slice(0, 10);

  function dagenTot(naar, vanaf) {
    const a = Date.UTC(+naar.slice(0, 4), +naar.slice(5, 7) - 1, +naar.slice(8, 10));
    const b = Date.UTC(+vanaf.slice(0, 4), +vanaf.slice(5, 7) - 1, +vanaf.slice(8, 10));
    return Math.round((a - b) / 86400000);
  }

  const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const kortDatum = (d) => Number(d.slice(8, 10)) + ' ' + MAANDEN_KORT[Number(d.slice(5, 7)) - 1];
  const geldig = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);

  function bronData(bron) {
    if (!bron) return { status: 'uit', data: null, oud: false };
    if (bron.status === 'ok') return { status: 'ok', data: bron.data || null, oud: false };
    if (bron.status === 'fout') return { status: bron.stand ? 'ok' : 'fout', data: bron.stand || null, oud: Boolean(bron.stand) };
    return { status: 'uit', data: null, oud: false };
  }

  function bouwStartscherm(inv, vandaagIso) {
    const vandaag = dagTekst(vandaagIso || new Date().toISOString());
    const sv = (inv && inv.statusValues) || {};
    const items = Array.isArray(inv && inv.items) ? inv.items.filter(Boolean) : [];

    const review = inv && inv.reviewEnabled ? items.filter((i) => sv.review && i.status === sv.review) : [];
    const live = items.filter((i) => sv.published && i.status === sv.published);
    const nogTeGaan = [sv.planned, sv.generating, sv.approved, sv.idea].filter(Boolean);
    const gepland = items.filter((i) => nogTeGaan.includes(i.status));

    const komend = gepland
      .map((i) => ({ item: i, datum: dagTekst(i.publicatiedatum) }))
      .filter((x) => geldig(x.datum) && x.datum >= vandaag)
      .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0))
      .map((x) => ({ id: x.item.id, titel: x.item.titel || '(geen titel)', datum: x.datum, dagen: dagenTot(x.datum, vandaag), status: x.item.status, cluster: x.item.cluster || '' }));
    const zonderDatum = gepland.filter((i) => !geldig(dagTekst(i.publicatiedatum))).length;

    const g = bronData(inv && inv.google);
    const a = bronData(inv && inv.ai);
    const m = bronData(inv && inv.merk);
    const k = bronData(inv && inv.kennis);

    // Google
    let google = { status: g.status, oud: g.oud };
    const googleBlogs = g.status === 'ok' && g.data && Array.isArray(g.data.blogs) ? g.data.blogs : [];
    if (g.status === 'ok' && g.data && g.data.totalen) {
      const t = g.data.totalen;
      const alle = (g.data.weken || []).slice(-10);
      google = {
        status: 'ok',
        oud: g.oud,
        bijgewerkt: g.data.laatstBijgewerkt || null,
        vertoningen: t.vertoningen,
        vertoningenVorig: t.vertoningenVorig,
        clicks: t.clicks,
        clicksVorig: t.clicksVorig,
        blogsGetoond: t.blogsGetoond || 0,
        blogsGemeten: t.blogsGemeten || 0,
        weken: alle.map((w) => ({ start: w.start, vertoningen: w.vertoningen, clicks: w.clicks || 0, open: !w.volledig, nieuw: (w.nieuw || []).length })),
        heeftData: (t.vertoningen || 0) > 0 || (t.clicks || 0) > 0 || alle.some((w) => w.vertoningen > 0)
      };
    } else if (g.status === 'ok') {
      google = { status: 'ok', oud: g.oud, heeftData: false, weken: [] };
    }

    // AI: aandeel antwoorden waarin de klant genoemd wordt, alle platformen samen.
    let ai = { status: a.status, oud: a.oud };
    if (a.status === 'ok' && a.data && a.data.beschikbaar !== false) {
      if (a.data.status === 'ok' && Array.isArray(a.data.platformen)) {
        const antw = a.data.platformen.reduce((t, p) => t + (p.antwoorden || 0), 0);
        const gen = a.data.platformen.reduce((t, p) => t + (p.genoemd || 0), 0);
        const percentage = antw ? Math.round((gen / antw) * 100) : null;
        let vorigPercentage = null;
        const trend = a.data.trend || [];
        if (trend.length >= 2) {
          const vw = trend[trend.length - 2].platformen || {};
          const vA = Object.keys(vw).reduce((t, p) => t + (vw[p].antwoorden || 0), 0);
          const vG = Object.keys(vw).reduce((t, p) => t + (vw[p].genoemd || 0), 0);
          vorigPercentage = vA ? Math.round((vG / vA) * 100) : null;
        }
        ai = { status: 'ok', oud: a.oud, heeftMeting: antw > 0, percentage, vorigPercentage, platformen: a.data.platformen.map((p) => ({ label: p.label || p.id, genoemd: p.genoemd || 0, antwoorden: p.antwoorden || 0 })), weekLabel: a.data.laatsteWeek ? a.data.laatsteWeek.label : '', weekStart: a.data.laatsteWeek ? a.data.laatsteWeek.start : '' };
      } else {
        ai = { status: 'ok', oud: a.oud, heeftMeting: false, melding: a.data.melding || '' };
      }
    } else if (a.status === 'ok') {
      ai = { status: 'uit' };
    }

    // Merk
    let merk = { status: m.status === 'ok' && m.data && m.data.beschikbaar === false ? 'uit' : m.status, oud: m.oud };
    if (merk.status === 'ok' && m.data) {
      merk = { status: 'ok', oud: m.oud, bevestigd: m.data.aantalBevestigd || 0, totaal: m.data.aantalSecties || 0, open: (m.data.aantalOpenTegenstrijdigheden || 0), paginas: m.data.aantalPaginas || 0 };
    }
    const kennis = k.status === 'ok' && k.data
      ? { status: 'ok', heeft: Boolean(k.data.tekst), bijgewerkt: k.data.bijgewerkt || '', woorden: k.data.tekst ? String(k.data.tekst).trim().split(/\s+/).length : 0 }
      : { status: k.status };

    // Onderwerpen: blogs per cluster uit Notion, Google en AI per cluster uit hun eigen bron.
    const perCluster = new Map();
    const hoek = (naam) => {
      if (!perCluster.has(naam)) perCluster.set(naam, { naam, live: 0, gepland: 0, vertoningen: null, paginaEen: 0 });
      return perCluster.get(naam);
    };
    const sleutel = (n) => String(n || '').toLowerCase();
    live.forEach((i) => { if (i.cluster) hoek(i.cluster).live += 1; });
    const laatsteDatumPerCluster = {};
    gepland.forEach((i) => {
      if (!i.cluster) return;
      hoek(i.cluster).gepland += 1;
      const d = dagTekst(i.publicatiedatum);
      if (geldig(d) && (!laatsteDatumPerCluster[i.cluster] || d > laatsteDatumPerCluster[i.cluster])) laatsteDatumPerCluster[i.cluster] = d;
    });
    if (google.status === 'ok') {
      googleBlogs.forEach((b) => {
        if (!b.cluster) return;
        const naam = [...perCluster.keys()].find((n) => sleutel(n) === sleutel(b.cluster)) || b.cluster;
        const c = hoek(naam);
        c.vertoningen = (c.vertoningen || 0) + (b.vertoningen || 0);
        if (b.hkPositie !== null && b.hkPositie !== undefined && b.hkPositie <= 10) c.paginaEen += 1;
      });
    }
    const aiClusters = a.status === 'ok' && a.data && Array.isArray(a.data.clusters) ? a.data.clusters : [];
    const onderwerpen = [...perCluster.values()].map((c) => {
      const rij = aiClusters.find((x) => sleutel(x.naam) === sleutel(c.naam));
      let aiPercentage = null;
      if (rij) {
        const ps = Object.values(rij.platformen || {});
        const antw = ps.reduce((t, p) => t + (p.antwoorden || 0), 0);
        const gen = ps.reduce((t, p) => t + (p.genoemd || 0), 0);
        aiPercentage = antw ? Math.round((gen / antw) * 100) : null;
      }
      let hint = null;
      if (c.paginaEen > 0) hint = { toon: 'goed', tekst: c.paginaEen === 1 ? '1 zoekwoord staat op pagina 1 van Google' : c.paginaEen + ' zoekwoorden staan op pagina 1 van Google' };
      else if (c.live > 0 && aiPercentage === 0) hint = { toon: 'let-op', tekst: 'AI assistenten noemen jullie hier nog niet' };
      else if (c.gepland > 0 && laatsteDatumPerCluster[c.naam]) hint = { toon: 'neutraal', tekst: c.gepland + (c.gepland === 1 ? ' blog' : ' blogs') + ' gepland tot en met ' + laatsteDatumPerCluster[c.naam], datum: laatsteDatumPerCluster[c.naam] };
      return { ...c, aiPercentage, hint };
    }).sort((x, y) => (y.live + y.gepland) - (x.live + x.gepland) || x.naam.localeCompare(y.naam, 'nl')).slice(0, 6);

    // Wat er gebeurde: afgeleid uit datums die er al zijn. Geen aparte tabel.
    const storing = g.oud || (inv && inv.google && inv.google.status === 'fout');
    const feed = [];
    live.forEach((i) => {
      const d = dagTekst(i.publicatiedatum);
      if (geldig(d) && d <= vandaag) feed.push({ soort: 'goed', datum: d, tekst: 'Blog live', sub: i.titel || '(geen titel)', id: i.id });
    });
    if (google.status === 'ok' && google.bijgewerkt && geldig(dagTekst(google.bijgewerkt))) feed.push({ soort: 'grafiek', datum: dagTekst(google.bijgewerkt), tekst: 'Google cijfers bijgewerkt', sub: '' });
    if (ai.status === 'ok' && ai.heeftMeting && ai.weekStart) feed.push({ soort: 'ai', datum: ai.weekStart, tekst: 'AI meting afgerond', sub: ai.weekLabel });
    if (kennis.status === 'ok' && kennis.heeft && geldig(dagTekst(kennis.bijgewerkt))) feed.push({ soort: 'boek', datum: dagTekst(kennis.bijgewerkt), tekst: 'Kennisdocument bijgewerkt', sub: kennis.woorden ? kennis.woorden + (kennis.woorden === 1 ? ' woord' : ' woorden') : '' });
    if (merk.status === 'ok' && m.data && m.data.bijgewerkt && geldig(dagTekst(m.data.bijgewerkt))) feed.push({ soort: 'merk', datum: dagTekst(m.data.bijgewerkt), tekst: 'Merkprofiel vastgesteld', sub: merk.paginas ? 'Uit ' + merk.paginas + ' pagina\u2019s van jullie website' : '' });
    feed.sort((x, y) => (x.datum < y.datum ? 1 : x.datum > y.datum ? -1 : 0));
    if (storing) feed.unshift({ soort: 'let-op', datum: vandaag, tekst: 'Google cijfers niet opgehaald', sub: 'Nieuwe poging volgt automatisch' });
    if (review.length) feed.unshift({ soort: 'let-op', datum: vandaag, tekst: review.length === 1 ? '1 blog klaar voor review' : review.length + ' blogs klaar voor review', sub: '' });

    // Volgende AI meting: een week na de laatste meting.
    let volgendeAiMeting = null;
    if (ai.status === 'ok' && ai.weekStart) {
      const d = new Date(Date.UTC(+ai.weekStart.slice(0, 4), +ai.weekStart.slice(5, 7) - 1, +ai.weekStart.slice(8, 10) + 7));
      volgendeAiMeting = d.toISOString().slice(0, 10);
      if (volgendeAiMeting < vandaag) volgendeAiMeting = null;
    }

    // Stand van de klant
    let stand = 'normaal';
    if (review.length) stand = 'actie';
    else if (storing) stand = 'storing';
    else if (!live.length && !(google.heeftData)) stand = 'nieuw';

    // Stappen voor een nieuwe klant
    const merkKlaar = merk.status === 'ok' && merk.totaal > 0 && merk.bevestigd >= merk.totaal;
    const stappen = [
      { titel: 'Intake', tekst: 'Ontvangen en verwerkt', klaar: true },
      { titel: 'Google koppelen', tekst: 'Search Console en Analytics', klaar: google.status === 'ok' },
      { titel: 'Merkprofiel bevestigen', tekst: 'Lees wat wij vastlegden en pas aan waar nodig', klaar: merkKlaar },
      { titel: 'Strategie en planning', tekst: gepland.length ? 'Onderwerpen en de eerste ' + gepland.length + ' blogs' : 'Onderwerpen en de eerste blogs', klaar: gepland.length > 0 || live.length > 0 },
      { titel: 'Eerste blog live', tekst: komend[0] ? 'Rond ' + kortDatum(komend[0].datum) : 'Zodra de planning klaar is', klaar: live.length > 0 }
    ];
    const eerste = stappen.findIndex((x) => !x.klaar);
    stappen.forEach((x, i) => { x.status = x.klaar ? 'klaar' : i === eerste ? 'nu' : 'later'; });

    const meerdereBronnenFout = [g, a, m, k].some((x) => x.status === 'fout');
    return {
      stand,
      review,
      aantalLive: live.length,
      aantalGepland: gepland.length,
      voortgang: { live: live.length, gepland: gepland.length },
      volgendeBlog: komend[0] || null,
      komend: komend.slice(0, 5),
      aantalKomend: komend.length,
      zonderDatum,
      google,
      ai,
      merk,
      kennis,
      onderwerpen,
      feed: feed.slice(0, 6),
      stappen,
      volgendeAiMeting,
      bijgewerkt: google.bijgewerkt || null,
      bronFout: meerdereBronnenFout
    };
  }

  // De regel en de uitleg bovenaan: zegt in gewone taal hoe het ervoor staat.
  function statusZin(s) {
    if (s.stand === 'actie') {
      const n = s.review.length;
      return n === 1 ? '1 blog wacht op jouw review' : n + ' blogs wachten op jouw review';
    }
    if (s.stand === 'storing') return 'De Google cijfers zijn vandaag niet opgehaald';
    if (s.stand === 'nieuw') return 'Welkom. We zetten alles voor jullie klaar.';
    return 'Alles loopt. Er wacht niets op jou.';
  }

  function statusTekst(s) {
    if (s.stand === 'actie') return 'Lees ze en keur goed of geef een opmerking. Daarna plannen wij ze in.' + (s.volgendeBlog ? ' Een blog gaat pas live na jouw akkoord.' : '');
    if (s.stand === 'storing') return 'Je ziet de laatst bekende cijfers. Wij proberen het automatisch opnieuw en Advertisr krijgt er een melding van. Blogs en planning lopen gewoon door.';
    if (s.stand === 'nieuw') return 'In de eerste weken bouwen wij jullie merkprofiel en de eerste blogs. Hieronder zie je welke stap nu loopt en wat we van jou nodig hebben.';
    return 'Wij volgen de cijfers in Google en in AI assistenten en melden het hier als er iets te doen is.';
  }

  const api = { bouwStartscherm, statusZin, statusTekst };
  if (typeof window !== 'undefined') window.OverzichtModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
