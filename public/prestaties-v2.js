// Prestaties v2: weergave voor de klant. Alle teksten komen kant-en-klaar uit
// de server (src/services/prestaties.js); hier wordt alleen getekend.
// Alles wat uit data komt gaat door pvEsc zodat er nooit HTML uit data wordt uitgevoerd.
// De lijst met blogs blijft overzichtelijk bij veel blogs: compacte regels, zoeken,
// filteren op status, en eerst 10 tonen met een knop voor meer.

function pvEsc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const pvNl = (n) => Number(n).toLocaleString('nl-NL');
const pvDatum = (iso) => {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
};
const PV_STAP = 10;
const PV_INZICHT_ZICHTBAAR = 3;

const pvState = { sort: 'vertoningen', cluster: '', status: '', q: '', toon: PV_STAP, open: {}, insOpen: {}, data: null };

function pvDelta(nu, vorig) {
  if (vorig === null || vorig === undefined) return '';
  const d = nu - vorig;
  if (d === 0) return '<span class="pv-delta pv-flat">gelijk aan de periode ervoor</span>';
  const cls = d > 0 ? 'pv-up' : 'pv-down';
  const teken = d > 0 ? 'meer' : 'minder';
  return `<span class="pv-delta ${cls}">${pvNl(Math.abs(d))} ${teken} dan de periode ervoor</span>`;
}

function pvTiles(t) {
  const hkDelta = t.hkPositieVerbetering === null || t.hkPositieVerbetering === undefined
    ? ''
    : Math.abs(t.hkPositieVerbetering) < 0.5
      ? '<span class="pv-delta pv-flat">vrijwel gelijk aan de periode ervoor</span>'
      : t.hkPositieVerbetering > 0
        ? `<span class="pv-delta pv-up">${t.hkPositieVerbetering.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} plaatsen omhoog</span>`
        : `<span class="pv-delta pv-down">${Math.abs(t.hkPositieVerbetering).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} plaatsen omlaag</span>`;
  const tiles = [
    { l: 'Keer getoond in Google', v: pvNl(t.vertoningen), d: pvDelta(t.vertoningen, t.vertoningenVorig), h: 'Hoe vaak een blog in de zoekresultaten stond.' },
    { l: 'Bezoekers vanuit Google', v: pvNl(t.clicks), d: pvDelta(t.clicks, t.clicksVorig), h: 'Hoe vaak iemand doorklikte naar een blog.' },
    { l: 'Positie hoofdzoekwoorden', v: pvEsc(t.hkPositieLabel || 'Nog geen meting'), d: hkDelta, h: 'Waar de blogs gemiddeld staan voor het zoekwoord waar ze voor geschreven zijn.' }
  ];
  if (t.paginaweergaven !== null && t.paginaweergaven !== undefined) {
    tiles.push({ l: 'Paginaweergaven', v: pvNl(t.paginaweergaven), d: '', h: 'Hoe vaak de blogpagina\'s zijn bekeken.' });
  }
  if (t.conversies) {
    const c = t.conversies;
    const delen = [];
    if (c.leads) delen.push(`${pvNl(c.leads)} ${c.leads === 1 ? 'aanvraag' : 'aanvragen'}`);
    if (c.boekingen) delen.push(`${pvNl(c.boekingen)} ${c.boekingen === 1 ? 'boeking' : 'boekingen'}${c.omzet ? ` (${pvEsc(Number(c.omzet).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }))})` : ''}`);
    tiles.push({
      l: 'Van blog naar contact of boeken',
      v: pvNl(c.doorkliks),
      d: delen.length ? `<span class="pv-delta pv-up">${delen.join(', ')} in bezoeken die op een blog begonnen</span>` : '<span class="pv-delta pv-flat">nog geen aanvraag of boeking vanuit een blog begonnen bezoek</span>',
      h: 'Hoe vaak iemand vanaf een blog doorklikte naar de pagina voor contact, offerte of boeken.'
    });
  }
  return tiles.map((x) => `
    <div class="pv-tile" title="${pvEsc(x.h)}">
      <div class="pv-tile-label">${pvEsc(x.l)}</div>
      <div class="pv-tile-value">${x.v}</div>
      ${x.d}
    </div>`).join('');
}

