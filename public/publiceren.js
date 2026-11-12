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
  function bouwTab() {
    const k = keuze;
    const aan = k.aan;
    const standen = [
      { id: 'inkijk', titel: 'Met inkijktijd', aanbevolen: true, uitleg: 'De blog staat eerst een tijd voor je klaar. Doe je niets, dan gaat hij vanzelf live.' },
      { id: 'direct', titel: 'Direct na controle', aanbevolen: false, uitleg: 'De blog gaat bij de eerstvolgende publicatie live. Je krijgt een mail zodra hij online staat.' }
    ].map((s) => '<button type="button" class="pb-stand' + (k.modus === s.id ? ' gekozen' : '') + '" aria-pressed="' + (k.modus === s.id) + '" data-pb-modus="' + s.id + '"><span class="pb-radio" aria-hidden="true"></span><span class="pb-stand-tekst"><span class="pb-stand-titel">' + esc(s.titel) + (s.aanbevolen ? ' <span class="p-pil p-pil-plan">Aanbevolen</span>' : '') + '</span><span class="pb-stand-uitleg">' + esc(s.uitleg) + '</span></span></button>').join('');
    const uren = [24, 48, 72].map((u) => '<button type="button" class="' + (k.inkijkUren === u ? 'gekozen' : '') + '" aria-pressed="' + (k.inkijkUren === u) + '" data-pb-uren="' + u + '">' + u + ' uur</button>').join('');
    const nu = new Date();
    const voorbeeld = k.modus === 'direct'
      ? 'Voorbeeld: is een blog nu klaar en gecontroleerd, dan gaat hij ' + dagTijd(liveMoment(nu, 0)) + ' live. Je krijgt direct daarna een mail.'
      : 'Voorbeeld: is een blog nu klaar, dan krijg je meteen een mail en gaat hij ' + dagTijd(liveMoment(nu, k.inkijkUren)) + ' live als je niets doet.';
    const gewijzigd = stand && (stand.aan !== k.aan || stand.modus !== k.modus || stand.inkijkUren !== k.inkijkUren);

    const keuzeDeel = aan
      ? '<div class="pb-scheiding"></div><div class="pb-sectie"><span class="pb-label" id="pbManier">Hoe wil je publiceren?</span><div class="pb-standen" role="group" aria-labelledby="pbManier">' + standen + '</div>' +
        (k.modus === 'inkijk' ? '<div class="pb-veld"><span class="pb-label" id="pbUren">Inkijktijd</span><div class="pb-segment" role="group" aria-labelledby="pbUren">' + uren + '</div><span class="pb-hulp">Zo lang staat de blog voor je klaar voordat hij live gaat. Blogs gaan elke dag om 11:00 live.</span></div>' : '') +
        '<div class="pb-voorbeeld">' + ICOON.agenda + '<span>' + esc(voorbeeld) + '</span></div></div>'
      : '<div class="pb-scheiding"></div><div class="pb-uit">' + ICOON.info + '<span>Je krijgt een mail zodra er een blog klaarstaat. Pas na jouw akkoord gaat hij live. Reageer je niet, dan sturen we na 7 en 14 dagen een herinnering.</span></div>';

    const gepland = (stand && stand.gepland) || [];
    const geplandKaart = aan && gepland.length
      ? '<section class="p-kaart"><div class="p-kaart-kop"><div class="p-kaart-titel-blok"><h2 class="p-kaart-titel">Gaat binnenkort live</h2><div class="p-kaart-uitleg">Deze blogs zijn gecontroleerd en gaan vanzelf live.</div></div></div><div class="p-kaart-inhoud"><ul class="pb-gepland">' +
        gepland.map((g) => '<li><button type="button" class="pb-gepland-knop" data-pb-blog="' + esc(g.pageId) + '"><b>' + esc(g.titel) + '</b><span>' + esc(g.liveOp ? 'Live ' + dagTijd(new Date(g.liveOp)) : '') + '</span></button></li>').join('') + '</ul></div></section>'
      : '';

    return '<div class="p-pagina pb-pagina">' +
      '<div class="p-ov-kop"><div><h1>Publiceren</h1><p>Kies of je elke blog zelf wilt nalopen of dat wij hem na onze controle automatisch plaatsen. Je kunt dit op elk moment aan of uit zetten.</p></div></div>' +
      '<div class="pb-rij"><div class="pb-hoofd">' +
      '<section class="p-kaart"><div class="pb-schakel-rij"><div class="pb-schakel-tekst"><h2 class="pb-schakel-titel" id="pbTitel">Automatisch publiceren ' + PortaalUI.pil(aan ? 'Staat aan' : 'Staat uit', aan ? 'goed' : 'neutraal') + '</h2><p>' +
      esc(aan ? 'Wij plaatsen blogs na onze controle zelf op jullie website. Jij hoeft niets na te lopen, maar kunt altijd meekijken.' : 'Je loopt elke blog zelf na en keurt hem goed voordat hij live gaat.') +
      '</p></div><button type="button" role="switch" class="pb-schakelaar' + (aan ? ' aan' : '') + '" aria-checked="' + aan + '" aria-labelledby="pbTitel" id="pbSchakelaar"><span class="pb-baan" aria-hidden="true"><span class="pb-bol"></span></span>' + (aan ? 'Aan' : 'Uit') + '</button></div>' +
      keuzeDeel + '</section>' +
      '<div class="pb-opslaan"><span id="pbStatus">' + esc(gewijzigd ? 'Je hebt iets gewijzigd. Vergeet niet op te slaan.' : 'Zet je automatisch publiceren uit, dan wachten blogs die nog niet live staan weer op jouw akkoord.') + '</span><button type="button" class="p-knop p-knop-hoofd" id="pbOpslaan"' + (gewijzigd ? '' : ' disabled') + '>Wijzigingen opslaan</button></div>' +
      geplandKaart +
      '</div><div class="pb-zij">' +
      '<section class="p-kaart"><div class="p-kaart-kop"><div class="p-kaart-titel-blok"><h2 class="p-kaart-titel">Dit blijft altijd zo</h2></div></div><div class="p-kaart-inhoud"><ul class="pb-regels">' +
      '<li><span class="pb-regel-icoon">' + ICOON.schild + '</span><span><b>Elke blog wordt gecontroleerd</b>Op 12 punten, voordat hij ooit live kan gaan.</span></li>' +
      '<li><span class="pb-regel-icoon">' + ICOON.pauze + '</span><span><b>Afgekeurd? Dan publiceren we niet</b>Keurt de controle een blog af, dan schrijven we hem opnieuw. Lukt dat niet, dan kijkt Advertisr er zelf naar.</span></li>' +
      '<li><span class="pb-regel-icoon">' + ICOON.zoek + '</span><span><b>Onderwerpen worden eerst beoordeeld</b>Elk onderwerp wordt door ons goedgekeurd voordat we gaan schrijven.</span></li>' +
      '<li><span class="pb-regel-icoon">' + ICOON.pen + '</span><span><b>Altijd mee te kijken</b>Tijdens de inkijktijd kun je een blog tegenhouden of feedback geven.</span></li>' +
      '<li><span class="pb-regel-icoon">' + ICOON.schakel + '</span><span><b>Jij houdt de keuze</b>Automatisch publiceren zet je met één klik aan of uit.</span></li>' +
      '</ul></div></section>' +
      '<section class="p-kaart"><div class="p-kaart-kop"><div class="p-kaart-titel-blok"><h2 class="p-kaart-titel">Zo controleren we elke blog</h2></div></div><div class="p-kaart-inhoud">' + controleLijst() + '</div></section>' +
      '</div></div></div>';
  }

  function teken() {
    const doel = el('publicerenTab');
    if (!doel || !keuze) return;
    doel.innerHTML = bouwTab();
    const s = el('pbSchakelaar');
    if (s) s.addEventListener('click', () => { keuze.aan = !keuze.aan; teken(); });
    doel.querySelectorAll('[data-pb-modus]').forEach((b) => b.addEventListener('click', () => { keuze.modus = b.dataset.pbModus; teken(); }));
    doel.querySelectorAll('[data-pb-uren]').forEach((b) => b.addEventListener('click', () => { keuze.inkijkUren = Number(b.dataset.pbUren); teken(); }));
    doel.querySelectorAll('[data-pb-blog]').forEach((b) => b.addEventListener('click', () => { if (window.openBlogUitOverzicht) window.openBlogUitOverzicht(b.dataset.pbBlog); }));
    const opslaan = el('pbOpslaan');
    if (opslaan) opslaan.addEventListener('click', bewaar);
  }

  async function bewaar() {
    const knop = el('pbOpslaan');
    const status = el('pbStatus');
    if (knop) knop.disabled = true;
    try {
      const res = await vraag('/publiceren', { method: 'POST', body: JSON.stringify(keuze) });
      stand = Object.assign({}, stand, { aan: res.aan, modus: res.modus, inkijkUren: res.inkijkUren });
      keuze = { aan: res.aan, modus: res.modus, inkijkUren: res.inkijkUren };
      teken();
      const st = el('pbStatus');
      if (st) st.textContent = res.aan ? 'Opgeslagen. Nieuwe blogs worden vanaf nu automatisch geplaatst.' : 'Opgeslagen. Je keurt blogs weer zelf goed.';
    } catch (err) {
      if (status) status.textContent = err.message;
      if (knop) knop.disabled = false;
    }
  }

  async function laad() {
    const doel = el('publicerenTab');
    if (!doel) return;
    doel.innerHTML = '<div class="p-pagina"><div class="p-ov-kop"><div><h1>Publiceren</h1><p>Even geduld.</p></div></div></div>';
    try {
      stand = await vraag('/publiceren');
      if (!stand.beschikbaar) {
        doel.innerHTML = '<div class="p-pagina"><div class="p-ov-kop"><div><h1>Publiceren</h1><p>Automatisch publiceren is voor jullie nog niet beschikbaar.</p></div></div></div>';
        return;
      }
      keuze = { aan: stand.aan, modus: stand.modus, inkijkUren: stand.inkijkUren };
      teken();
    } catch (err) {
      doel.innerHTML = '<div class="p-pagina">' + PortaalUI.foutStand({ titel: 'Publiceren laadt even niet', tekst: err.message }) + '</div>';
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
