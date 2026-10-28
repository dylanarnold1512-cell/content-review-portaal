// Maandrapporten: vaste maandrapporten (snapshots) die n8n op de 4e van de maand vastlegt.
// Het tabblad toont de rapporten als documenten. Een klik opent het rapport als document in een venster,
// met downloaden (PDF van de server) en afdrukken. Hier wordt alleen getekend, er wordt niets opnieuw berekend.
// De opmaak van het document zelf staat in rapport-document.js. Alles wat uit data komt gaat door rpEsc.
(function () {
  const rp = { lijst: [], cache: {}, ai: undefined, gevraagd: null, open: null, terugFocus: null };

  function rpEsc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const F = () => window.PortaalFormat;
  const U = () => window.PortaalUI;
  const D = () => window.RapportDocument;
  const el = (id) => document.getElementById(id);
  const hoofdletter = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);

  const ICOON = {
    oog: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    download: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    print: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>',
    sluit: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    bestand: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    klok: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    slot: '<svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>'
  };

  function pdfUrl(maand) {
    return `/api/${encodeURIComponent(state.clientId)}/rapporten/${encodeURIComponent(maand)}/pdf`;
  }
  function klantNaam() {
    const k = el('clientName');
    return k ? k.textContent.trim() : '';
  }
  function vandaag() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Een rapport heet nieuw als het minder dan 35 dagen geleden is vastgelegd.
  function isNieuw(aangemaakt) {
    const t = Date.parse(String(aangemaakt || '').slice(0, 10) + 'T00:00:00');
    return Number.isFinite(t) && (Date.now() - t) < 35 * 86400000;
  }

  async function haalRapport(maand) {
    if (!rp.cache[maand]) {
      rp.cache[maand] = api(`/${state.clientId}/rapporten/${encodeURIComponent(maand)}`).catch((err) => { delete rp.cache[maand]; throw err; });
    }
    return rp.cache[maand];
  }
  async function haalAi() {
    if (rp.ai === undefined) rp.ai = api(`/${state.clientId}/ai-zichtbaarheid`).catch(() => null);
    return rp.ai;
  }

  // De vragen waarbij AI het merk in die maand noemde. Lukt het niet, dan blijft de rest van het rapport gewoon staan.
  function haalAiVragen(maand) {
    rp.aiVragen = rp.aiVragen || {};
    if (!rp.aiVragen[maand]) rp.aiVragen[maand] = api(`/${state.clientId}/ai-zichtbaarheid/maand/${encodeURIComponent(maand)}`).then((d) => (d && d.beschikbaar !== false && Array.isArray(d.vragen) ? d.vragen : null)).catch(() => null);
    return rp.aiVragen[maand];
  }

  const KOP = `<div class="p-ov-kop"><div><h1>Maandrapporten</h1><p>Elke maand zetten we jullie resultaten vast in een rapport. Open een rapport om het te lezen, of download het als PDF om te delen.</p></div></div>`;

  // Het nieuwste rapport groot bovenaan. De cijfers komen erbij zodra het rapport geladen is.
  function uitgelicht(x, r, g) {
    const label = x.label;
    const nieuw = isNieuw(x.aangemaakt) ? '<span class="p-pil p-pil-goed">Nieuw</span>' : '';
    const cijfers = r ? D().kerncijfers(r, g) : null;
    const zin = r ? `${D().kernzin(r)}.` : '';
    const nieuweBlogs = r ? (r.nieuweBlogs || []).length : 0;
    const strook = r
      ? `<div class="rp-uit-cijfers">${cijfers.slice(0, 2).map((c) => `<div><b>${rpEsc(c.waarde)}</b><span>${rpEsc(c.label)}</span></div>`).join('')}<div><b>${rpEsc(F().getal(nieuweBlogs))}</b><span>${nieuweBlogs === 1 ? 'nieuwe blog' : 'nieuwe blogs'}</span></div></div>`
      : U().laden([{ breedte: '70%', hoogte: 18 }, { breedte: '50%', hoogte: 44 }]);
    return `<section class="p-kaart rp-uit" aria-labelledby="rpUitTitel">
      <button type="button" class="rp-uit-papier" data-rp-open="${rpEsc(x.maand)}" aria-label="Open maandrapport ${rpEsc(label)}">${D().miniatuur({ label }, cijfers)}</button>
      <div class="rp-uit-tekst">
        <div class="rp-uit-meta">${nieuw}<span>${x.aangemaakt ? `Vastgelegd op ${rpEsc(F().datumLang(x.aangemaakt))}` : 'Vastgelegd'}</span></div>
        <h2 id="rpUitTitel">Maandrapport ${rpEsc(label)}</h2>
        ${zin ? `<p>${rpEsc(zin)}</p>` : ''}
        ${strook}
        <div class="rp-uit-acties">
          <button type="button" class="p-knop p-knop-donker" data-rp-open="${rpEsc(x.maand)}">${ICOON.oog}Rapport openen</button>
          <a class="p-knop" href="${rpEsc(pdfUrl(x.maand))}" download>${ICOON.download}Download PDF</a>
        </div>
      </div>
    </section>`;
  }

  function kaart(x) {
    return `<div class="rp-doc-kaart">
      <button type="button" class="rp-doc-papier" data-rp-open="${rpEsc(x.maand)}" aria-label="Open maandrapport ${rpEsc(x.label)}">${D().miniatuur({ label: x.label })}</button>
      <div class="rp-doc-onder">
        <div class="rp-doc-tekst"><b>${rpEsc(hoofdletter(x.label))}</b><span>${x.aangemaakt ? `Vastgelegd op ${rpEsc(F().datumKort(x.aangemaakt))}` : 'Vastgelegd'}</span></div>
        <a class="rp-icoonknop" href="${rpEsc(pdfUrl(x.maand))}" download aria-label="Download maandrapport ${rpEsc(x.label)} als PDF">${ICOON.download}</a>
      </div>
    </div>`;
  }

  function komtKaart(v) {
    if (!v) return '';
    return `<div class="rp-doc-kaart rp-doc-komt">
      <div class="rp-doc-papier rp-doc-papier-leeg"><div class="rp-mini-leegvel">${ICOON.klok}<span>${v.loopt ? 'Loopt nog' : 'Wordt gemaakt'}</span></div></div>
      <div class="rp-doc-onder"><div class="rp-doc-tekst"><b>${rpEsc(hoofdletter(v.label))}</b><span>Klaar op ${rpEsc(v.verschijntTekst)}</span></div></div>
    </div>`;
  }

  function renderOverzicht(nieuwste, g) {
    const inhoud = el('rapportenInhoud');
    const v = D().volgendRapport(rp.lijst[0].maand, vandaag());
    const jaren = {};
    rp.lijst.forEach((x) => { const j = String(x.maand).slice(0, 4); (jaren[j] = jaren[j] || []).push(x); });
    const jaarLijst = Object.keys(jaren).sort().reverse();
    const blokken = jaarLijst.map((j, i) => `<section class="rp-alle" aria-labelledby="rpJaar${rpEsc(j)}">
      <div class="rp-alle-kop"><h2 id="rpJaar${rpEsc(j)}">${i === 0 ? 'Alle rapporten' : rpEsc(j)}</h2>${i === 0 ? `<span>${rpEsc(j)}</span>` : ''}</div>
      <div class="rp-doc-raster">${i === 0 ? komtKaart(v && String(v.maand).slice(0, 4) === j ? v : null) : ''}${jaren[j].map(kaart).join('')}</div>
    </section>`).join('');
    inhoud.innerHTML = `${uitgelicht(rp.lijst[0], nieuwste, g)}${blokken}
      <p class="rp-slot">${ICOON.slot}<span>Een vastgelegd rapport verandert niet meer. De actuele cijfers zie je altijd onder Google.</span></p>`;
  }

  // ---------- Het rapport als document in een venster ----------

  function viewerHtml(x) {
    return `<div class="rp-viewer" id="rpViewer" role="dialog" aria-modal="true" aria-labelledby="rpViewerTitel">
      <div class="rp-viewer-doos">
        <div class="rp-viewer-balk">
          <span class="rp-viewer-icoon">${ICOON.bestand}</span>
          <div class="rp-viewer-naam"><div id="rpViewerTitel">Maandrapport ${rpEsc(x.label)}</div><div class="rp-viewer-sub" id="rpViewerSub">${rpEsc(klantNaam())}${x.aangemaakt ? ` · vastgelegd op ${rpEsc(F().datumLang(x.aangemaakt))}` : ''}</div></div>
          <a class="p-knop p-knop-donker" href="${rpEsc(pdfUrl(x.maand))}" download>${ICOON.download}<span>Download PDF</span></a>
          <button type="button" class="rp-icoonknop" id="rpPrint" aria-label="Afdrukken">${ICOON.print}</button>
          <button type="button" class="rp-icoonknop" id="rpSluit" aria-label="Sluiten">${ICOON.sluit}</button>
        </div>
        <div class="rp-viewer-vel" id="rpViewerVel" tabindex="-1">
          <div class="rd-pagina rd-pagina-laden">${U().laden([{ breedte: '30%', hoogte: 22 }, { breedte: '70%', hoogte: 34 }, { breedte: '100%', hoogte: 70 }, { breedte: '100%', hoogte: 90 }, { breedte: '100%', hoogte: 160 }])}</div>
        </div>
      </div>
    </div>`;
  }

  function sluitViewer() {
    const v = el('rpViewer');
    if (v) v.remove();
    document.body.classList.remove('rp-viewer-open');
    rp.open = null;
    const terug = rp.terugFocus;
    rp.terugFocus = null;
    if (terug && document.contains(terug)) terug.focus();
  }

  // Houdt de focus binnen het venster zolang het open is.
  function houdFocus(e) {
    if (e.key === 'Escape') { e.preventDefault(); sluitViewer(); return; }
    if (e.key !== 'Tab') return;
    const v = el('rpViewer');
    const knoppen = Array.from(v.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!knoppen.length) return;
    const eerste = knoppen[0];
    const laatste = knoppen[knoppen.length - 1];
    if (e.shiftKey && document.activeElement === eerste) { e.preventDefault(); laatste.focus(); }
    else if (!e.shiftKey && document.activeElement === laatste) { e.preventDefault(); eerste.focus(); }
  }

  async function openRapport(maand, bron) {
    const x = rp.lijst.find((r) => r.maand === maand);
    if (!x) return;
    if (el('rpViewer')) sluitViewer();
    rp.open = maand;
    rp.terugFocus = bron || document.activeElement;
    document.body.insertAdjacentHTML('beforeend', viewerHtml(x));
    document.body.classList.add('rp-viewer-open');
    const v = el('rpViewer');
    v.addEventListener('keydown', houdFocus);
    v.addEventListener('click', (e) => { if (e.target === v) sluitViewer(); });
    el('rpSluit').addEventListener('click', sluitViewer);
    el('rpPrint').addEventListener('click', () => window.print());
    el('rpSluit').focus();
    const vel = el('rpViewerVel');
    try {
      const [r, ai, aiVragen] = await Promise.all([haalRapport(maand), haalAi(), haalAiVragen(maand)]);
      if (rp.open !== maand || !el('rpViewer')) return;
      const g = D().aiGegevens(ai, r, aiVragen);
      vel.innerHTML = D().documentHtml(r, g, klantNaam());
      const aantal = vel.querySelectorAll('.rd-pagina').length;
      const sub = el('rpViewerSub');
      if (sub) sub.textContent = `${klantNaam()}${klantNaam() ? ' · ' : ''}${aantal} ${aantal === 1 ? 'pagina' : "pagina's"}${r.aangemaakt ? ` · vastgelegd op ${F().datumLang(r.aangemaakt)}` : ''}`;
    } catch (err) {
      if (rp.open !== maand || !el('rpViewer')) return;
      vel.innerHTML = `<div class="rd-pagina rd-pagina-fout">${U().foutStand({ titel: 'Dit maandrapport laadt even niet', tekst: 'De rest van het portaal werkt gewoon. Probeer het straks opnieuw, of download de PDF.' })}</div>`;
    }
  }

  function bindOverzicht() {
    const inhoud = el('rapportenInhoud');
    if (inhoud.dataset.rpGebonden) return;
    inhoud.dataset.rpGebonden = '1';
    inhoud.addEventListener('click', (e) => {
      const knop = e.target.closest('[data-rp-open]');
      if (!knop) return;
      openRapport(knop.getAttribute('data-rp-open'), knop);
    });
  }

  async function laad() {
    const kop = el('rapportenKop');
    const inhoud = el('rapportenInhoud');
    kop.innerHTML = KOP;
    bindOverzicht();
    try {
      const data = await api(`/${state.clientId}/rapporten`);
      rp.lijst = data.rapporten || [];
    } catch (err) {
      inhoud.innerHTML = U().foutStand({ titel: 'De maandrapporten laden even niet', tekst: 'De rest van het portaal werkt gewoon. Probeer het straks opnieuw.' });
      return;
    }
    if (!rp.lijst.length) {
      inhoud.innerHTML = U().kaart({ inhoud: U().legeStand({ soort: 'wacht', titel: 'Het eerste maandrapport volgt', tekst: 'Het verschijnt op de 4e van de volgende maand, met een terugblik, de cijfers die vastliggen en een vooruitblik.' }) });
      return;
    }
    renderOverzicht(null, null);
    // Een link uit de maandrapport mail (/slug/rapportages/2026-09) opent dat rapport meteen.
    const gevraagd = rp.lijst.some((x) => x.maand === rp.gevraagd) ? rp.gevraagd : null;
    rp.gevraagd = null;
    if (gevraagd) openRapport(gevraagd, null);
    try {
      const [r, ai] = await Promise.all([haalRapport(rp.lijst[0].maand), haalAi()]);
      renderOverzicht(r, D().aiGegevens(ai, r));
    } catch (err) {
      // Het overzicht werkt ook zonder de cijfers van het nieuwste rapport.
      renderOverzicht(null, null);
      const uit = inhoud.querySelector('.rp-uit-tekst .p-laden');
      if (uit) uit.remove();
    }
  }

  window.loadRapportages = function (maand) {
    if (maand) rp.gevraagd = maand;
    return laad();
  };
})();