function pvBars(weken, veld, kleurKlasse, titel) {
  if (!weken.length) return '';
  const max = Math.max(1, ...weken.map((w) => w[veld]));
  const bars = weken.map((w) => {
    const h = Math.max(w[veld] > 0 ? 3 : 0, Math.round((w[veld] / max) * 100));
    const nieuw = w.nieuw && w.nieuw.length
      ? `<span class="pv-mark" title="${pvEsc('Nieuwe blog: ' + w.nieuw.map((n) => n.t).join(', '))}"></span>`
      : '<span class="pv-mark pv-mark-leeg"></span>';
    const tip = `Week van ${pvDatum(w.start)}: ${pvNl(w[veld])}${w.volledig ? '' : ' (week is nog bezig)'}`;
    return `
      <div class="pv-bar-col" title="${pvEsc(tip)}">
        <div class="pv-bar-val">${w[veld] > 0 ? pvNl(w[veld]) : ''}</div>
        <div class="pv-bar-area"><div class="pv-bar ${kleurKlasse}${w.volledig ? '' : ' pv-bar-partial'}" style="height:${h}%"></div></div>
        ${nieuw}
        <div class="pv-bar-lbl">${pvEsc(pvDatum(w.start))}</div>
      </div>`;
  }).join('');
  return `
    <div class="pv-chart">
      <div class="pv-chart-title">${pvEsc(titel)}</div>
      <div class="pv-bars">${bars}</div>
    </div>`;
}

function pvInzicht(sleutel, kop, klasse, lijst, metActie) {
  if (!lijst.length) return '';
  const open = Boolean(pvState.insOpen[sleutel]);
  const zichtbaar = open ? lijst : lijst.slice(0, PV_INZICHT_ZICHTBAAR);
  const meer = lijst.length - PV_INZICHT_ZICHTBAAR;
  return `
    <div class="pv-ins pv-ins-${klasse}">
      <div class="pv-ins-kop">${pvEsc(kop)}${lijst.length > 1 ? ` <span class="pv-ins-aantal">${lijst.length}</span>` : ''}</div>
      ${zichtbaar.map((i) => `
        <div class="pv-ins-item">
          <div class="pv-ins-titel">${pvEsc(i.titel)}</div>
          <div class="pv-ins-tekst">${pvEsc(i.tekst)}</div>
          ${metActie && i.actie ? `<div class="pv-ins-actie">Wat wij doen: ${pvEsc(i.actie)}</div>` : ''}
        </div>`).join('')}
      ${meer > 0 ? `<button type="button" class="pv-toggle" data-pv-ins="${pvEsc(sleutel)}">${open ? 'Toon minder' : `Toon alle ${lijst.length}`}</button>` : ''}
    </div>`;
}

