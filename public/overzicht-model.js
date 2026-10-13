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
    if (g.status === 'ok' && g.data && g.data.totalen) {
      const t = g.data.totalen;
      const volledig = (g.data.weken || []).filter((w) => w.volledig);
      const reeks = volledig.slice(-10);
      google = {
        status: 'ok',
        oud: g.oud,
        bijgewerkt: g.data.laatstBijgewerkt || null,
        vertoningen: t.vertoningen,
        vertoningenVorig: t.vertoningenVorig,
        clicks: t.clicks,
        clicksVorig: t.clicksVorig,
        staafjes: reeks.map((w) => w.vertoningen),
        weken: reeks.map((w) => ({ start: w.start, vertoningen: w.vertoningen, nieuw: (w.nieuw || []).length })),
        heeftData: (t.vertoningen || 0) > 0 || (t.clicks || 0) > 0 || reeks.some((w) => w.vertoningen > 0)
      };
    } else if (g.status === 'ok') {
      google = { status: 'ok', oud: g.oud, heeftData: false, weken: [], staafjes: [] };
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
        ai = { status: 'ok', oud: a.oud, heeftMeting: antw > 0, percentage, vorigPercentage, weekLabel: a.data.laatsteWeek ? a.data.laatsteWeek.label : '', weekStart: a.data.laatsteWeek ? a.data.laatsteWeek.start : '' };
      } else {
        ai = { status: 'ok', oud: a.oud, heeftMeting: false, melding: a.data.melding || '' };
      }
    } else if (a.status === 'ok') {
      ai = { status: 'uit' };
    }

    // Merk
    let merk = { status: m.status === 'ok' && m.data && m.data.beschikbaar === false ? 'uit' : m.status, oud: m.oud };
    if (merk.status === 'ok' && m.data) {
      merk = { status: 'ok', oud: m.oud, bevestigd: m.data.aantalBevestigd || 0, totaal: m.data.aantalSecties || 0, open: (m.data.aantalOpenTegenstrijdigheden || 0) };
    }
    const kennis = k.status === 'ok' && k.data
      ? { status: 'ok', heeft: Boolean(k.data.tekst), bijgewerkt: k.data.bijgewerkt || '' }
      : { status: k.status };

    // Onderwerpen: per cluster hoeveel blogs live en gepland zijn en wat Google toont (kolom uit Notion).
    const perCluster = new Map();
    const hoek = (naam) => {
      if (!perCluster.has(naam)) perCluster.set(naam, { naam, live: 0, gepland: 0, vertoningen: 0 });
      return perCluster.get(naam);
    };
    live.forEach((i) => { if (i.cluster) { const c = hoek(i.cluster); c.live += 1; c.vertoningen += Number(i.impressions30d) || 0; } });
    gepland.forEach((i) => { if (i.cluster) hoek(i.cluster).gepland += 1; });
    const aiClusters = a.status === 'ok' && a.data && Array.isArray(a.data.clusters) ? a.data.clusters : [];
    const onderwerpen = [...perCluster.values()].map((c) => {
      const rij = aiClusters.find((x) => String(x.naam).toLowerCase() === c.naam.toLowerCase());
      let aiPercentage = null;
      if (rij) {
        const ps = Object.values(rij.platformen || {});
        const antw = ps.reduce((t, p) => t + (p.antwoorden || 0), 0);
        const gen = ps.reduce((t, p) => t + (p.genoemd || 0), 0);
        aiPercentage = antw ? Math.round((gen / antw) * 100) : null;
      }
      return { ...c, aiPercentage };
    }).sort((x, y) => (y.live + y.gepland) - (x.live + x.gepland) || x.naam.localeCompare(y.naam, 'nl')).slice(0, 6);

    // Wat er gebeurde: afgeleid uit datums die er al zijn. Geen aparte tabel.
    const feed = [];
    live.forEach((i) => {
      const d = dagTekst(i.publicatiedatum);
      if (geldig(d) && d <= vandaag) feed.push({ soort: 'blog', datum: d, tekst: 'Blog live: ' + (i.titel || '(geen titel)'), id: i.id });
    });
    if (ai.status === 'ok' && ai.weekStart) feed.push({ soort: 'ai', datum: ai.weekStart, tekst: 'AI meting staat klaar: ' + ai.weekLabel });
    if (merk.status === 'ok' && m.data && m.data.bijgewerkt) {
      const d = dagTekst(m.data.bijgewerkt);
      if (geldig(d)) feed.push({ soort: 'merk', datum: d, tekst: 'Merkprofiel opgebouwd' });
    }
    feed.sort((x, y) => (x.datum < y.datum ? 1 : x.datum > y.datum ? -1 : 0));

    // Stand van de klant
    let stand = 'normaal';
    if (review.length) stand = 'actie';
    else if (!live.length && !(google.heeftData)) stand = 'nieuw';

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
      bronFout: meerdereBronnenFout
    };
  }

  // De zin bovenaan: zegt in gewone taal hoe het ervoor staat.
  function statusZin(s) {
    if (s.stand === 'actie') {
      const n = s.review.length;
      return n === 1 ? 'Er wacht 1 blog op jouw beoordeling.' : 'Er wachten ' + n + ' blogs op jouw beoordeling.';
    }
    if (s.stand === 'nieuw') {
      return s.aantalGepland > 0 ? 'Jullie contentplan staat klaar. De eerste blogs komen eraan.' : 'We zijn begonnen. Zodra er blogs zijn, zie je ze hier.';
    }
    if (s.volgendeBlog) {
      const d = s.volgendeBlog.dagen;
      const wanneer = d === 0 ? 'vandaag' : d === 1 ? 'morgen' : 'over ' + d + ' dagen';
      return 'Alles loopt. De volgende blog gaat ' + wanneer + ' live.';
    }
    return 'Alles loopt. Er staat op dit moment geen blog met een datum gepland.';
  }

  const api = { bouwStartscherm, statusZin };
  if (typeof window !== 'undefined') window.OverzichtModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
