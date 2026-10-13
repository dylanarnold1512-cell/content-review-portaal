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

  const EXTRA = {
    grafiek: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    boek: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
    merk: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  function ic(naam) {
    return EXTRA[naam] ? '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true">' + EXTRA[naam] + '</svg>' : U().icoon(naam);
  }

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

  function mooiMax(waarde) {
    const w = Math.max(waarde, 1);
    const macht = Math.pow(10, Math.floor(Math.log10(w)));
    const kandidaat = [1, 2, 3, 4, 5, 6, 8, 10].map((x) => x * macht).find((x) => x >= w);
    return kandidaat || w;
  }

  function grafiek(weken) {
    const Fm = F();
    const W = 640, H = 210, L = 44, R = 8, T = 18, B = 40;
    const max = mooiMax(Math.max.apply(null, weken.map((w) => w.vertoningen)));
    const cw = (W - L - R) / weken.length;
    const bw = Math.min(30, cw * 0.55);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Keer getoond in Google per week">';
    [0, 1, 2, 3, 4].forEach((n) => {
      const v = (max / 4) * n;
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="p-ov-raster"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + esc(Fm.getal(v)) + '</text>';
    });
    weken.forEach((w, i) => {
      const cx = L + cw * i + cw / 2;
      const h = Math.max(1.5, y(0) - y(w.vertoningen));
      svg += '<rect x="' + (cx - bw / 2) + '" y="' + (y(0) - h) + '" width="' + bw + '" height="' + h + '" rx="4" class="' + (w.open ? 'p-ov-staaf-open' : 'p-ov-staaf') + '"><title>Week van ' + esc(Fm.datumKort(w.start)) + ': ' + esc(Fm.getal(w.vertoningen)) + ' keer getoond' + (w.open ? ' (week nog niet compleet)' : '') + '</title></rect>';
      if (w.vertoningen > 0) svg += '<text class="p-ov-waarde" x="' + cx + '" y="' + (y(0) - h - 6) + '" text-anchor="middle">' + esc(Fm.getal(w.vertoningen)) + '</text>';
      svg += '<text x="' + cx + '" y="' + (H - B + 18) + '" text-anchor="middle">' + esc(Fm.datumKort(w.start)) + '</text>';
      if (w.nieuw) svg += '<circle cx="' + cx + '" cy="' + (H - B + 30) + '" r="3.5" class="p-ov-stip"><title>Nieuwe blog live in deze week</title></circle>';
    });
    svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" class="p-ov-grondlijn"/></svg>';
    return svg;
  }

  function puntenVerschil(nu, voor) {
    const d = nu - voor;
    if (d === 0) return { tekst: 'Gelijk', toon: 'gelijk' };
    return { tekst: (d > 0 ? '+' : '-') + Math.abs(d) + ' punten', toon: d > 0 ? 'goed' : 'slecht' };
  }

  function dagDatum(iso) {
    const Fm = F();
    const dag = Fm.dagNaam(iso);
    return dag ? dag.charAt(0).toUpperCase() + dag.slice(1) + ' ' + Fm.datumKort(iso) : Fm.datumKort(iso);
  }

  function kop(s, state) {
    const Fm = F();
    const chip = s.stand === 'storing'
      ? '<span class="p-ov-chip"><i class="p-ov-punt p-ov-punt-let-op"></i>Google: laatst gelukt ' + esc(Fm.datumKort(s.bijgewerkt)) + '</span>'
      : s.stand === 'nieuw' ? '<span class="p-ov-chip"><i class="p-ov-punt p-ov-punt-plan"></i>Opstart in gang</span>'
      : s.bijgewerkt ? '<span class="p-ov-chip"><i class="p-ov-punt"></i>Bijgewerkt ' + esc(Fm.datumKort(s.bijgewerkt)) + '</span>' : '';
    const sub = 'Alles wat Advertisr voor ' + esc(state.clientNaam || 'jullie') + ' doet, op één plek.' + (s.stand === 'nieuw' ? '' : (s.google.status === 'ok' && s.google.heeftData ? ' Cijfers over de laatste 28 dagen.' : ''));
    return '<div class="p-ov-kop"><div><h1>Overzicht</h1><p>' + sub + '</p></div><div class="p-ov-kop-acties">' + chip +
      (state.ideaEnrichmentEnabled ? '<button type="button" class="p-knop p-knop-hoofd" data-actie="idee">' + ic('plus') + 'Idee aandragen</button>' : '') + '</div></div>';
  }

  function statusBalk(s, M, state) {
    const Fm = F();
    const toon = s.stand === 'actie' ? 'let-op' : s.stand === 'storing' ? 'fout' : 'goed';
    const delen = s.voortgang.live + s.voortgang.gepland;
    const knop = s.stand === 'actie' ? '<div><button type="button" class="p-knop p-knop-hoofd" data-tab="blogs">Naar de review ' + ic('pijl') + '</button></div>'
      : s.stand === 'nieuw' ? '<div><button type="button" class="p-knop p-knop-hoofd" data-tab="merkprofiel">Merkprofiel bekijken ' + ic('pijl') + '</button></div>' : '';
    let volgende;
    if (s.stand === 'nieuw') {
      const nu = s.stappen.find((x) => x.status === 'nu');
      volgende = '<div class="p-ov-volgend"><span class="p-ov-lbl">Nu bezig</span><span class="p-ov-val">' + esc(nu ? nu.titel : 'Alles staat klaar') + '</span><span class="p-ov-txt">' + esc(nu ? nu.tekst : '') + '</span></div>' +
        '<div class="p-ov-volgend"><span class="p-ov-lbl">Eerste blog</span><span class="p-ov-val">' + esc(s.volgendeBlog ? 'Rond ' + Fm.datumKort(s.volgendeBlog.datum) : 'Volgt') + '</span><span class="p-ov-txt">Na jouw bevestiging</span></div>' +
        '<div class="p-ov-volgend"><span class="p-ov-lbl">Eerste cijfers</span><span class="p-ov-val">Na een paar weken</span><span class="p-ov-txt">Google laat nieuwe pagina’s pas na een tijdje zien</span></div>';
    } else {
      volgende = '<div class="p-ov-volgend"><span class="p-ov-lbl">Volgende blog</span><span class="p-ov-val">' + esc(s.volgendeBlog ? dagDatum(s.volgendeBlog.datum) : 'Nog niet gepland') + '</span><span class="p-ov-txt">' + esc(s.volgendeBlog ? s.volgendeBlog.titel : 'Er staat geen blog met datum') + '</span></div>' +
        (s.ai.status === 'ok' ? '<div class="p-ov-volgend"><span class="p-ov-lbl">Volgende AI meting</span><span class="p-ov-val">' + esc(s.volgendeAiMeting ? dagDatum(s.volgendeAiMeting) : 'Deze week') + '</span><span class="p-ov-txt">Vragen aan ChatGPT en Gemini</span></div>' : '') +
        '<div class="p-ov-volgend"><span class="p-ov-lbl">Contentplan</span><span class="p-ov-val">' + s.voortgang.live + ' live · ' + s.voortgang.gepland + ' gepland</span>' +
        U().voortgang(delen ? [{ aandeel: (s.voortgang.live / delen) * 100, toon: 'goed' }, { aandeel: (s.voortgang.gepland / delen) * 100, toon: 'plan' }] : [], s.voortgang.live + ' van ' + delen + ' blogs live') + '</div>';
    }
    return '<section class="p-kaart p-ov-status" data-toon="' + toon + '"><div class="p-ov-status-hoofd"><div class="p-ov-status-regel"><span class="p-ov-puls"></span>' + esc(M.statusZin(s)) + '</div><p>' + esc(M.statusTekst(s)) + '</p>' + knop + '</div>' +
      '<div class="p-ov-status-volgend">' + volgende + '</div></section>';
  }

  function kerncijfers(s) {
    const U_ = U();
    const Fm = F();
    if (s.stand === 'nieuw') {
      const leeg = (icoonNaam, label, kopje, tekst, ai) => '<div class="p-kerncijfer"><div class="p-kerncijfer-kop"><span class="p-kerncijfer-icoon' + (ai ? ' p-kerncijfer-icoon-ai' : '') + '">' + ic(icoonNaam) + '</span>' + esc(label) + '</div><div class="p-ov-leegcijfer"><b>' + esc(kopje) + '</b>' + esc(tekst) + '</div></div>';
      return '<section class="p-kerncijfers">' +
        (s.google.status === 'ok' ? leeg('oog', 'Keer getoond in Google', 'Nog geen cijfers', 'De eerste cijfers volgen zodra Google de blogs toont.') + leeg('mensen', 'Bezoekers vanuit Google', 'Nog geen cijfers', 'Komt na de eerste vertoningen.') : '') +
        leeg('blad', 'Blogs live', '0', s.volgendeBlog ? 'De eerste blog staat gepland rond ' + Fm.datumKort(s.volgendeBlog.datum) + '.' : 'De eerste blog volgt.') +
        (s.ai.status === 'ok' ? leeg('ai', 'AI noemt jullie', 'Nulmeting volgt', 'Daarna weet je waar jullie nu staan.', true) : '') + '</section>';
    }
    const oud = s.google.oud ? U_.oudeStand('Stand van ' + Fm.datumKort(s.bijgewerkt) + '. Wordt opnieuw opgehaald.') : '';
    const lijst = [];
    if (s.google.status === 'ok') {
      const gk = s.google;
      const kleur = gk.weken.slice(-8);
      lijst.push('<div class="p-kerncijfer-blok">' + U_.kerncijfer({ label: 'Keer getoond in Google', icoon: 'oog', waarde: Fm.getal(gk.vertoningen), verschil: Fm.verschil(gk.vertoningen, gk.vertoningenVorig), vergelijking: gk.vertoningenVorig != null ? Fm.getal(gk.vertoningenVorig) + ' in de 28 dagen ervoor' : '', staafjes: kleur.map((w) => w.vertoningen) }) + oud + '</div>');
      lijst.push('<div class="p-kerncijfer-blok">' + U_.kerncijfer({ label: 'Bezoekers vanuit Google', icoon: 'mensen', waarde: Fm.getal(gk.clicks), verschil: Fm.verschil(gk.clicks, gk.clicksVorig), vergelijking: gk.clicksVorig != null ? Fm.getal(gk.clicksVorig) + ' in de 28 dagen ervoor' : '', staafjes: kleur.map((w) => w.clicks) }) + oud + '</div>');
    }
    const getoond = s.google.status === 'ok' && s.google.blogsGemeten ? s.google.blogsGetoond + ' daarvan worden getoond in Google' : '';
    lijst.push('<div class="p-kerncijfer-blok">' + U_.kerncijfer({ label: 'Blogs live', icoon: 'blad', waarde: String(s.aantalLive), vergelijking: getoond || (s.aantalGepland ? s.aantalGepland + ' nog gepland' : '') }) +
      (s.google.status === 'ok' && s.google.blogsGemeten ? U_.voortgang([{ aandeel: (s.google.blogsGetoond / s.google.blogsGemeten) * 100, toon: 'plan' }], 'Blogs die getoond worden in Google') : '') + '</div>');
    if (s.ai.status === 'ok') {
      const a = s.ai;
      const platf = a.heeftMeting && a.platformen ? a.platformen.filter((p) => p.label).map((p) => p.label + ' ' + p.genoemd + ' van ' + p.antwoorden).join(' · ') + ' antwoorden' : '';
      lijst.push('<div class="p-kerncijfer-blok">' + U_.kerncijfer({
        label: 'AI noemt jullie', icoon: 'ai', toon: 'ai',
        waarde: a.heeftMeting && a.percentage != null ? Fm.procent(a.percentage) : 'Nog geen meting',
        verschil: a.heeftMeting && a.vorigPercentage != null ? puntenVerschil(a.percentage, a.vorigPercentage) : null,
        vergelijking: a.heeftMeting ? platf : (a.melding || 'De eerste meting volgt'),
        extra: a.heeftMeting ? a.weekLabel : ''
      }) + (s.ai.oud ? U_.oudeStand('Stand van de laatst geladen meting.') : '') + '</div>');
    }
    return '<section class="p-kerncijfers">' + lijst.join('') + '</section>';
  }

  function grafiekKaart(s) {
    const U_ = U();
    const Fm = F();
    if (s.stand === 'nieuw') {
      const stappen = s.stappen.map((x, i) => '<div class="p-ov-stap p-ov-stap-' + x.status + '"><span class="p-ov-stap-nr">' + (x.status === 'klaar' ? ic('vinkje') : (i + 1)) + '</span><b>' + esc(x.titel) + '</b><span>' + esc(x.tekst) + '</span></div>').join('');
      return U_.kaart({ titel: 'De eerste weken', inhoud: '<div class="p-ov-stappen">' + stappen + '</div>' });
    }
    if (s.google.status !== 'ok' || !s.google.heeftData || s.google.weken.length < 2) return '';
    const open = s.google.weken.some((w) => w.open);
    const legenda = '<div class="p-ov-legenda"><span><i class="p-ov-sw p-ov-sw-hele"></i>Hele week</span>' + (open ? '<span><i class="p-ov-sw p-ov-sw-open"></i>Week nog niet compleet</span>' : '') + '<span><i class="p-ov-sw p-ov-sw-stip"></i>Nieuwe blog live</span></div>';
    const waarsch = s.google.oud ? U_.oudeStand('Stand van ' + Fm.datumKort(s.bijgewerkt) + '. De laatste week kon niet worden bijgewerkt.') : '';
    return U_.kaart({ titel: 'Keer getoond in Google per week', uitleg: 'Een rode stip betekent dat er die week een nieuwe blog live ging', actie: { tekst: 'Naar Google', tab: 'prestaties' },
      inhoud: '<div class="p-ov-grafiek">' + grafiek(s.google.weken) + '</div>' + legenda + waarsch, klasse: 'p-ov-grafiekkaart' });
  }

  function planKaart(s) {
    const U_ = U();
    const Fm = F();
    if (!s.komend.length) {
      return U_.kaart({ titel: 'Komende blogs', actie: { tekst: 'Hele planning', tab: 'blogs' }, inhoud: s.stand === 'nieuw'
        ? U_.legeStand({ soort: 'wacht', titel: 'De planning volgt na het merkprofiel', tekst: 'Zodra het merkprofiel bevestigd is, maken wij de onderwerpen en de eerste blogs. Je ziet ze dan hier staan.' })
        : U_.legeStand({ soort: 'wacht', titel: 'Er staan nog geen blogs met een datum', tekst: s.zonderDatum ? s.zonderDatum + ' blogs wachten nog op een datum.' : 'Zodra er een blog gepland is, zie je hem hier.' }) });
    }
    const rijen = s.komend.map((b) => {
      const [j, m, d] = b.datum.split('-');
      const review = s.review.some((r) => r.id === b.id);
      return '<button type="button" class="p-ov-rij" data-blog="' + esc(b.id) + '"><div class="p-ov-datum"><b>' + Number(d) + '</b><span>' + esc(Fm.datumKort(b.datum).split(' ')[1] || '') + '</span></div>' +
        '<div class="p-ov-rij-tekst"><div class="p-ov-rij-titel">' + esc(b.titel) + '</div>' + (b.cluster ? '<div class="p-ov-rij-meta"><span class="p-ov-tag">' + esc(b.cluster) + '</span></div>' : '') + '</div>' +
        U_.pil(review ? 'Ter review' : 'Gepland', review ? 'let-op' : 'plan') + '</button>';
    }).join('');
    return U_.kaart({ titel: 'Komende blogs', aantal: s.aantalKomend > s.komend.length ? s.komend.length + ' van ' + s.aantalKomend : null, actie: { tekst: 'Hele planning', tab: 'blogs' }, inhoud: '<div class="p-ov-rijen">' + rijen + '</div>' });
  }

  function wachtKaart(s) {
    const U_ = U();
    let inhoud;
    if (s.review.length) {
      inhoud = '<div class="p-ov-todo">' + s.review.slice(0, 5).map((i, n) => '<div class="p-ov-todo-item"><b>' + esc(i.titel || '(geen titel)') + '</b>' +
        '<span class="p-ov-meta">' + (i.publicatiedatum ? 'Gepland op ' + esc(F().datumKort(i.publicatiedatum)) : 'Ter review') + '</span>' +
        '<div><button type="button" class="p-knop' + (n === 0 ? ' p-knop-hoofd' : '') + '" data-blog="' + esc(i.id) + '">Lezen en beoordelen</button></div></div>').join('') + '</div>';
    } else if (s.stand === 'nieuw' && s.merk.status === 'ok') {
      inhoud = '<div class="p-ov-todo"><div class="p-ov-todo-item"><b>Merkprofiel bevestigen</b><span class="p-ov-meta">' + s.merk.totaal + ' onderdelen</span><div><button type="button" class="p-knop p-knop-hoofd" data-tab="merkprofiel">Beginnen</button></div></div></div>';
    } else {
      inhoud = U_.legeStand({ soort: 'klaar', titel: 'Niets te doen', tekst: 'Nieuwe blogs ter review verschijnen hier.' });
    }
    return U_.kaart({ titel: 'Wacht op jou', aantal: s.review.length ? s.review.length : null, inhoud });
  }

  function merkKaart(s) {
    const U_ = U();
    const Fm = F();
    const rijen = [];
    if (s.merk.status === 'ok') {
      const klaar = s.merk.totaal > 0 && s.merk.bevestigd >= s.merk.totaal;
      rijen.push('<div class="p-ov-merk">' + ic('merk') + 'Merkprofiel' + U_.pil(klaar ? s.merk.bevestigd + ' van ' + s.merk.totaal + ' bevestigd' : s.merk.bevestigd + ' van ' + s.merk.totaal, klaar ? 'goed' : 'let-op') + '</div>');
    }
    if (s.kennis.status === 'ok') {
      rijen.push('<div class="p-ov-merk">' + ic('boek') + 'Kennisdocument' + (s.kennis.heeft ? U_.pil('Bijgewerkt ' + Fm.datumKort(s.kennis.bijgewerkt), 'goed') : U_.pil('Leeg', 'neutraal')) + '</div>');
    }
    if (!rijen.length) return '';
    return U_.kaart({ titel: 'Jullie merk', inhoud: rijen.join('') });
  }

  function feedKaart(s) {
    const Fm = F();
    const toonKlasse = { goed: 'goed', ai: 'ai', 'let-op': 'let-op' };
    const icoonVan = { goed: 'vinkje', ai: 'ai', 'let-op': 'let_op', grafiek: 'grafiek', boek: 'boek', merk: 'merk' };
    const inhoud = s.feed.length
      ? '<div class="p-ov-feed">' + s.feed.map((f) => '<div class="p-ov-ev"><span class="p-ov-ev-punt p-ov-ev-' + (toonKlasse[f.soort] || 'neutraal') + '">' + ic(icoonVan[f.soort] || 'vinkje') + '</span><div><div class="p-ov-ev-t">' + esc(f.tekst) + '</div><div class="p-ov-ev-s">' + esc(Fm.datumKort(f.datum)) + (f.sub ? ' · ' + esc(f.sub) : '') + '</div></div></div>').join('') + '</div>'
      : U().legeStand({ soort: 'wacht', titel: 'Nog niets gebeurd', tekst: 'Zodra de eerste blog live staat, zie je het hier.' });
    return U().kaart({ titel: 'Wat er gebeurde', inhoud });
  }

  function onderwerpKaart(s) {
    if (s.stand === 'nieuw' || !s.onderwerpen.length) return '';
    const Fm = F();
    const kaarten = s.onderwerpen.map((o) => {
      const tot = o.live + o.gepland;
      const hint = o.hint ? '<div class="p-ov-hint p-ov-hint-' + esc(o.hint.toon) + '">' + esc(o.hint.datum ? o.gepland + (o.gepland === 1 ? ' blog' : ' blogs') + ' gepland tot en met ' + Fm.maand(o.hint.datum) : o.hint.tekst) + '</div>' : '';
      return '<article class="p-ov-onderwerp"><div><h3>' + esc(o.naam) + '</h3><div class="p-ov-meta">' + o.live + ' live · ' + o.gepland + ' gepland</div></div>' +
        U().voortgang(tot ? [{ aandeel: (o.live / tot) * 100, toon: 'goed' }, { aandeel: (o.gepland / tot) * 100, toon: 'plan' }] : [], o.live + ' van ' + tot + ' live') +
        '<dl><div><dt>Google</dt><dd>' + esc(o.vertoningen != null ? Fm.getal(o.vertoningen) : '–') + '</dd></div><div><dt>AI noemt jullie</dt><dd>' + esc(o.aiPercentage != null ? Fm.procent(o.aiPercentage) : '–') + '</dd></div></dl>' + hint + '</article>';
    }).join('');
    return U().kaart({ titel: 'Onderwerpen', uitleg: 'Waar wij over schrijven en hoe het per onderwerp gaat', inhoud: '<div class="p-ov-onderwerpen">' + kaarten + '</div>' });
  }

  function skelet() {
    const b = (w, h) => '<div class="p-sk" style="width:' + w + ';height:' + h + 'px"></div>';
    const k = '<div class="p-kerncijfer">' + b('60%', 14) + b('40%', 34) + b('70%', 12) + '</div>';
    return '<div class="p-ov" aria-busy="true"><div class="p-ov-kop"><div><h1>Overzicht</h1><p>Even geduld, we halen jullie cijfers op.</p></div></div>' +
      '<section class="p-kaart" style="padding:20px">' + b('45%', 22) + '<div style="height:10px"></div>' + b('80%', 14) + '</section>' +
      '<section class="p-kerncijfers">' + k + k + k + k + '</section>' +
      '<div class="p-ov-raster2"><section class="p-kaart" style="padding:18px">' + b('100%', 180) + '</section><section class="p-kaart" style="padding:18px">' + b('100%', 120) + '</section></div></div>';
  }

  function bouwHtml(state, inv) {
    const M = window.OverzichtModel;
    const s = M.bouwStartscherm(inv, new Date().toISOString().slice(0, 10));
    const fouten = [];
    if (inv.google && inv.google.status === 'fout' && !inv.google.stand) fouten.push(U().foutStand({ titel: 'De Google cijfers laden even niet', tekst: 'De rest van het portaal werkt gewoon. Probeer het straks opnieuw.' }));
    return '<div class="p-ov">' + kop(s, state) + statusBalk(s, M, state) + fouten.join('') + kerncijfers(s) +
      '<div class="p-ov-raster2"><div class="p-ov-stapel">' + grafiekKaart(s) + planKaart(s) + '</div><div class="p-ov-stapel">' + wachtKaart(s) + merkKaart(s) + feedKaart(s) + '</div></div>' +
      onderwerpKaart(s) + '</div>';
  }

  function koppel(doel, openBlog) {
    doel.querySelectorAll('[data-blog]').forEach((k) => k.addEventListener('click', () => openBlog(k.dataset.blog)));
    doel.querySelectorAll('[data-tab]').forEach((k) => k.addEventListener('click', () => window.switchTab(k.dataset.tab)));
    doel.querySelectorAll('[data-actie="idee"]').forEach((k) => k.addEventListener('click', () => {
      window.switchTab('blogs');
      const knop = document.getElementById('newIdeaBtn');
      if (knop) knop.click();
    }));
  }

  async function renderOverzicht(state, badgeKlasse, openBlog) {
    const doel = document.getElementById('overzichtTab');
    if (!doel || !window.PortaalUI || !window.OverzichtModel) return;
    const mijn = ++teller;
    const id = state.clientId;
    const basis = { items: state.items, statusValues: state.statusValues, reviewEnabled: state.reviewEnabled };
    const naam = (document.getElementById('clientName') || {}).textContent || '';
    const st = { clientNaam: naam, ideaEnrichmentEnabled: state.ideaEnrichmentEnabled };
    // Eerste keer: skelet. Daarna meteen de laatst bekende cijfers tonen terwijl er ververst wordt.
    const cache = (sleutel) => (laatsteGoed[id + sleutel] ? { status: 'ok', data: laatsteGoed[id + sleutel].data } : null);
    const c = { google: cache('google'), ai: cache('ai'), merk: cache('merk'), kennis: cache('kennis') };
    if (c.ai || c.google) {
      doel.innerHTML = bouwHtml(st, { ...basis, google: c.google || { status: 'uit' }, ai: c.ai || { status: 'uit' }, merk: c.merk || { status: 'uit' }, kennis: c.kennis || { status: 'uit' } });
    } else {
      doel.innerHTML = skelet();
    }
    koppel(doel, openBlog);
    const [google, ai, merk, kennis] = await Promise.all([
      state.performanceEnabled ? haal('google', id, '/performance-v2') : Promise.resolve({ status: 'uit' }),
      haal('ai', id, '/ai-zichtbaarheid'),
      haal('merk', id, '/merkprofiel'),
      haal('kennis', id, '/kennisdocument')
    ]);
    if (mijn !== teller) return;
    // Een klant zonder deze dienst of een mislukte aanroep zonder oude stand: het onderdeel verdwijnt.
    const uit = (b) => (b.status === 'fout' && !b.stand ? { status: 'uit' } : b);
    doel.innerHTML = bouwHtml(st, { ...basis, google, ai: uit(ai), merk: uit(merk), kennis: uit(kennis) });
    koppel(doel, openBlog);
  }

  if (typeof window !== 'undefined') window.renderOverzicht = renderOverzicht;
  if (typeof module !== 'undefined' && module.exports) module.exports = { maakOverzicht };
})();