function pvBlogRegel(b, idx) {
  const open = Boolean(pvState.open[idx]);
  const dagen = b.leeftijdDagen === null ? '' : b.leeftijdDagen === 0 ? 'vandaag live' : `${b.leeftijdDagen} ${b.leeftijdDagen === 1 ? 'dag' : 'dagen'} live`;
  const g = b.gedrag;
  const gedragRegels = [];
  if (g) {
    if (g.sessiesGoogle !== null && g.sessiesGoogle !== undefined) {
      gedragRegels.push(`${pvNl(g.sessiesGoogle)} ${g.sessiesGoogle === 1 ? 'bezoek' : 'bezoeken'} vanuit Google${g.sessiesGoogle > 0 && g.betrokkenSeconden ? `, samen ${pvNl(Math.round(g.betrokkenSeconden))} seconden actief op de pagina` : ''}`);
    }
    const doorkliks = (g.doorkliksContact || 0) + (g.doorkliksBoeken || 0);
    if (doorkliks) gedragRegels.push(`${pvNl(doorkliks)} ${doorkliks === 1 ? 'doorklik' : 'doorkliks'} naar contact of boeken`);
    if (g.leads) gedragRegels.push(`${pvNl(g.leads)} ${g.leads === 1 ? 'aanvraag' : 'aanvragen'} in bezoeken die hier begonnen`);
    if (g.boekingen) gedragRegels.push(`${pvNl(g.boekingen)} ${g.boekingen === 1 ? 'boeking' : 'boekingen'} in bezoeken die hier begonnen`);
  }
  const kw = b.zoekwoorden.length
    ? `<table class="pv-kw"><thead><tr><th>Zoekwoord</th><th>Getoond</th><th>Clicks</th><th>Positie</th></tr></thead><tbody>${b.zoekwoorden.map((z) => `
        <tr><td>${pvEsc(z.q)}</td><td>${pvNl(z.i)}</td><td>${pvNl(z.c)}</td><td>${pvEsc(z.label || '')}</td></tr>`).join('')}</tbody></table>`
    : '<div class="pv-muted">Nog geen zoekwoorden gemeten.</div>';
  const pijl = b.hkPositie !== null && b.hkPositieVorig !== null
    ? (b.hkPositieVorig - b.hkPositie >= 0.5 ? ' <span class="pv-up">omhoog</span>' : b.hkPositie - b.hkPositieVorig >= 0.5 ? ' <span class="pv-down">omlaag</span>' : '')
    : '';
  const detail = open ? `
    <div class="pv-detail">
      ${b.hoofdwoord ? `<div class="pv-hw"><span class="pv-muted">Hoofdzoekwoord:</span> ${pvEsc(b.hoofdwoord)}. ${pvEsc(b.hoofdwoordTekst || '')}${pijl}</div>` : ''}
      ${b.indexatie && b.indexatie.tekst ? `<div class="pv-hw"><span class="pv-muted">In Google:</span> ${pvEsc(b.indexatie.tekst)}</div>` : ''}
      ${gedragRegels.length ? `<div class="pv-hw"><span class="pv-muted">Op de website:</span> ${gedragRegels.map(pvEsc).join('. ')}.</div>` : ''}
      ${b.paginaweergaven !== null && b.paginaweergaven !== undefined ? `<div class="pv-hw"><span class="pv-muted">Paginaweergaven:</span> ${pvNl(b.paginaweergaven)}</div>` : ''}
      <div class="pv-kw-wrap">${kw}</div>
      ${b.url ? `<div class="pv-hw"><a href="${pvEsc(b.url)}" target="_blank" rel="noopener">Bekijk de blog</a></div>` : ''}
    </div>` : '';
  return `
    <div class="pv-regel${open ? ' pv-regel-open' : ''}">
      <button type="button" class="pv-regel-kop" data-pv-toggle="${idx}" aria-expanded="${open}">
        <span class="pv-regel-titel">
          <span class="pv-blog-titel">${pvEsc(b.titel)}</span>
          <span class="pv-blog-meta">${[b.cluster, dagen].filter(Boolean).map(pvEsc).join(' · ')}</span>
        </span>
        <span class="pv-badge pv-badge-${pvEsc(b.status.code)}">${pvEsc(b.status.label)}</span>
        <span class="pv-getal"><b>${pvNl(b.vertoningen)}</b><span class="pv-muted"> getoond</span></span>
        <span class="pv-getal"><b>${pvNl(b.clicks)}</b><span class="pv-muted"> ${b.clicks === 1 ? 'bezoeker' : 'bezoekers'}</span></span>
        <span class="pv-pijl">${open ? '−' : '+'}</span>
      </button>
      ${detail}
    </div>`;
}

const PV_STATUSSEN = [
  ['clicks', 'Krijgt bezoekers'],
  ['getoond', 'Wordt getoond'],
  ['nietgetoond', 'Nog niet getoond'],
  ['nieuw', 'Nieuw']
];

function pvGefilterd() {
  const d = pvState.data;
  let lijst = d.blogs.map((b, i) => ({ b, i }));
  if (pvState.status) lijst = lijst.filter((x) => x.b.status.code === pvState.status);
  if (pvState.cluster) lijst = lijst.filter((x) => x.b.cluster === pvState.cluster);
  const q = pvState.q.trim().toLowerCase();
  if (q) lijst = lijst.filter((x) => (x.b.titel + ' ' + x.b.hoofdwoord + ' ' + x.b.cluster).toLowerCase().indexOf(q) !== -1);
  if (pvState.sort === 'nieuwste') lijst.sort((a, c) => (c.b.publicatiedatum || '').localeCompare(a.b.publicatiedatum || ''));
  else if (pvState.sort === 'aandacht') {
    const rang = { nietgetoond: 0, getoond: 1, nieuw: 2, clicks: 3 };
    lijst.sort((a, c) => (rang[a.b.status.code] - rang[c.b.status.code]) || (c.b.leeftijdDagen || 0) - (a.b.leeftijdDagen || 0));
  }
  return lijst;
}

