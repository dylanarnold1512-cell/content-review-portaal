// Bouwstenen van het portaal (Fase 7): kaart, kerncijfer, pil, voortgangsbalk, lege stand,
// foutstand en laadstand. Elke functie geeft HTML terug en zet alle tekst van buiten door esc().
// De bijbehorende stijl staat in portaal.css (alle klassen beginnen met p-).
// Tabbladen die nieuw worden opgebouwd gebruiken alleen deze functies, zodat ze er overal gelijk uitzien.
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Vaste betekenis van kleur in het hele portaal. Onbekende tonen vallen terug op neutraal.
  const TONEN = ['plan', 'goed', 'let-op', 'fout', 'neutraal', 'ai'];
  const toon = (t) => (TONEN.includes(t) ? t : 'neutraal');

  const ICONEN = {
    oog: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    mensen: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .6 3.2 2.6 3.6 5.4"/>',
    blad: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    ai: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    vinkje: '<path d="M5 12.5 10 17 19 7"/>',
    klok: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    let_op: '<path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
    pijl: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    euro: '<path d="M17 6.5a6.5 6.5 0 1 0 0 11"/><path d="M4 10.5h9M4 13.5h9"/>',
    zoek: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'
  };

  function icoon(naam) {
    const pad = ICONEN[naam];
    if (!pad) return '';
    return '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true">' + pad + '</svg>';
  }

  function pil(tekst, t) {
    return '<span class="p-pil p-pil-' + toon(t) + '">' + esc(tekst) + '</span>';
  }

  // delen: [{ aandeel (0 tot 100), toon }]. Samen maximaal 100.
  function voortgang(delen, uitleg) {
    const lijst = Array.isArray(delen) ? delen : [];
    const balken = lijst.map((d) => {
      const breedte = Math.max(0, Math.min(100, Number(d.aandeel) || 0));
      return '<i class="p-balk-' + toon(d.toon) + '" style="width:' + breedte + '%"></i>';
    }).join('');
    return '<div class="p-voortgang" role="img" aria-label="' + esc(uitleg || 'Voortgang') + '">' + balken + '</div>';
  }

  // Kleine staafjes bij een kerncijfer. De laatste staaf is de huidige stand.
  function staafjes(waarden) {
    const lijst = (Array.isArray(waarden) ? waarden : []).map((v) => Math.max(0, Number(v) || 0));
    if (!lijst.length) return '';
    const max = Math.max.apply(null, lijst) || 1;
    return '<div class="p-staafjes" aria-hidden="true">' + lijst.map((v) => '<i style="height:' + Math.max(2, Math.round(v / max * 30)) + 'px"></i>').join('') + '</div>';
  }

  // Kaart met vaste kop: titel links, korte uitleg eronder, één actie rechts.
  // actie: { tekst, tab } waarbij tab het tabblad is waar de link naartoe gaat (data-tab).
  function kaart(o) {
    const opt = o || {};
    const uitleg = opt.uitleg ? '<div class="p-kaart-uitleg">' + esc(opt.uitleg) + '</div>' : '';
    const kop = opt.titel
      ? '<div class="p-kaart-kop"><div class="p-kaart-titel-blok"><h2 class="p-kaart-titel">' + esc(opt.titel) + '</h2>' + uitleg + '</div>' +
        (opt.aantal != null ? '<span class="p-kaart-aantal">' + esc(opt.aantal) + '</span>' : '') +
        (opt.actie ? '<button type="button" class="p-link" data-tab="' + esc(opt.actie.tab) + '">' + esc(opt.actie.tekst) + ' ' + icoon('pijl') + '</button>' : '') +
        '</div>'
      : '';
    return '<section class="p-kaart' + (opt.klasse ? ' ' + esc(opt.klasse) : '') + '">' + kop + '<div class="p-kaart-inhoud">' + (opt.inhoud || '') + '</div></section>';
  }

  // i icoon met uitleg. Opent bij hover, focus en klik. tekst is gewone tekst (wordt ge-escaped).
  function infoKnop(tekst, label) {
    if (!tekst) return '';
    return '<span class="p-info"><button type="button" class="p-info-knop" data-p-info aria-expanded="false" aria-label="Uitleg: ' + esc(label) + '">i</button>' +
      '<span class="p-info-pop" role="tooltip">' + esc(tekst) + '</span></span>';
  }

  // Eén kerncijfer. waarde en vergelijking zijn al opgemaakte tekst (zie portaal-format.js).
  // verschil: { tekst, toon } uit PortaalFormat.verschil, toon 'goed', 'slecht' of 'gelijk'.
  function kerncijfer(o) {
    const opt = o || {};
    const v = opt.verschil;
    const vTekst = v ? '<span class="p-verschil p-verschil-' + (['goed', 'slecht', 'gelijk'].includes(v.toon) ? v.toon : 'gelijk') + '">' + esc(v.tekst) + '</span>' : '';
    const eenheid = opt.eenheid ? '<small>' + esc(opt.eenheid) + '</small>' : '';
    return '<div class="p-kerncijfer">' +
      '<div class="p-kerncijfer-kop"><span class="p-kerncijfer-icoon' + (opt.toon === 'ai' ? ' p-kerncijfer-icoon-ai' : '') + '">' + icoon(opt.icoon) + '</span><span class="p-kerncijfer-label">' + esc(opt.label) + infoKnop(opt.info, opt.label) + '</span>' + vTekst + '</div>' +
      '<div class="p-kerncijfer-rij"><div class="p-kerncijfer-waarde">' + esc(opt.waarde) + eenheid + '</div>' + staafjes(opt.staafjes) + '</div>' +
      (opt.vergelijking ? '<div class="p-kerncijfer-sub">' + esc(opt.vergelijking) + '</div>' : '') +
      (opt.extra ? '<div class="p-kerncijfer-sub">' + esc(opt.extra) + '</div>' : '') +
      '</div>';
  }

  function kerncijfers(lijst) {
    return '<section class="p-kerncijfers">' + (Array.isArray(lijst) ? lijst.map(kerncijfer).join('') : '') + '</section>';
  }

  // Lege stand: zegt wat er hoort te staan en waarom het er nog niet is. Nooit een kale lege pagina.
  // soort: 'klaar' (er is niets te doen), 'wacht' (komt later), 'neutraal'.
  function legeStand(o) {
    const opt = o || {};
    const soort = ['klaar', 'wacht', 'neutraal'].includes(opt.soort) ? opt.soort : 'neutraal';
    const ic = soort === 'klaar' ? icoon('vinkje') : soort === 'wacht' ? icoon('klok') : icoon('blad');
    return '<div class="p-leeg"><span class="p-leeg-icoon p-leeg-' + soort + '">' + ic + '</span><div><b>' + esc(opt.titel) + '</b>' +
      (opt.tekst ? '<span>' + esc(opt.tekst) + '</span>' : '') + '</div></div>';
  }

  // Foutstand: zegt wat er aan de hand is en wat wel doorloopt. De laatst bekende cijfers blijven staan.
  function foutStand(o) {
    const opt = o || {};
    return '<div class="p-fout" role="status">' + icoon('let_op') + '<div><b>' + esc(opt.titel) + '</b>' + (opt.tekst ? '<span>' + esc(opt.tekst) + '</span>' : '') + '</div></div>';
  }

  // Waarschuwing in het klein, onder een cijfer dat niet vers is: "Stand van 12 okt."
  function oudeStand(tekst) {
    return '<div class="p-oudestand" role="status">' + icoon('let_op') + '<span>' + esc(tekst) + '</span></div>';
  }

  // Laadstand: grijze blokken in de vorm van de kaarten, geen draaiend icoon.
  function laden(blokken) {
    const lijst = Array.isArray(blokken) && blokken.length ? blokken : [{ breedte: '40%', hoogte: 22 }, { breedte: '100%', hoogte: 90 }];
    return '<div class="p-laden" aria-busy="true" aria-label="Even laden">' + lijst.map((b) => {
      const breedte = /^\d{1,3}(%|px)$/.test(String(b.breedte)) ? b.breedte : '100%';
      const hoogte = Math.max(8, Math.min(400, Number(b.hoogte) || 16));
      return '<div class="p-sk" style="width:' + breedte + ';height:' + hoogte + 'px"></div>';
    }).join('') + '</div>';
  }

  // Ontwerp Advertisr: hero bovenaan een resultatentabblad. Eén grote stand, een korte zin en rechts een grafiek of ringen.
  // o: { toon 'merk'|'ai', eyebrow, getal, badge: { tekst, toon }, tekst, rechts (al opgemaakte html) }
  function hero(o) {
    const opt = o || {};
    const b = opt.badge;
    const badge = b && b.tekst ? '<span class="p-hero-badge p-hero-badge-' + (['goed', 'slecht', 'gelijk'].includes(b.toon) ? b.toon : 'gelijk') + '">' + esc(b.tekst) + '</span>' : '';
    return '<section class="p-hero p-hero-' + (opt.toon === 'ai' ? 'ai' : 'merk') + '">' +
      '<div class="p-hero-links"><span class="p-hero-eyebrow">' + esc(opt.eyebrow) + '</span>' +
      '<div class="p-hero-getalrij"><span class="p-hero-getal">' + esc(opt.getal) + '</span>' + badge + '</div>' +
      (opt.tekst ? '<p class="p-hero-tekst">' + esc(opt.tekst) + '</p>' : '') + '</div>' +
      (opt.rechts ? '<div class="p-hero-rechts">' + opt.rechts + '</div>' : '') + '</section>';
  }

  // Vlakgrafiek (SVG) voor de hero. punten: [{ label, waarde }]. Geeft een lege tekst bij minder dan twee punten.
  function lijn(punten, o) {
    const opt = o || {};
    const lijst = (Array.isArray(punten) ? punten : []).map((p) => ({ label: String(p.label == null ? '' : p.label), waarde: Math.max(0, Number(p.waarde) || 0) }));
    if (lijst.length < 2) return '';
    const W = 640, H = 190, top = 34, bodem = 12;
    const max = Math.max.apply(null, lijst.map((p) => p.waarde)) || 1;
    const xy = lijst.map((p, i) => [Math.round(i / (lijst.length - 1) * W), Math.round(H - bodem - (p.waarde / max) * (H - top - bodem))]);
    const pad = xy.map((c, i) => (i ? 'L' : 'M') + c[0] + ',' + c[1]).join(' ');
    const l = xy[xy.length - 1];
    const maxIdx = lijst.reduce((m, p, i) => (p.waarde > lijst[m].waarde ? i : m), 0);
    const hoog = xy[maxIdx];
    const ankerX = Math.min(Math.max(hoog[0], 24), W - 24);
    const nl = (n) => Number(n).toLocaleString('nl-NL');
    const aria = (opt.aria || 'Grafiek') + ': van ' + nl(lijst[0].waarde) + ' naar ' + nl(lijst[lijst.length - 1].waarde) + ', hoogste ' + nl(lijst[maxIdx].waarde);
    return '<div class="p-hero-grafiek"><span class="p-hero-grafiek-titel">' + esc(opt.titel || '') + '</span>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(aria) + '"><defs><linearGradient id="pHeroVlak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a98" stop-opacity=".55"/><stop offset="1" stop-color="#ff8a98" stop-opacity="0"/></linearGradient></defs>' +
      '<g stroke="#ffffff" stroke-opacity=".12"><line x1="0" y1="' + top + '" x2="' + W + '" y2="' + top + '"/><line x1="0" y1="' + Math.round((top + H - bodem) / 2) + '" x2="' + W + '" y2="' + Math.round((top + H - bodem) / 2) + '"/><line x1="0" y1="' + (H - bodem) + '" x2="' + W + '" y2="' + (H - bodem) + '"/></g>' +
      '<path d="' + pad + ' L' + W + ',' + H + ' L0,' + H + ' Z" fill="url(#pHeroVlak)"/>' +
      '<path d="' + pad + '" fill="none" stroke="#ffd0d6" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + hoog[0] + '" cy="' + hoog[1] + '" r="12" fill="#fff" fill-opacity=".2"/><circle cx="' + hoog[0] + '" cy="' + hoog[1] + '" r="6" fill="#fff"/>' +
      '<text x="' + ankerX + '" y="' + Math.max(14, hoog[1] - 16) + '" fill="#fff" font-size="13" font-weight="600" text-anchor="middle">' + esc(nl(lijst[maxIdx].waarde)) + '</text></svg></div>';
  }

  // Ring met percentage, voor de AI hero. pct 0 tot 100.
  function ring(pct, naam, sub) {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    const R = 42, C = Math.round(2 * Math.PI * R * 10) / 10;
    return '<div class="p-ring"><svg viewBox="0 0 100 100" width="104" height="104" role="img" aria-label="' + esc(naam + ': ' + Math.round(p) + ' procent') + '"><circle cx="50" cy="50" r="' + R + '" fill="none" stroke="#ffffff" stroke-opacity=".16" stroke-width="9"/>' +
      (p > 0 ? '<circle cx="50" cy="50" r="' + R + '" fill="none" stroke="#ffd0d6" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + (Math.round(C * p) / 100) + ' ' + C + '" transform="rotate(-90 50 50)"/>' : '') +
      '<text x="50" y="57" fill="#fff" font-size="22" font-weight="600" text-anchor="middle">' + Math.round(p) + '%</text></svg>' +
      '<b>' + esc(naam) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>';
  }

  // De route van zoekresultaat of AI tot aanvraag. stappen: [{ label, waarde, tekst, info, aandeel 0 tot 100, leeg }].
  // Een lege stap (leeg: true) krijgt een gestippelde rand en 'Nog geen', zodat nul nooit als fout leest.
  function route(o) {
    const opt = o || {};
    const stappen = (opt.stappen || []).map((s, i) => {
      const breedte = Math.max(0, Math.min(100, Number(s.aandeel) || 0));
      return '<div class="p-route-stap' + (s.leeg ? ' p-route-leeg' : '') + '">' +
        '<span class="p-route-label">' + (i + 1) + '. ' + esc(s.label) + infoKnop(s.info, s.label) + '</span>' +
        '<span class="p-route-waarde">' + esc(s.leeg ? 'Nog geen' : s.waarde) + '</span>' +
        '<div class="p-route-balk"><i style="width:' + (s.leeg ? 0 : Math.max(breedte, s.waarde ? 3 : 0)) + '%"></i></div>' +
        (s.tekst ? '<span class="p-route-tekst">' + esc(s.tekst) + '</span>' : '') + '</div>';
    }).join('');
    return '<section class="p-kaart p-route"><div class="p-route-kop"><h2 class="p-kaart-titel">' + esc(opt.titel) + '</h2>' +
      (opt.uitleg ? '<span class="p-route-uitleg">' + esc(opt.uitleg) + '</span>' : '') + '</div>' +
      '<div class="p-route-stappen" style="--p-stappen:' + Math.max(1, (opt.stappen || []).length) + '">' + stappen + '</div></section>';
  }

  // Klik op een i opent of sluit de uitleg. Klik ergens anders sluit alles. Eén keer per pagina gekoppeld.
  if (typeof document !== 'undefined' && !window.__pInfoGekoppeld) {
    window.__pInfoGekoppeld = true;
    document.addEventListener('click', (e) => {
      const knop = e.target.closest && e.target.closest('[data-p-info]');
      document.querySelectorAll('.p-info.p-info-open').forEach((x) => {
        if (!knop || x !== knop.parentNode) { x.classList.remove('p-info-open'); x.firstChild.setAttribute('aria-expanded', 'false'); }
      });
      if (knop) {
        const open = knop.parentNode.classList.toggle('p-info-open');
        knop.setAttribute('aria-expanded', String(open));
      }
    });
  }

  const api = { esc, icoon, pil, voortgang, staafjes, kaart, kerncijfer, kerncijfers, infoKnop, hero, lijn, ring, route, legeStand, foutStand, oudeStand, laden };
  if (typeof window !== 'undefined') window.PortaalUI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
