// Portaal verhaal: bouwstenen voor de resultatentabbladen (Google en AI zichtbaarheid).
// Een tabblad is één verhaal van boven naar onder, in hoofdstukken langs een rode lijn.
// Alles hier geeft html terug. activeer() zet de beweging aan: verschijnen, tellen, de lijn die volgt en kantelende kaarten.
// Zonder JavaScript of met "minder beweging" aan staat alles gewoon op zijn plek.
(function () {
  const U = typeof window !== 'undefined' && window.PortaalUI ? window.PortaalUI : (typeof require !== 'undefined' ? require('./portaal-ui.js') : null);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl = (n, dec) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  const klem = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));

  // De wereld om het verhaal: gradient achtergrond met zachte vlekken, kop en de hoofdstukken.
  function wereld(o) {
    const opt = o || {};
    return '<div class="v-wereld" data-v-wereld>' +
      '<div class="v-achtergrond" aria-hidden="true"><i class="v-vlek v-vlek-1"></i><i class="v-vlek v-vlek-2"></i><i class="v-vlek v-vlek-3"></i></div>' +
      '<div class="v-kolom">' + (opt.kop || '') + '<div class="v-verhaal" data-v-verhaal><div class="v-spoor" aria-hidden="true"><i class="v-spoor-vul"></i></div>' + (opt.hoofdstukken || '') + '</div></div></div>';
  }

  // Kop op de gradient: titel, uitleg en rechts de acties (periode, bijgewerkt).
  function kop(o) {
    const opt = o || {};
    return '<header class="v-kop"><div class="v-kop-tekst"><h1>' + esc(opt.titel) + '</h1>' + (opt.tekst ? '<p>' + esc(opt.tekst) + '</p>' : '') + '</div>' +
      (opt.acties ? '<div class="v-kop-acties">' + opt.acties + '</div>' : '') + '</header>';
  }

  // Eén hoofdstuk: een knoop op de lijn, een korte kop in gewone taal en de inhoud.
  function hoofdstuk(o) {
    const opt = o || {};
    return '<section class="v-hoofdstuk v-in" data-v-hoofdstuk' + (opt.id ? ' id="' + esc(opt.id) + '"' : '') + '>' +
      '<div class="v-knoop" aria-hidden="true"><span>' + esc(opt.nr) + '</span></div>' +
      '<div class="v-hoofd"><span class="v-eyebrow">' + esc(opt.eyebrow || 'Hoofdstuk ' + opt.nr) + '</span><h2>' + esc(opt.titel) + '</h2>' + (opt.lead ? '<p>' + esc(opt.lead) + '</p>' : '') + '</div>' +
      '<div class="v-inhoud">' + (opt.inhoud || '') + '</div></section>';
  }

  // Raster binnen een hoofdstuk. kolommen: '2', '3' of 'groot' (grote kaart links, rest rechts).
  function raster(inhoud, soort) {
    return '<div class="v-raster v-raster-' + esc(soort || 'auto') + '">' + (inhoud || '') + '</div>';
  }

  // Glazen kaart met een getal. tel: een getal dat bij het verschijnen oploopt (waarde blijft de eindtekst).
  // o: { label, info, waarde, tel, decimalen, eenheid, delta {tekst,toon}, tekst, extra, leeg, groot, inhoud }
  function stat(o) {
    const opt = o || {};
    const d = opt.delta;
    const delta = d && d.tekst ? '<span class="v-delta v-delta-' + (['goed', 'slecht', 'gelijk'].includes(d.toon) ? d.toon : 'gelijk') + '">' + esc(d.tekst) + '</span>' : '';
    const waarde = opt.leeg ? 'Nog geen' : String(opt.waarde == null ? '' : opt.waarde);
    const tel = !opt.leeg && opt.tel != null && Number.isFinite(Number(opt.tel)) ? ' data-v-tel="' + Number(opt.tel) + '" data-v-dec="' + (opt.decimalen || 0) + '"' : '';
    const eenheid = opt.eenheid ? '<small>' + esc(opt.eenheid) + '</small>' : '';
    return '<article class="v-stat v-in' + (opt.leeg ? ' v-stat-leeg' : '') + (opt.groot ? ' v-stat-groot' : '') + '" data-v-tilt>' +
      '<div class="v-stat-kop"><span class="v-stat-label">' + esc(opt.label) + (U ? U.infoKnop(opt.info, opt.label) : '') + '</span>' + delta + '</div>' +
      '<div class="v-stat-waarde"><span' + tel + '>' + esc(waarde) + '</span>' + eenheid + '</div>' +
      (opt.leeg ? '<div class="v-meting"><i class="v-puls"></i>De meting loopt</div>' : '') +
      (opt.tekst ? '<p class="v-stat-tekst">' + esc(opt.tekst) + '</p>' : '') +
      (opt.extra ? '<p class="v-stat-tekst v-stat-extra">' + esc(opt.extra) + '</p>' : '') +
      (opt.inhoud || '') + '</article>';
  }

  // Dunne balk met aandeel, groeit bij het verschijnen.
  function balk(aandeel, uitleg) {
    return '<div class="v-balk" role="img" aria-label="' + esc(uitleg || 'Aandeel') + '"><i style="--v-breedte:' + klem(aandeel, 0, 100) + '%"></i></div>';
  }

  // Positiemeter: waar staan de hoofdzoekwoorden. positie is het gemiddelde (1 is bovenaan). Pagina 1 is 1 tot 10.
  function positieMeter(positie) {
    if (positie == null || !Number.isFinite(Number(positie))) return '';
    const max = 30;
    const links = klem((Number(positie) / max) * 100, 2, 98);
    return '<div class="v-meter" role="img" aria-label="Gemiddelde positie ' + esc(nl(positie, 1)) + '"><div class="v-meter-baan"><i class="v-meter-goed"></i></div><i class="v-meter-punt" style="--v-links:' + links + '%"></i>' +
      '<div class="v-meter-assen"><span>Pagina 1</span><span>Pagina 2</span><span>Pagina 3</span></div></div>';
  }

  // Ring met percentage. De boog loopt in bij het verschijnen.
  function ring(pct, naam, sub, info) {
    const p = klem(pct, 0, 100);
    const R = 42, C = Math.round(2 * Math.PI * R * 10) / 10;
    return '<div class="v-ring v-in" data-v-tilt><svg viewBox="0 0 100 100" role="img" aria-label="' + esc(naam + ': ' + Math.round(p) + ' procent') + '"><circle class="v-ring-baan" cx="50" cy="50" r="' + R + '" fill="none" stroke-width="9"/>' +
      (p > 0 ? '<circle class="v-ring-boog" cx="50" cy="50" r="' + R + '" fill="none" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + C + '" style="--v-omtrek:' + C + ';--v-rest:' + (Math.round(C * (100 - p)) / 100) + '" transform="rotate(-90 50 50)"/>' : '') +
      '<text x="50" y="58" text-anchor="middle">' + Math.round(p) + '%</text></svg>' +
      '<b>' + esc(naam) + (U ? U.infoKnop(info, naam) : '') + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>';
  }

  // Vlakgrafiek op een lichte kaart. punten: [{ label, waarde, deels, nieuw }]. De lijn tekent zichzelf bij het verschijnen.
  // Met de muis (of een vinger) over de grafiek zie je per week de exacte waarde, het verschil met de week ervoor en of er een blog live ging.
  function vlak(punten, o) {
    const opt = o || {};
    const lijst = (Array.isArray(punten) ? punten : []).map((p) => ({ label: String(p.label == null ? '' : p.label), waarde: Math.max(0, Number(p.waarde) || 0), deels: Boolean(p.deels), nieuw: p.nieuw || '' }));
    if (lijst.length < 2) return '';
    const W = 640, H = 220, top = 30, bodem = 14;
    const max = Math.max.apply(null, lijst.map((p) => p.waarde)) || 1;
    const xy = lijst.map((p, i) => [Math.round(i / (lijst.length - 1) * W), Math.round(H - bodem - (p.waarde / max) * (H - top - bodem))]);
    const pad = xy.map((c, i) => (i ? 'L' : 'M') + c[0] + ',' + c[1]).join(' ');
    const hi = lijst.reduce((m, p, i) => (p.waarde > lijst[m].waarde ? i : m), 0);
    const id = 'vVlak' + (opt.id || '1');
    const aria = (opt.aria || 'Grafiek') + ': van ' + nl(lijst[0].waarde) + ' naar ' + nl(lijst[lijst.length - 1].waarde) + ', hoogste ' + nl(lijst[hi].waarde) + '. Beweeg over de grafiek voor de waarde per ' + (opt.periode === 'maand' ? 'maand' : 'week') + '.';
    const data = lijst.map((p, i) => ({ l: p.label, w: p.waarde, x: Math.round(xy[i][0] / W * 1000) / 10, y: Math.round(xy[i][1] / H * 1000) / 10, d: p.deels, n: p.nieuw }));
    const aantalLabels = Math.min(6, lijst.length);
    const labels = Array.from({ length: aantalLabels }, (_, k) => Math.round(k * (lijst.length - 1) / Math.max(1, aantalLabels - 1)))
      .filter((v, k, arr) => arr.indexOf(v) === k)
      .map((i) => '<span style="left:' + data[i].x + '%">' + esc((lijst[i].label || '').replace(/^Week van /, '')) + '</span>').join('');
    const nieuwStippen = data.filter((p) => p.n).map((p) => '<i class="v-vlak-blog" style="left:' + p.x + '%;top:' + p.y + '%" aria-hidden="true"></i>').join('');
    return '<div class="v-vlak" data-v-punten="' + esc(JSON.stringify(data)) + '" data-v-eenheid="' + esc(opt.eenheid || '') + '" data-v-periode="' + esc(opt.periode || 'week') + '"><span class="v-vlak-titel">' + esc(opt.titel || '') + '</span>' +
      '<div class="v-vlak-doek"><span class="v-vlak-y v-vlak-y-top">' + esc(nl(max)) + '</span><span class="v-vlak-y v-vlak-y-nul">0</span>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(aria) + '"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3951" stop-opacity=".30"/><stop offset="1" stop-color="#ff3951" stop-opacity="0"/></linearGradient></defs>' +
      '<g class="v-vlak-raster"><line x1="0" y1="' + top + '" x2="' + W + '" y2="' + top + '"/><line x1="0" y1="' + Math.round((top + H - bodem) / 2) + '" x2="' + W + '" y2="' + Math.round((top + H - bodem) / 2) + '"/><line x1="0" y1="' + (H - bodem) + '" x2="' + W + '" y2="' + (H - bodem) + '"/></g>' +
      '<path class="v-vlak-vul" d="' + pad + ' L' + W + ',' + H + ' L0,' + H + ' Z" fill="url(#' + id + ')"/>' +
      '<path class="v-vlak-lijn" pathLength="1" d="' + pad + '" fill="none" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>' +
      nieuwStippen + '<i class="v-vlak-cursor" aria-hidden="true"></i><i class="v-vlak-punt" aria-hidden="true"></i><div class="v-tip" role="status"></div></div>' +
      '<div class="v-vlak-x" aria-hidden="true">' + labels + '</div>' +
      (nieuwStippen ? '<span class="v-vlak-sleutel"><i class="v-vlak-blog v-vlak-blog-uit"></i>Een nieuwe blog ging live</span>' : '') + '</div>';
  }

  // Staven per week. De laatste staaf is de week die nog loopt (lichter). Muis of vinger erop toont de exacte waarde.
  function staven(weken, o) {
    const opt = o || {};
    const lijst = (Array.isArray(weken) ? weken : []).map((w) => ({ label: String(w.label == null ? '' : w.label), waarde: Math.max(0, Number(w.waarde) || 0), deels: Boolean(w.deels), nieuw: w.nieuw || '' }));
    if (!lijst.length) return '';
    const max = Math.max.apply(null, lijst.map((w) => w.waarde)) || 1;
    const stap = Math.max(1, Math.ceil(lijst.length / 6));
    return '<div class="v-staven" data-v-eenheid="' + esc(opt.eenheid || '') + '" data-v-periode="' + esc(opt.periode || 'week') + '"><span class="v-vlak-titel">' + esc(opt.titel || '') + '</span><div class="v-staven-doek"><div class="v-staven-rij">' + lijst.map((w, i) => {
      const vorig = i ? lijst[i - 1].waarde : null;
      const tip = { l: w.label, w: w.waarde, v: vorig, d: w.deels, n: w.nieuw };
      return '<div class="v-staaf-kolom" tabindex="0" data-v-tip="' + esc(JSON.stringify(tip)) + '"><span class="v-staaf-val">' + (w.waarde ? esc(nl(w.waarde)) : '') + '</span>' +
        '<div class="v-staaf-vak"><i class="v-staaf' + (w.deels ? ' v-staaf-deels' : '') + '" style="--v-hoogte:' + (w.waarde ? Math.max(3, Math.round(w.waarde / max * 100)) : 0) + '%"></i></div>' +
        '<span class="v-staaf-stip' + (w.nieuw ? ' v-staaf-stip-aan' : '') + '"></span><span class="v-staaf-lbl">' + (i % stap === 0 ? esc(w.label.replace(/^Week van /, '')) : '') + '</span></div>';
    }).join('') + '</div><div class="v-tip" role="status"></div></div></div>';
  }

  // Inklapbare kaart voor lange lijsten. open: staat open bij het laden. aantal: klein getal naast de titel.
  function inklap(o) {
    const opt = o || {};
    return '<details class="v-inklap v-in"' + (opt.open ? ' open' : '') + '><summary><span class="v-inklap-titel">' + esc(opt.titel) + '</span>' +
      (opt.aantal != null ? '<span class="v-inklap-aantal">' + esc(opt.aantal) + '</span>' : '') + '<span class="v-inklap-teken" aria-hidden="true"></span></summary>' +
      (opt.uitleg ? '<p class="v-inklap-uitleg">' + esc(opt.uitleg) + '</p>' : '') + '<div class="v-inklap-body">' + (opt.inhoud || '') + '</div></details>';
  }

  // Uitleg in drie stappen, bij het hoofdstuk over contact. Opent en sluit.
  function uitleg(o) {
    const opt = o || {};
    return '<details class="v-uitleg v-in"><summary>' + esc(opt.titel) + '</summary><div class="v-uitleg-inhoud">' + (opt.inhoud || '') + '</div></details>';
  }

  // ---------- Beweging ----------
  const opruimers = new WeakMap();

  function activeer(w) {
    if (!w || typeof window === 'undefined') return;
    if (opruimers.has(w)) { opruimers.get(w)(); opruimers.delete(w); }
    const minder = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const verhaal = w.querySelector('[data-v-verhaal]');
    const tellers = (wortel) => Array.from(wortel.querySelectorAll('[data-v-tel]'));
    const tel = (el) => {
      const doel = Number(el.getAttribute('data-v-tel'));
      const dec = Number(el.getAttribute('data-v-dec')) || 0;
      const eind = el.textContent;
      if (minder || !Number.isFinite(doel)) { el.textContent = eind; return; }
      const start = performance.now();
      const duur = 900;
      const stap = (nu) => {
        const t = Math.min(1, (nu - start) / duur);
        const e = 1 - Math.pow(1 - t, 3);
        el.textContent = t < 1 ? nl(doel * e, dec) : eind;
        if (t < 1 && document.contains(el)) requestAnimationFrame(stap);
      };
      requestAnimationFrame(stap);
      setTimeout(() => { el.textContent = eind; }, duur + 150);
    };

    // Verschijnen: eerst verbergen (alleen als JS draait), dan per stuk laten komen.
    if (!minder && 'IntersectionObserver' in window) {
      w.classList.add('v-js');
      w.querySelectorAll('.v-inhoud').forEach((inh) => Array.from(inh.querySelectorAll('.v-in')).forEach((el, i) => el.style.setProperty('--v-i', String(Math.min(i, 8)))));
      const io = new IntersectionObserver((lijst) => {
        lijst.forEach((r) => {
          if (!r.isIntersecting) return;
          r.target.classList.add('v-zichtbaar');
          tellers(r.target).forEach(tel);
          io.unobserve(r.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      w.querySelectorAll('.v-in').forEach((el) => io.observe(el));
      opruimers.set(w, () => io.disconnect());
    } else {
      w.classList.remove('v-js');
    }

    // De lijn volgt de lezer, de knopen lichten op en de achtergrond schuift mee.
    let wacht = false;
    const bijScroll = () => {
      if (wacht) return;
      wacht = true;
      requestAnimationFrame(() => {
        wacht = false;
        if (!document.contains(w)) return;
        const vh = window.innerHeight || 800;
        if (verhaal) {
          const r = verhaal.getBoundingClientRect();
          const voortgang = klem(((vh * 0.55 - r.top) / Math.max(1, r.height)) * 100, 0, 100);
          verhaal.style.setProperty('--v-voortgang', voortgang.toFixed(1) + '%');
          verhaal.querySelectorAll('[data-v-hoofdstuk]').forEach((h) => h.classList.toggle('v-actief', h.getBoundingClientRect().top < vh * 0.6));
        }
        if (!minder) w.style.setProperty('--v-scroll', String(Math.round(-w.getBoundingClientRect().top)));
      });
    };
    window.addEventListener('scroll', bijScroll, { passive: true });
    window.addEventListener('resize', bijScroll);
    bijScroll();

    // Kantelen: kaarten draaien licht mee met de muis. Geen glans over de tekst heen.
    const fijn = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const beweeg = (e) => {
      const k = e.target.closest && e.target.closest('[data-v-tilt]');
      if (!k) return;
      const r = k.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      k.style.setProperty('--v-ry', ((x - 0.5) * 4).toFixed(2) + 'deg');
      k.style.setProperty('--v-rx', ((0.5 - y) * 4).toFixed(2) + 'deg');
      k.classList.add('v-kantel');
    };
    const weg = (e) => {
      const k = e.target.closest && e.target.closest('[data-v-tilt]');
      if (!k) return;
      k.classList.remove('v-kantel');
      k.style.removeProperty('--v-rx');
      k.style.removeProperty('--v-ry');
    };
    if (fijn && !minder) {
      w.addEventListener('pointermove', beweeg);
      w.addEventListener('pointerout', weg);
    }

    // Grafieken: muis of vinger toont de exacte waarde per week.
    const tipTekst = (p, eenheid, vorig, periode) => {
      const per = periode === 'maand' ? 'maand' : 'week';
      let t = '<b>' + nl(p.w) + '</b>' + (eenheid ? ' ' + esc(eenheid) : '') + '<span>' + esc(p.l) + (p.d ? ' (' + per + ' loopt nog)' : '') + '</span>';
      if (vorig !== null && vorig !== undefined) {
        const delta = p.w - vorig;
        t += '<span>' + (delta === 0 ? 'Gelijk aan de ' + per + ' ervoor' : (delta > 0 ? '+' : '−') + nl(Math.abs(delta)) + ' t.o.v. de ' + per + ' ervoor') + '</span>';
      }
      if (p.n) t += '<span class="v-tip-blog">Nieuwe blog: ' + esc(p.n) + '</span>';
      return t;
    };
    const zetTip = (tip, html, linksPx, breedte) => {
      tip.innerHTML = html;
      tip.classList.add('v-tip-aan');
      const tb = tip.offsetWidth;
      tip.style.left = Math.max(tb / 2 + 4, Math.min(breedte - tb / 2 - 4, linksPx)) + 'px';
    };
    const grafiekHover = (e) => {
      const vlak = e.target.closest && e.target.closest('.v-vlak[data-v-punten]');
      if (vlak) {
        const doek = vlak.querySelector('.v-vlak-doek');
        const r = doek.getBoundingClientRect();
        if (!vlak._punten) { try { vlak._punten = JSON.parse(vlak.getAttribute('data-v-punten')); } catch (err) { vlak._punten = []; } }
        const pts = vlak._punten;
        if (!pts.length || e.clientY < r.top - 40 || e.clientY > r.bottom + 40) return;
        const rel = klem((e.clientX - r.left) / r.width, 0, 1) * 100;
        let best = 0;
        pts.forEach((p, i) => { if (Math.abs(p.x - rel) < Math.abs(pts[best].x - rel)) best = i; });
        const p = pts[best];
        const cur = doek.querySelector('.v-vlak-cursor');
        const dot = doek.querySelector('.v-vlak-punt');
        cur.style.left = p.x + '%'; cur.classList.add('v-aan');
        dot.style.left = p.x + '%'; dot.style.top = p.y + '%'; dot.classList.add('v-aan');
        zetTip(doek.querySelector('.v-tip'), tipTekst(p, vlak.getAttribute('data-v-eenheid'), best ? pts[best - 1].w : null, vlak.getAttribute('data-v-periode')), (p.x / 100) * r.width, r.width);
        return;
      }
      const kol = e.target.closest && e.target.closest('[data-v-tip]');
      if (kol) {
        const doek = kol.closest('.v-staven-doek');
        let p; try { p = JSON.parse(kol.getAttribute('data-v-tip')); } catch (err) { return; }
        const dr = doek.getBoundingClientRect();
        const kr = kol.getBoundingClientRect();
        doek.querySelectorAll('.v-staaf-kolom.v-aan').forEach((x) => x.classList.remove('v-aan'));
        kol.classList.add('v-aan');
        zetTip(doek.querySelector('.v-tip'), tipTekst(p, kol.closest('.v-staven').getAttribute('data-v-eenheid'), p.v, kol.closest('.v-staven').getAttribute('data-v-periode')), kr.left - dr.left + kr.width / 2, dr.width);
      }
    };
    const grafiekWeg = (e) => {
      const c = e.target.closest && e.target.closest('.v-vlak[data-v-punten], .v-staven');
      if (!c || (e.relatedTarget && c.contains(e.relatedTarget))) return;
      c.querySelectorAll('.v-aan').forEach((x) => x.classList.remove('v-aan'));
      const t = c.querySelector('.v-tip');
      if (t) t.classList.remove('v-tip-aan');
    };
    w.addEventListener('pointermove', grafiekHover);
    w.addEventListener('pointerdown', grafiekHover);
    w.addEventListener('focusin', grafiekHover);
    w.addEventListener('pointerout', grafiekWeg);
    w.addEventListener('focusout', grafiekWeg);
    const eerder = opruimers.get(w);
    opruimers.set(w, () => {
      if (eerder) eerder();
      window.removeEventListener('scroll', bijScroll);
      window.removeEventListener('resize', bijScroll);
      w.removeEventListener('pointermove', beweeg);
      w.removeEventListener('pointerout', weg);
      w.removeEventListener('pointermove', grafiekHover);
      w.removeEventListener('pointerdown', grafiekHover);
      w.removeEventListener('focusin', grafiekHover);
      w.removeEventListener('pointerout', grafiekWeg);
      w.removeEventListener('focusout', grafiekWeg);
    });
  }

  const api = { wereld, kop, hoofdstuk, raster, stat, balk, positieMeter, ring, vlak, staven, inklap, uitleg, activeer };
  if (typeof window !== 'undefined') window.PortaalVerhaal = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