function pvLijstHtml() {
  const lijst = pvGefilterd();
  if (!lijst.length) return '<div class="pv-muted">Geen blogs gevonden.</div>';
  const zichtbaar = lijst.slice(0, pvState.toon);
  const rest = lijst.length - zichtbaar.length;
  return `
    <div class="pv-teller pv-muted">${zichtbaar.length} van ${lijst.length} ${lijst.length === 1 ? 'blog' : 'blogs'}</div>
    ${zichtbaar.map((x) => pvBlogRegel(x.b, x.i)).join('')}
    ${rest > 0 ? `<button type="button" class="pv-meer" data-pv-meer="1">Toon ${Math.min(PV_STAP, rest)} meer (nog ${rest})</button>` : ''}`;
}

function pvControlsHtml() {
  const d = pvState.data;
  const tel = {};
  d.blogs.forEach((b) => { tel[b.status.code] = (tel[b.status.code] || 0) + 1; });
  const clusters = [...new Set(d.blogs.map((b) => b.cluster).filter(Boolean))].sort();
  return `
    <div class="pv-blogs-kop">
      <div class="pv-sectie-titel">Per blog</div>
      <div class="pv-controls">
        <input type="search" class="pv-zoek" data-pv-zoek placeholder="Zoek op titel of zoekwoord" value="${pvEsc(pvState.q)}" aria-label="Zoeken">
        <select data-pv-sort aria-label="Sorteren">
          <option value="vertoningen"${pvState.sort === 'vertoningen' ? ' selected' : ''}>Meest getoond</option>
          <option value="aandacht"${pvState.sort === 'aandacht' ? ' selected' : ''}>Aandacht eerst</option>
          <option value="nieuwste"${pvState.sort === 'nieuwste' ? ' selected' : ''}>Nieuwste eerst</option>
        </select>
        ${clusters.length > 1 ? `<select data-pv-cluster aria-label="Onderwerp"><option value="">Alle onderwerpen</option>${clusters.map((c) => `<option value="${pvEsc(c)}"${pvState.cluster === c ? ' selected' : ''}>${pvEsc(c)}</option>`).join('')}</select>` : ''}
      </div>
    </div>
    <div class="pv-chips">
      <button type="button" class="pv-chip${pvState.status === '' ? ' pv-chip-aan' : ''}" data-pv-chip="">Alle (${d.blogs.length})</button>
      ${PV_STATUSSEN.filter(([code]) => tel[code]).map(([code, label]) => `<button type="button" class="pv-chip${pvState.status === code ? ' pv-chip-aan' : ''}" data-pv-chip="${code}">${pvEsc(label)} (${tel[code]})</button>`).join('')}
    </div>`;
}

