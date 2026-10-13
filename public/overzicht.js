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

  const F = () => window.PortaalFormat;
  const U = () => window.PortaalUI;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Laatst gelukte gegevens per bron, zodat een storing de oude cijfers laat staan met "Stand van ...".
  const laatsteGoed = {};
  let teller = 0;

  async function haal(sleutel, klantId, pad) {
    try {
      const data = await window.api('/' + klantId + pad);
      laatsteGoed[klantId + sleutel] = { data, op: new Date().toISOString().slice(0, 10) };
      return { status: 'ok', data };
    } catch (err) {
      const oud = laatsteGoed[klantId + sleutel];
      return oud ? { status: 'fout', stand: oud.data, opDatum: oud.op } : { status: 'fout' };
    }
  }

  function weekGrafiek(weken) {
    if (!weken || weken.length < 2) return '';
    const max = Math.max.apply(null, weken.map((w) => w.vertoningen)) || 1;
    const staven = weken.map((w) => {
      const h = Math.max(2, Math.round((w.vertoningen / max) * 100));
      return '<div class="p-ov-kolom" title="' + esc(F().datumKort(w.start) + ': ' + F().getal(w.vertoningen) + ' vertoningen') + '"><i class="p-ov-staaf' + (w.nieuw ? ' p-ov-nieuw' : '') + '" style="height:' + h + '%"></i></div>';
    }).join('');
    const eerste = F().datumKort(weken[0].start);
    const laatste = F().datumKort(weken[weken.length - 1].start);
    return '<div class="p-ov-grafiek" role="img" aria-label="Vertoningen in Google per week">' + staven + '</div>' +
      '<div class="p-ov-as"><span>' + esc(eerste) + '</span><span class="p-ov-legenda"><i></i> week met een nieuwe blog</span><span>' + esc(laatste) + '</span></div>';
  }

  // Verschil in procentpunten: van 20% naar 40% is "+20 punten", niet "+100%".
  function puntenVerschil(nu, voor) {
    const d = nu - voor;
    if (d === 0) return { tekst: 'Gelijk', toon: 'gelijk' };
    return { tekst: (d > 0 ? '+' : '-') + Math.abs(d) + ' punten', toon: d > 0 ? 'goed' : 'slecht' };
  }

  function kerncijferLijst(s) {
    const lijst = [];
    const Fm = F();
    if (s.google.status === 'ok' && s.google.heeftData !== undefined) {
      const gk = s.google;
      lijst.push({
        label: 'Vertoningen in Google', icoon: 'oog', waarde: gk.heeftData ? Fm.getal(gk.vertoningen) : '0',
        verschil: gk.heeftData ? Fm.verschil(gk.vertoningen, gk.vertoningenVorig) : null,
        vergelijking: gk.heeftData ? 'Laatste 28 dagen' : 'Zodra de eerste blog gevonden wordt',
        staafjes: gk.staafjes
      });
      lijst.push({
        label: 'Bezoekers vanuit Google', icoon: 'mensen', waarde: gk.heeftData ? Fm.getal(gk.clicks) : '0',
        verschil: gk.heeftData ? Fm.verschil(gk.clicks, gk.clicksVorig) : null,
        vergelijking: gk.heeftData ? 'Laatste 28 dagen' : 'Komt na de eerste vertoningen'
      });
    }
    lijst.push({ label: 'Blogs live', icoon: 'blad', waarde: String(s.aantalLive), vergelijking: s.aantalGepland ? s.aantalGepland + ' nog gepland' : 'Geen blogs meer gepland' });
    if (s.ai.status === 'ok') {
      lijst.push({
        label: 'AI noemt jullie', icoon: 'ai', toon: 'ai',
        waarde: s.ai.heeftMeting && s.ai.percentage != null ? Fm.procent(s.ai.percentage) : 'Nog geen meting',
        verschil: s.ai.heeftMeting && s.ai.vorigPercentage != null ? puntenVerschil(s.ai.percentage, s.ai.vorigPercentage) : null,
        vergelijking: s.ai.heeftMeting ? 'Meting ' + (s.ai.weekLabel || '') : (s.ai.melding || 'De eerste meting volgt')
      });
    }
    return lijst;
  }

  function reviewKaart(s, badgeKlasse) {
    const U_ = U();
    if (!s.review.length) {
      return U_.kaart({ titel: 'Wacht op jou', inhoud: U_.legeStand({ soort: 'klaar', titel: 'Alles is beoordeeld', tekst: 'Er wacht niets op jou.' }) });
    }
    const rijen = s.review.slice(0, 5).map((i) => '<button type="button" class="p-ov-rij" data-blog="' + esc(i.id) + '"><span class="p-ov-rij-titel">' + esc(i.titel || '(geen titel)') + '</span>' + U_.pil('Ter review', 'let-op') + '</button>').join('');
    return U_.kaart({ titel: 'Wacht op jou', uitleg: 'Lees de blog en geef je oordeel', aantal: s.review.length, actie: { tekst: 'Naar Blogs', tab: 'blogs' }, inhoud: '<div class="p-ov-lijst">' + rijen + '</div>' });
  }

  function komendKaart(s) {
    const U_ = U();
    const Fm = F();
    let inhoud;
    if (!s.komend.length) {
      inhoud = U_.legeStand({ soort: 'wacht', titel: 'Er staan nog geen blogs met een datum', tekst: s.zonderDatum ? s.zonderDatum + ' blogs wachten nog op een datum.' : 'Zodra er een blog gepland is, zie je hem hier.' });
    } else {
      inhoud = '<div class="p-ov-lijst">' + s.komend.map((b) => '<button type="button" class="p-ov-rij" data-blog="' + esc(b.id) + '"><span class="p-ov-datum">' + esc(Fm.datumKort(b.datum)) + '</span><span class="p-ov-rij-titel">' + esc(b.titel) + '</span>' + U_.pil(b.status || '', 'plan') + '</button>').join('') + '</div>';
    }
    return U_.kaart({ titel: 'Komende blogs', aantal: s.aantalKomend > 5 ? '5 van ' + s.aantalKomend : (s.aantalKomend || null), actie: { tekst: 'Hele planning', tab: 'blogs' }, inhoud });
  }

  function merkKaart(s) {
    const U_ = U();
    const Fm = F();
    const regels = [];
    if (s.merk.status === 'ok') {
      regels.push('<div class="p-ov-merk"><span>Merkprofiel</span><b>' + s.merk.bevestigd + ' van ' + s.merk.totaal + ' onderdelen bevestigd</b></div>' +
        U_.voortgang([{ aandeel: s.merk.totaal ? (s.merk.bevestigd / s.merk.totaal) * 100 : 0, toon: 'goed' }], 'Bevestigd merkprofiel'));
    }
    if (s.kennis.status === 'ok') {
      regels.push('<div class="p-ov-merk"><span>Kennisdocument</span><b>' + (s.kennis.heeft ? 'Bijgewerkt ' + esc(Fm.datumKort(s.kennis.bijgewerkt)) : 'Nog niet ingevuld') + '</b></div>');
    }
    if (!regels.length) return '';
    return U_.kaart({ titel: 'Jullie merk', uitleg: 'Hier schrijven wij op basis van', actie: { tekst: 'Merkprofiel', tab: 'merkprofiel' }, inhoud: regels.join('') });
  }

  function feedKaart(s) {
    const U_ = U();
    const Fm = F();
    const inhoud = s.feed.length
      ? '<ul class="p-ov-feed">' + s.feed.map((f) => '<li><span class="p-ov-feed-datum">' + esc(Fm.datumKort(f.datum)) + '</span>' + esc(f.tekst) + '</li>').join('') + '</ul>'
      : U_.legeStand({ soort: 'wacht', titel: 'Nog niets gebeurd', tekst: 'Zodra de eerste blog live staat, zie je het hier.' });
    return U_.kaart({ titel: 'Wat er gebeurde', inhoud });
  }

  function onderwerpKaart(s) {
    if (!s.onderwerpen.length) return '';
    const U_ = U();
    const Fm = F();
    const kaarten = s.onderwerpen.map((o) => '<div class="p-ov-onderwerp"><b>' + esc(o.naam) + '</b><span>' + o.live + ' live, ' + o.gepland + ' gepland</span>' +
      (o.live ? '<span>' + esc(Fm.getal(o.vertoningen)) + ' vertoningen in Google</span>' : '') +
      (o.aiPercentage != null ? '<span>AI noemt jullie in ' + esc(Fm.procent(o.aiPercentage)) + '</span>' : '') + '</div>').join('');
    return U_.kaart({ titel: 'Onderwerpen', uitleg: 'Waar de blogs over gaan', inhoud: '<div class="p-ov-onderwerpen">' + kaarten + '</div>' });
  }

  function statusBalk(s, zin) {
    const U_ = U();
    const delen = s.voortgang.live + s.voortgang.gepland;
    const volgend = s.volgendeBlog ? 'Volgende blog: ' + F().datumLang(s.volgendeBlog.datum) : 'Geen blog met datum';
    const ai = s.ai.status === 'ok' ? (s.ai.heeftMeting ? 'AI meting: ' + (s.ai.weekLabel || 'laatste week') : 'AI meting: eerste volgt') : '';
    const toon = s.stand === 'actie' ? 'let-op' : s.stand === 'nieuw' ? 'plan' : 'goed';
    return '<section class="p-kaart p-ov-status p-ov-status-' + s.stand + '"><div class="p-ov-status-tekst">' +
      U_.pil(s.stand === 'actie' ? 'Actie nodig' : s.stand === 'nieuw' ? 'Aan het opstarten' : 'Alles op schema', toon) +
      '<h1>' + esc(zin) + '</h1><div class="p-ov-status-meta"><span>' + esc(volgend) + '</span>' + (ai ? '<span>' + esc(ai) + '</span>' : '') + '</div></div>' +
      '<div class="p-ov-plan"><div class="p-ov-plan-kop"><b>Contentplan</b><span>' + s.voortgang.live + ' live, ' + s.voortgang.gepland + ' gepland</span></div>' +
      U_.voortgang(delen ? [{ aandeel: (s.voortgang.live / delen) * 100, toon: 'goed' }, { aandeel: (s.voortgang.gepland / delen) * 100, toon: 'plan' }] : [], 'Contentplan: live en gepland') + '</div></section>';
  }

  function bouwHtml(state, inv, badgeKlasse) {
    const U_ = U();
    const M = window.OverzichtModel;
    const s = M.bouwStartscherm(inv, new Date().toISOString().slice(0, 10));
    const meldingen = [];
    ['google', 'ai'].forEach((k) => {
      const bron = inv[k];
      if (bron && bron.status === 'fout' && bron.stand && bron.opDatum) meldingen.push(U_.oudeStand('Stand van ' + F().datumKort(bron.opDatum) + ': we kunnen ' + (k === 'google' ? 'de Google cijfers' : 'de AI meting') + ' nu niet verversen.'));
      else if (bron && bron.status === 'fout') meldingen.push(U_.foutStand({ titel: k === 'google' ? 'De Google cijfers laden even niet' : 'De AI meting laadt even niet', tekst: 'De rest van het portaal werkt gewoon. Probeer het straks opnieuw.' }));
    });
    const grafiek = s.google.status === 'ok' && s.google.weken && s.google.weken.length >= 2 && s.google.heeftData
      ? U_.kaart({ titel: 'Vertoningen per week', uitleg: 'Hoe vaak jullie blogs in Google verschenen', actie: { tekst: 'Naar Google', tab: 'prestaties' }, inhoud: weekGrafiek(s.google.weken) }) : '';
    return '<div class="p-ov">' + statusBalk(s, M.statusZin(s)) + meldingen.join('') +
      U_.kerncijfers(kerncijferLijst(s)) + grafiek +
      '<div class="p-ov-twee">' + reviewKaart(s, badgeKlasse) + komendKaart(s) + '</div>' +
      '<div class="p-ov-twee">' + merkKaart(s) + feedKaart(s) + '</div>' + onderwerpKaart(s) + '</div>';
  }

  function koppel(doel, openBlog) {
    doel.querySelectorAll('[data-blog]').forEach((k) => k.addEventListener('click', () => openBlog(k.dataset.blog)));
    doel.querySelectorAll('.p-link[data-tab]').forEach((k) => k.addEventListener('click', () => window.switchTab(k.dataset.tab)));
  }

  async function renderOverzicht(state, badgeKlasse, openBlog) {
    const doel = document.getElementById('overzichtTab');
    if (!doel || !window.PortaalUI || !window.OverzichtModel) return;
    const mijn = ++teller;
    const basis = { items: state.items, statusValues: state.statusValues, reviewEnabled: state.reviewEnabled };
    // Eerst meteen tonen wat al geladen is, de losse bronnen komen erbij.
    doel.innerHTML = bouwHtml(state, { ...basis, google: { status: 'uit' }, ai: { status: 'uit' }, merk: { status: 'uit' }, kennis: { status: 'uit' } }, badgeKlasse)
      .replace('<div class="p-ov">', '<div class="p-ov">' + U().laden([{ breedte: '100%', hoogte: 6 }]));
    koppel(doel, openBlog);
    const id = state.clientId;
    const [google, ai, merk, kennis] = await Promise.all([
      state.performanceEnabled ? haal('google', id, '/performance-v2') : Promise.resolve({ status: 'uit' }),
      haal('ai', id, '/ai-zichtbaarheid'),
      haal('merk', id, '/merkprofiel'),
      haal('kennis', id, '/kennisdocument')
    ]);
    if (mijn !== teller) return;
    // Een klant zonder deze dienst (404 of niet beschikbaar) toont het onderdeel gewoon niet.
    const uit = (b) => (b.status === 'fout' && !b.stand ? { status: 'uit' } : b);
    doel.innerHTML = bouwHtml(state, { ...basis, google, ai: uit(ai), merk: uit(merk), kennis: uit(kennis) }, badgeKlasse);
    koppel(doel, openBlog);
  }

  if (typeof window !== 'undefined') window.renderOverzicht = renderOverzicht;
  if (typeof module !== 'undefined' && module.exports) module.exports = { maakOverzicht };
})();
