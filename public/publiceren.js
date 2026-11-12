// Publiceren (12-11-2026): de klant kiest of hij blogs zelf nakijkt of dat wij ze na onze controle
// automatisch plaatsen. Drie onderdelen:
//   1. het tabblad Publiceren (schakelaar aan/uit, met inkijktijd of direct, inkijktijd 24/48/72 uur);
//   2. in het blogdetail: het aftellen met de knop Even tegenhouden (alleen bij een geplande blog);
//   3. in het blogdetail: het controlerapport met de 12 punten van de QA Gate (BA - QA Gate - Shared).
// De 12 punten volgen de echte controles van de QA Gate: 9 uit de AI check en 3 vaste checks
// (verzonnen ervaring, verboden termen, plaatsing van adres). Opbouw, koppen en lengte zijn samen 1 punt.
// Pas deze lijst aan als de QA Gate verandert.
(function () {
  const CONTROLEPUNTEN = [
    'Feiten kloppen met jullie gegevens en kennisdocument',
    'Genoemde bronnen kloppen en passen bij het onderwerp',
    'Geen taal of spelfouten',
    'Geen onnodige herhaling',
    'Sluit aan op waar de lezer naar zoekt',
    'Past bij jullie bedrijf, zonder geforceerde opsomming',
    'Geen andere bedrijven of merken bij naam',
    'Veelgestelde vragen kloppen en herhalen niets',
    'Geen verzonnen ervaringen van jullie bedrijf',
    'Geen woorden die jullie niet willen gebruiken',
    'Adres en bereikbaarheid alleen op de juiste plek',
    'Opbouw, koppen en lengte kloppen'
  ];
  // Vanaf deze datum gaat elke blog door de QA Gate. Oudere blogs krijgen geen controlerapport.
  const QA_SINDS = '2026-09-18';

  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICOON = {
    vink: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    schild: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    pauze: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>',
    zoek: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    pen: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    schakel: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12h10"/><rect x="2" y="6" width="20" height="12" rx="6"/></svg>',
    info: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    raket: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
    agenda: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
  };

  // De mail linkt naar de blog met ?actie=tegenhouden. Bewaren bij het laden, want het adres verandert daarna.
  let startActie = new URLSearchParams(window.location.search).get('actie');
  let clientId = '';
  let stand = null; // laatst geladen instellingen van de server
  let keuze = null; // wat de klant op het scherm heeft gekozen

  async function vraag(pad, opties) {
    const res = await fetch('/api/' + clientId + pad, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opties || {}));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Er ging iets mis.');
    return data;
  }

  // Volgende publicatiemoment: Publicatie Sync draait elke dag om 11:00.
  function liveMoment(start, uren) {
    const t = new Date(start.getTime() + uren * 3600 * 1000);
    const d = new Date(t);
    d.setHours(11, 0, 0, 0);
    if (d < t) d.setDate(d.getDate() + 1);
    return d;
  }
  function dagTijd(d) {
    return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) + ' om ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }

  function controleLijst() {
    return '<ul class="pb-checks">' + CONTROLEPUNTEN.map((p) => '<li><span class="pb-check" aria-hidden="true">' + ICOON.vink + '</span>' + esc(p) + '</li>').join('') + '</ul>';
  }

  // ---------- Tabblad ----------
  // Zelfde opzet als Overzicht en Google: de wereld met gradient, kop en hoofdstukken langs de rode lijn.
  // De pagina wordt één keer opgebouwd. Een klik werkt alleen de keuze en de route bij, zodat er niets verspringt.
  const V = () => window.PortaalVerhaal;

  function keuzeHtml() {
    const k = keuze;
    const aan = k.aan;
    const standen = [
      { id: 'inkijk', titel: 'Met inkijktijd', aanbevolen: true, uitleg: 'De blog staat eerst een tijd voor je klaar. Doe je niets, dan gaat hij vanzelf live.' },
      { id: 'direct', titel: 'Direct na controle', aanbevolen: false, uitleg: 'De blog gaat bij de eerstvolgende publicatie live. Je krijgt een mail zodra hij online staat.' }
    ].map((s) => '<button type="button" class="pb-stand' + (k.modus === s.id ? ' gekozen' : '') + '" aria-pressed="' + (k.modus === s.id) + '" data-pb-modus="' + s.id + '"><span class="pb-radio" aria-hidden="true"></span><span class="pb-stand-tekst"><span class="pb-stand-titel">' + esc(s.titel) + (s.aanbevolen ? ' <span class="p-pil p-pil-plan">Aanbevolen</span>' : '') + '</span><span class="pb-stand-uitleg">' + esc(s.uitleg) + '</span></span></button>').join('');
    const uren = [24, 48, 72].map((u) => '<button type="button" class="' + (k.inkijkUren === u ? 'gekozen' : '') + '" aria-pressed="' + (k.inkijkUren === u) + '" data-pb-uren="' + u + '">' + u + ' uur</button>').join('');
    const nu = new Date();
    const voorbeeld = k.modus === 'direct'
      ? 'Is een blog nu klaar en gecontroleerd, dan gaat hij ' + dagTijd(liveMoment(nu, 0)) + ' live. Je krijgt direct daarna een mail.'
      : 'Is een blog nu klaar, dan krijg je meteen een mail en gaat hij ' + dagTijd(liveMoment(nu, k.inkijkUren)) + ' live als je niets doet.';
    const gewijzigd = stand && (stand.aan !== k.aan || stand.modus !== k.modus || stand.inkijkUren !== k.inkijkUren);

    const keuzeDeel = aan
      ? '<div class="pb-sectie"><span class="pb-label" id="pbManier">Hoe wil je publiceren?</span><div class="pb-standen" role="group" aria-labelledby="pbManier">' + standen + '</div>' +
        (k.modus === 'inkijk' ? '<div class="pb-veld"><span class="pb-label" id="pbUren">Inkijktijd</span><div class="pb-segment" role="group" aria-labelledby="pbUren">' + uren + '</div><span class="pb-hulp">Zo lang staat de blog voor je klaar voordat hij live gaat.</span></div>' : '') +
        '<div class="pb-voorbeeld">' + ICOON.agenda + '<span><b>Voorbeeld</b> ' + esc(voorbeeld) + '</span></div></div>'
      : '<div class="pb-uit">' + ICOON.info + '<span>Je krijgt een mail zodra er een blog klaarstaat. Pas na jouw akkoord gaat hij live. Reageer je niet, dan sturen we na 7 en 14 dagen een herinnering.</span></div>';

    return '<section class="p-kaart pb-keuze' + (aan ? ' pb-keuze-aan' : '') + '">' +
      '<div class="pb-schakel-rij"><div class="pb-schakel-tekst"><h3 class="pb-schakel-titel" id="pbTitel">Automatisch publiceren</h3><p>' +
      esc(aan ? 'Wij plaatsen blogs na onze controle zelf op jullie website. Jij hoeft niets na te lopen, maar kunt altijd meekijken.' : 'Je loopt elke blog zelf na en keurt hem goed voordat hij live gaat.') +
      '</p></div><button type="button" role="switch" class="pb-schakelaar' + (aan ? ' aan' : '') + '" aria-checked="' + aan + '" aria-labelledby="pbTitel" id="pbSchakelaar"><span class="pb-baan" aria-hidden="true"><span class="pb-bol"></span></span><span class="pb-schakel-label">' + (aan ? 'Aan' : 'Uit') + '</span></button></div>' +
      '<div class="pb-scheiding"></div>' + keuzeDeel +
      '<div class="pb-opslaan"><span id="pbStatus">' + esc(gewijzigd ? 'Je hebt iets gewijzigd. Vergeet niet op te slaan.' : 'Je kunt dit op elk moment weer veranderen.') + '</span><button type="button" class="p-knop p-knop-hoofd" id="pbOpslaan"' + (gewijzigd ? '' : ' disabled') + '>Wijzigingen opslaan</button></div>' +
      '</section>';
  }

  // De route van een blog, volgens de keuze op het scherm.
  function routeHtml() {
    const k = keuze;
    const stap4 = !k.aan
      ? { titel: 'Jij keurt goed', tekst: 'Je krijgt een mail en beoordeelt de blog in het portaal.', icoon: ICOON.pen }
      : k.modus === 'inkijk'
        ? { titel: k.inkijkUren + ' uur inkijktijd', tekst: 'Je krijgt een mail. Tegenhouden of feedback geven kan altijd.', icoon: ICOON.pauze }
        : { titel: 'Direct door', tekst: 'Geen wachttijd. Na publicatie krijg je een mail.', icoon: ICOON.vink };
    const stappen = [
      { titel: 'Onderwerp gekozen', tekst: 'Uit zoekdata, en eerst door ons beoordeeld.', icoon: ICOON.zoek },
      { titel: 'Blog geschreven', tekst: 'Met jullie kennisdocument en merkprofiel.', icoon: ICOON.pen },
      { titel: 'Gecontroleerd', tekst: 'Op 12 punten. Afgekeurd is opnieuw schrijven.', icoon: ICOON.schild },
      stap4,
      { titel: 'Live om 11:00', tekst: 'Op jullie website, daarna volgen we de cijfers.', icoon: ICOON.raket }
    ];
    return '<ol class="pb-route">' + stappen.map((s, i) => '<li class="pb-route-stap' + (i === 3 ? ' pb-route-keuze' : '') + '"><span class="pb-route-bol" aria-hidden="true">' + s.icoon + '</span><span class="pb-route-nr">Stap ' + (i + 1) + '</span><b>' + esc(s.titel) + '</b><span class="pb-route-tekst">' + esc(s.tekst) + '</span></li>').join('') + '</ol>';
  }

  function cijfersHtml() {
    const k = keuze;
    const kaart = (label, waarde, eenheid, tekst) => '<article class="v-stat pb-stat"><div class="v-stat-kop"><span class="v-stat-label">' + esc(label) + '</span></div><div class="v-stat-waarde"><span>' + esc(waarde) + '</span>' + (eenheid ? '<small>' + esc(eenheid) + '</small>' : '') + '</div><p class="v-stat-tekst">' + esc(tekst) + '</p></article>';
    const wacht = !k.aan ? kaart('Wachten op', 'Jou', '', 'Een blog gaat pas live na jouw akkoord.')
      : k.modus === 'inkijk' ? kaart('Inkijktijd', String(k.inkijkUren), 'uur', 'Zo lang kun je meekijken voordat de blog live gaat.')
        : kaart('Inkijktijd', 'Geen', '', 'De blog gaat bij de eerstvolgende publicatie live.');
    return kaart('Controles per blog', '12', '', 'Elke blog, voordat hij ooit live kan gaan.') + wacht + kaart('Publicatie', '11:00', '', 'Elke dag op hetzelfde moment.');
  }

  function geplandHtml() {
    const gepland = (stand && stand.gepland) || [];
    if (!keuze.aan || !gepland.length) return '';
    return '<section class="p-kaart pb-gepland-kaart"><div class="p-kaart-kop"><div class="p-kaart-titel-blok"><h3 class="p-kaart-titel">Gaat binnenkort live</h3><div class="p-kaart-uitleg">Gecontroleerd en ingepland. Klik om mee te kijken.</div></div></div><div class="p-kaart-inhoud"><ul class="pb-gepland">' +
      gepland.map((g) => '<li><button type="button" class="pb-gepland-knop" data-pb-blog="' + esc(g.pageId) + '"><span class="pb-gepland-punt" aria-hidden="true"></span><span><b>' + esc(g.titel) + '</b><span>' + esc(g.liveOp ? 'Live ' + dagTijd(new Date(g.liveOp)) : '') + '</span></span></button></li>').join('') + '</ul></div></section>';
  }

  function zekerheidHtml() {
    return V().raster(
      '<section class="p-kaart"><div class="p-kaart-kop"><div class="p-kaart-titel-blok"><h3 class="p-kaart-titel">Dit blijft altijd zo</h3></div></div><div class="p-kaart-inhoud"><ul class="pb-regels">' +
      '<li><span class="pb-regel-icoon">' + ICOON.schild + '</span><span><b>Elke blog wordt gecontroleerd</b>Op 12 punten, voordat hij ooit live kan gaan.</span></li>' +
      '<li><span class="pb-regel-icoon">' + ICOON.pauze + '</span><span><b>Afgekeurd? Dan publiceren we niet</b>Keurt de controle een blog af, dan schrijven we hem opnieuw. Lukt dat niet, dan kijkt Advertisr er zelf naar.</span></li>' +
      '<li><span class="pb-regel-icoon">' + ICOON.zoek + '</span><span><b>Onderwerpen worden eerst beoordeeld</b>Elk onderwerp wordt door ons goedgekeurd voordat we gaan schrijven.</span></li>' +
      '<li><span class="pb-regel-icoon">' + ICOON.pen + '</span><span><b>Altijd mee te kijken</b>Tijdens de inkijktijd kun je een blog tegenhouden of feedback geven.</span></li>' +
      '<li><span class="pb-regel-icoon">' + ICOON.schakel + '</span><span><b>Jij houdt de keuze</b>Automatisch publiceren zet je met één klik aan of uit.</span></li>' +
      '</ul></div></section>' +
      '<section class="p-kaart"><div class="p-kaart-kop"><div class="p-kaart-titel-blok"><h3 class="p-kaart-titel">Zo controleren we elke blog</h3><div class="p-kaart-uitleg">Dezelfde 12 punten, bij elke blog.</div></div></div><div class="p-kaart-inhoud">' + controleLijst() + '</div></section>', '2');
  }

  function kopActies() {
    return '<span class="pb-kop-status' + (stand && stand.aan ? ' aan' : '') + '"><i aria-hidden="true"></i>' + esc(stand && stand.aan ? 'Automatisch publiceren staat aan' : 'Je keurt zelf goed') + '</span>';
  }

  function bouwTab() {
    const v = V();
    const hoofdstukken =
      v.hoofdstuk({ nr: 1, eyebrow: 'Jouw keuze', titel: 'Hoe gaan jullie blogs live?', lead: 'Zelf elke blog nalopen, of ons laten publiceren na de controle. Je kunt altijd wisselen.', inhoud: '<div id="pbKeuze">' + keuzeHtml() + '</div><div id="pbGepland">' + geplandHtml() + '</div>' }) +
      v.hoofdstuk({ nr: 2, eyebrow: 'De route', titel: 'Zo gaat een blog live', lead: 'Van onderwerp tot publicatie. Stap 4 volgt jouw keuze hierboven.', inhoud: '<div id="pbRoute">' + routeHtml() + '</div><div class="v-raster v-raster-3" id="pbCijfers">' + cijfersHtml() + '</div>' }) +
      v.hoofdstuk({ nr: 3, eyebrow: 'Zekerheid', titel: 'Niets gaat zonder controle live', lead: 'Ook als automatisch publiceren aan staat.', inhoud: zekerheidHtml() });
    return v.wereld({
      kop: v.kop({ titel: 'Publiceren', tekst: 'Kies of je elke blog zelf wilt nalopen of dat wij hem na onze controle automatisch plaatsen.', acties: '<span id="pbKopActies">' + kopActies() + '</span>' }),
      hoofdstukken
    }).replace('class="v-wereld"', 'class="v-wereld v-publiceren"');
  }

  // Alleen de onderdelen die van de keuze afhangen opnieuw tekenen.
  function werkBij() {
    const zet = (id, html) => { const x = el(id); if (x) x.innerHTML = html; };
    zet('pbKeuze', keuzeHtml());
    zet('pbGepland', geplandHtml());
    zet('pbRoute', routeHtml());
    zet('pbCijfers', cijfersHtml());
    zet('pbKopActies', kopActies());
    koppel();
  }

  function koppel() {
    const doel = el('publicerenTab');
    if (!doel) return;
    const s = el('pbSchakelaar');
    if (s) s.addEventListener('click', () => { keuze.aan = !keuze.aan; werkBij(); const n = el('pbSchakelaar'); if (n) n.focus(); });
    doel.querySelectorAll('[data-pb-modus]').forEach((b) => b.addEventListener('click', () => { keuze.modus = b.dataset.pbModus; werkBij(); }));
    doel.querySelectorAll('[data-pb-uren]').forEach((b) => b.addEventListener('click', () => { keuze.inkijkUren = Number(b.dataset.pbUren); werkBij(); }));
    doel.querySelectorAll('[data-pb-blog]').forEach((b) => b.addEventListener('click', () => { if (window.openBlogUitOverzicht) window.openBlogUitOverzicht(b.dataset.pbBlog); }));
    const opslaan = el('pbOpslaan');
    if (opslaan) opslaan.addEventListener('click', bewaar);
  }

  function teken() {
    const doel = el('publicerenTab');
    if (!doel || !keuze) return;
    doel.classList.add('v-tab');
    doel.innerHTML = bouwTab();
    koppel();
    const w = doel.querySelector('[data-v-wereld]');
    if (w && V().activeer) V().activeer(w);
  }

  async function bewaar() {
    const knop = el('pbOpslaan');
    const status = el('pbStatus');
    if (knop) knop.disabled = true;
    try {
      const res = await vraag('/publiceren', { method: 'POST', body: JSON.stringify(keuze) });
      stand = Object.assign({}, stand, { aan: res.aan, modus: res.modus, inkijkUren: res.inkijkUren });
      keuze = { aan: res.aan, modus: res.modus, inkijkUren: res.inkijkUren };
      werkBij();
      const st = el('pbStatus');
      if (st) st.textContent = res.aan ? 'Opgeslagen. Nieuwe blogs worden vanaf nu automatisch geplaatst.' : 'Opgeslagen. Je keurt blogs weer zelf goed.';
    } catch (err) {
      if (status) status.textContent = err.message;
      if (knop) knop.disabled = false;
    }
  }

  function kaal(titel, tekst) {
    return V().wereld({ kop: V().kop({ titel, tekst }), hoofdstukken: '' });
  }

  async function laad() {
    const doel = el('publicerenTab');
    if (!doel) return;
    doel.classList.add('v-tab');
    if (!keuze) doel.innerHTML = kaal('Publiceren', 'Even geduld, we halen jullie instellingen op.');
    try {
      stand = await vraag('/publiceren');
      if (!stand.beschikbaar) {
        doel.innerHTML = kaal('Publiceren', 'Automatisch publiceren is voor jullie nog niet beschikbaar.');
        return;
      }
      keuze = { aan: stand.aan, modus: stand.modus, inkijkUren: stand.inkijkUren };
      teken();
    } catch (err) {
      doel.innerHTML = kaal('Publiceren', 'De instellingen laden even niet. Probeer het straks opnieuw.');
    }
  }

  async function controleer(id) {
    clientId = id;
    const knop = el('publicerenTabBtn');
    const groep = el('instellingenGroep');
    try {
      const data = await vraag('/publiceren');
      stand = data;
      const zichtbaar = Boolean(data.beschikbaar);
      if (knop) knop.classList.toggle('hidden', !zichtbaar);
      if (groep) groep.classList.toggle('hidden', !zichtbaar);
    } catch (err) {
      if (knop) knop.classList.add('hidden');
      if (groep) groep.classList.add('hidden');
    }
  }

  // ---------- Blogdetail ----------
  // statusValues: { review, approved, published }. Het controlerapport staat bij blogs die door de QA Gate zijn gegaan.
  function controleRapport(item, sv) {
    const na = [sv.review, sv.approved, sv.published].filter(Boolean).includes(item.status);
    const datum = String(item.publicatiedatum || '').slice(0, 10);
    if (!na || (item.status === sv.published && datum && datum < QA_SINDS)) return '';
    return '<details class="p-kaart pb-rapport"><summary><span class="pb-rapport-kop">' + ICOON.schild + '<span><b>Controlerapport</b><span>Gecontroleerd op 12 punten voordat deze blog live mag</span></span></span>' + PortaalUI.pil('12 van 12 in orde', 'goed') + '</summary><div class="pb-rapport-inhoud">' + controleLijst() + '</div></details>';
  }

  async function vulDetail(item, state) {
    const doel = el('publicatieBlok');
    if (!doel || !item) return;
    const sv = state.statusValues || {};
    const rapport = controleRapport(item, sv);
    doel.innerHTML = rapport;
    if (item.status !== sv.review) return;
    let data = null;
    try { data = await vraag('/items/' + item.id + '/publicatie'); } catch (err) { return; }
    if (!data || !data.beschikbaar || !data.blog || state.selectedId !== item.id) return;
    const b = data.blog;
    let aftel = '';
    if (b.status === 'gepland' && b.liveOp) {
      const live = new Date(b.liveOp);
      const ms = live.getTime() - Date.now();
      const uur = Math.max(0, Math.round(ms / 3600000));
      const totaal = Math.max(1, (live.getTime() - new Date(b.klaarOp || Date.now()).getTime()) / 3600000);
      const verstreken = Math.min(100, Math.max(0, ((totaal - ms / 3600000) / totaal) * 100));
      const wanneer = uur >= 48 ? 'over ' + Math.round(uur / 24) + ' dagen' : uur >= 1 ? 'over ' + uur + ' uur' : 'binnen het uur';
      aftel = '<section class="p-kaart pb-aftel"><div class="pb-aftel-tekst"><div class="pb-aftel-label">Automatisch publiceren staat aan</div><h3 class="pb-aftel-titel">Deze blog gaat ' + esc(wanneer) + ' live</h3>' +
        '<div class="pb-aftel-sub">Live ' + esc(dagTijd(live)) + '. Alles is in orde, dus je hoeft niets te doen. Eerder online? Keur hem hieronder goed. Iets aanpassen? Wijs hem af met je feedback.</div>' +
        '<div class="pb-aftel-balk" role="img" aria-label="Inkijktijd voor ' + Math.round(verstreken) + ' procent verstreken"><i style="width:' + verstreken.toFixed(0) + '%"></i></div></div>' +
        '<div class="pb-aftel-knoppen"><button type="button" class="p-knop" id="pbTegenhouden">' + ICOON.pauze + 'Even tegenhouden</button></div></section>';
    } else if (b.status === 'tegengehouden') {
      aftel = '<section class="p-kaart pb-aftel pb-aftel-stil"><div class="pb-aftel-tekst"><div class="pb-aftel-label">Tegengehouden</div><h3 class="pb-aftel-titel">Deze blog wacht op jouw akkoord</h3><div class="pb-aftel-sub">Je hebt deze blog tegengehouden. Keur hem hieronder goed of wijs hem af met feedback.</div></div></section>';
    }
    doel.innerHTML = aftel + rapport;
    const knop = el('pbTegenhouden');
    if (knop) {
      knop.addEventListener('click', async () => {
        knop.disabled = true;
        try {
          await vraag('/items/' + item.id + '/tegenhouden', { method: 'POST' });
          vulDetail(item, state);
        } catch (err) {
          alert(err.message);
          knop.disabled = false;
        }
      });
      // Vanuit de mail (knop Even tegenhouden): de knop meteen in beeld.
      if (startActie === 'tegenhouden') {
        startActie = null;
        knop.scrollIntoView({ behavior: 'smooth', block: 'center' });
        knop.focus();
        knop.classList.add('pb-aandacht');
      }
    }
  }

  window.checkPubliceren = controleer;
  window.loadPubliceren = laad;
  window.Publiceren = { vulDetail, CONTROLEPUNTEN, stand: () => stand };
})();