function renderPrestatiesV2(d) {
  const el = document.getElementById('performanceV2');
  if (!el) return;
  pvState.data = d;
  pvState.toon = PV_STAP;
  const t = d.totalen;
  const voortgang = `${t.blogsGepubliceerd} ${t.blogsGepubliceerd === 1 ? 'blog staat' : 'blogs staan'} live${t.blogsPipeline ? `, nog ${t.blogsPipeline} in de planning` : ''}.`;
  el.innerHTML = `
    ${d.toelichting ? `<div class="pv-card pv-toelichting"><div class="pv-sectie-titel">Toelichting van Advertisr</div><p>${pvEsc(d.toelichting)}</p></div>` : ''}
    <div class="pv-card pv-samenvatting">
      <div class="pv-sectie-titel">Zo gaat het nu</div>
      <p>${d.samenvatting.map(pvEsc).join(' ')}</p>
    </div>
    <div class="pv-tiles">${pvTiles(t)}</div>
    <div class="pv-voortgang">${pvEsc(voortgang)}</div>
    ${d.weken.length ? `<div class="pv-card"><div class="pv-sectie-titel">De laatste weken</div>
      <div class="pv-charts">${pvBars(d.weken, 'vertoningen', 'pv-bar-a', 'Keer getoond per week')}${pvBars(d.weken, 'clicks', 'pv-bar-b', 'Bezoekers vanuit Google per week')}</div>
      <div class="pv-muted pv-legenda">Een stip onder een week betekent dat er in die week een nieuwe blog live ging. De lichte staaf is de week die nog loopt.</div></div>` : ''}
    <div id="pvInzichten"></div>
    <div class="pv-card">
      <div id="pvBlogControls"></div>
      <div id="pvBlogList"></div>
    </div>
    <details class="pv-card pv-uitleg"><summary>Hoe lees ik dit?</summary>
      <p><b>Getoond</b> betekent dat een blog in de zoekresultaten van Google stond. Dat gebeurt vaak eerder dan dat iemand doorklikt.</p>
      <p><b>Positie</b> laten we in pagina's zien. Pagina 1 zijn de eerste tien resultaten, en daar komen de meeste bezoekers vandaan.</p>
      <p>Een nieuwe blog heeft meestal een paar weken nodig voordat Google hem oppakt. Cijfers uit Google lopen bovendien 2 tot 3 dagen achter.</p>
      <p>Blogs zijn vaak het begin van een oriëntatie. Iemand die eerst een blog leest en later via een andere weg terugkomt om te boeken, zien we niet terug. De cijfers over aanvragen en boekingen laten dus zien wat een blog aantoonbaar bijdraagt, niet alles wat een blog oplevert.</p>
    </details>
    <div class="pv-muted pv-footer">Periode ${pvEsc(pvDatum(d.periode.start))} tot en met ${pvEsc(pvDatum(d.periode.eind))}${d.laatstBijgewerkt ? `. Laatst bijgewerkt op ${pvEsc(pvDatum(d.laatstBijgewerkt))}` : ''}.</div>`;
  pvTekenInzichten();
  document.getElementById('pvBlogControls').innerHTML = pvControlsHtml();
  document.getElementById('pvBlogList').innerHTML = pvLijstHtml();
  el.classList.remove('hidden');

  const herteken = () => {
    document.getElementById('pvBlogControls').innerHTML = pvControlsHtml();
    document.getElementById('pvBlogList').innerHTML = pvLijstHtml();
  };
  el.onclick = (e) => {
    const toggle = e.target.closest('[data-pv-toggle]');
    if (toggle) {
      const i = toggle.getAttribute('data-pv-toggle');
      pvState.open[i] = !pvState.open[i];
      document.getElementById('pvBlogList').innerHTML = pvLijstHtml();
      return;
    }
    if (e.target.closest('[data-pv-meer]')) {
      pvState.toon += PV_STAP;
      document.getElementById('pvBlogList').innerHTML = pvLijstHtml();
      return;
    }
    const chip = e.target.closest('[data-pv-chip]');
    if (chip) {
      pvState.status = chip.getAttribute('data-pv-chip');
      pvState.toon = PV_STAP;
      herteken();
      return;
    }
    const ins = e.target.closest('[data-pv-ins]');
    if (ins) {
      const k = ins.getAttribute('data-pv-ins');
      pvState.insOpen[k] = !pvState.insOpen[k];
      pvTekenInzichten();
    }
  };
  el.onchange = (e) => {
    if (e.target.matches('[data-pv-sort]')) pvState.sort = e.target.value;
    else if (e.target.matches('[data-pv-cluster]')) pvState.cluster = e.target.value;
    else return;
    pvState.toon = PV_STAP;
    document.getElementById('pvBlogList').innerHTML = pvLijstHtml();
  };
  el.oninput = (e) => {
    if (!e.target.matches('[data-pv-zoek]')) return;
    pvState.q = e.target.value;
    pvState.toon = PV_STAP;
    document.getElementById('pvBlogList').innerHTML = pvLijstHtml();
  };
}

function pvTekenInzichten() {
  const box = document.getElementById('pvInzichten');
  if (!box) return;
  const i = pvState.data.inzichten;
  if (!(i.goed.length || i.kansen.length || i.aandacht.length)) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="pv-card"><div class="pv-sectie-titel">Wat we zien en wat we doen</div>
      <div class="pv-ins-grid">
        ${pvInzicht('goed', 'Goed nieuws', 'goed', i.goed, false)}
        ${pvInzicht('kansen', 'Kansen', 'kans', i.kansen, true)}
        ${pvInzicht('aandacht', 'Aandacht', 'aandacht', i.aandacht, true)}
      </div></div>`;
}
