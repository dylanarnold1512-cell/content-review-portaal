// Prestaties v2: weergave voor de klant. Alle teksten komen kant-en-klaar uit
// de server (src/services/prestaties.js); hier wordt alleen getekend.
// Alles wat uit data komt gaat door pvEsc zodat er nooit HTML uit data wordt uitgevoerd.

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

const pvState = { sort: 'vertoningen', cluster: '', open: {}, data: null };

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

function pvInzicht(kop, klasse, lijst, metActie) {
  if (!lijst.length) return '';
  return `
    <div class="pv-ins pv-ins-${klasse}">
      <div class="pv-ins-kop">${pvEsc(kop)}</div>
      ${lijst.map((i) => `
        <div class="pv-ins-item">
          <div class="pv-ins-titel">${pvEsc(i.titel)}</div>
          <div class="pv-ins-tekst">${pvEsc(i.tekst)}</div>
          ${metActie && i.actie ? `<div class="pv-ins-actie">Wat wij doen: ${pvEsc(i.actie)}</div>` : ''}
        </div>`).join('')}
    </div>`;
}

function pvBlogKaart(b, idx) {
  const open = Boolean(pvState.open[idx]);
  const dagen = b.leeftijdDagen === null ? '' : b.leeftijdDagen === 0 ? 'vandaag live' : `${b.leeftijdDagen} ${b.leeftijdDagen === 1 ? 'dag' : 'dagen'} live`;
  const kw = b.zoekwoorden.length
    ? `<table class="pv-kw"><thead><tr><th>Zoekwoord</th><th>Getoond</th><th>Clicks</th><th>Positie</th></tr></thead><tbody>${b.zoekwoorden.map((z) => `
        <tr><td>${pvEsc(z.q)}</td><td>${pvNl(z.i)}</td><td>${pvNl(z.c)}</td><td>${pvEsc(z.label || '')}</td></tr>`).join('')}</tbody></table>`
    : '<div class="pv-muted">Nog geen zoekwoorden gemeten.</div>';
  const pijl = b.hkPositie !== null && b.hkPositieVorig !== null
    ? (b.hkPositieVorig - b.hkPositie >= 0.5 ? ' <span class="pv-up">omhoog</span>' : b.hkPositie - b.hkPositieVorig >= 0.5 ? ' <span class="pv-down">omlaag</span>' : '')
    : '';
  return `
    <div class="pv-blog">
      <div class="pv-blog-top">
        <div>
          <div class="pv-blog-titel">${b.url ? `<a href="${pvEsc(b.url)}" target="_blank" rel="noopener">${pvEsc(b.titel)}</a>` : pvEsc(b.titel)}</div>
          <div class="pv-blog-meta">${[b.cluster, dagen].filter(Boolean).map(pvEsc).join(' · ')}</div>
        </div>
        <span class="pv-badge pv-badge-${pvEsc(b.status.code)}">${pvEsc(b.status.label)}</span>
      </div>
      ${b.hoofdwoord ? `<div class="pv-hw"><span class="pv-muted">Hoofdzoekwoord:</span> ${pvEsc(b.hoofdwoord)}. ${pvEsc(b.hoofdwoordTekst || '')}${pijl}</div>` : ''}
      ${b.indexatie && b.indexatie.tekst ? `<div class="pv-hw"><span class="pv-muted">In Google:</span> ${pvEsc(b.indexatie.tekst)}</div>` : ''}
      <div class="pv-blog-stats">
        <span><b>${pvNl(b.vertoningen)}</b> getoond</span>
        <span><b>${pvNl(b.clicks)}</b> ${b.clicks === 1 ? 'bezoeker' : 'bezoekers'}</span>
        ${b.paginaweergaven !== null && b.paginaweergaven !== undefined ? `<span><b>${pvNl(b.paginaweergaven)}</b> paginaweergaven</span>` : ''}
      </div>
      <button type="button" class="pv-toggle" data-pv-toggle="${idx}">${open ? 'Zoekwoorden verbergen' : 'Zoekwoorden tonen'}</button>
      ${open ? `<div class="pv-kw-wrap">${kw}</div>` : ''}
    </div>`;
}

function pvBlogsHtml() {
  const d = pvState.data;
  let lijst = d.blogs.map((b, i) => ({ b, i }));
  if (pvState.cluster) lijst = lijst.filter((x) => x.b.cluster === pvState.cluster);
  if (pvState.sort === 'nieuwste') lijst.sort((a, c) => (c.b.publicatiedatum || '').localeCompare(a.b.publicatiedatum || ''));
  const clusters = [...new Set(d.blogs.map((b) => b.cluster).filter(Boolean))].sort();
  return `
    <div class="pv-blogs-kop">
      <div class="pv-sectie-titel">Per blog</div>
      <div class="pv-controls">
        <select data-pv-sort aria-label="Sorteren">
          <option value="vertoningen"${pvState.sort === 'vertoningen' ? ' selected' : ''}>Meest getoond</option>
          <option value="nieuwste"${pvState.sort === 'nieuwste' ? ' selected' : ''}>Nieuwste eerst</option>
        </select>
        ${clusters.length > 1 ? `<select data-pv-cluster aria-label="Onderwerp"><option value="">Alle onderwerpen</option>${clusters.map((c) => `<option value="${pvEsc(c)}"${pvState.cluster === c ? ' selected' : ''}>${pvEsc(c)}</option>`).join('')}</select>` : ''}
      </div>
    </div>
    ${lijst.length ? lijst.map((x) => pvBlogKaart(x.b, x.i)).join('') : '<div class="pv-muted">Geen blogs gevonden.</div>'}`;
}

function renderPrestatiesV2(d) {
  const el = document.getElementById('performanceV2');
  if (!el) return;
  pvState.data = d;
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
    ${(d.inzichten.goed.length || d.inzichten.kansen.length || d.inzichten.aandacht.length) ? `
    <div class="pv-card"><div class="pv-sectie-titel">Wat we zien en wat we doen</div>
      <div class="pv-ins-grid">
        ${pvInzicht('Goed nieuws', 'goed', d.inzichten.goed, false)}
        ${pvInzicht('Kansen', 'kans', d.inzichten.kansen, true)}
        ${pvInzicht('Aandacht', 'aandacht', d.inzichten.aandacht, true)}
      </div></div>` : ''}
    <div class="pv-card" id="pvBlogs">${pvBlogsHtml()}</div>
    <details class="pv-card pv-uitleg"><summary>Hoe lees ik dit?</summary>
      <p><b>Getoond</b> betekent dat een blog in de zoekresultaten van Google stond. Dat gebeurt vaak eerder dan dat iemand doorklikt.</p>
      <p><b>Positie</b> laten we in pagina's zien. Pagina 1 zijn de eerste tien resultaten, en daar komen de meeste bezoekers vandaan.</p>
      <p>Een nieuwe blog heeft meestal een paar weken nodig voordat Google hem oppakt. Cijfers uit Google lopen bovendien 2 tot 3 dagen achter.</p>
    </details>
    <div class="pv-muted pv-footer">Periode ${pvEsc(pvDatum(d.periode.start))} tot en met ${pvEsc(pvDatum(d.periode.eind))}${d.laatstBijgewerkt ? `. Laatst bijgewerkt op ${pvEsc(pvDatum(d.laatstBijgewerkt))}` : ''}.</div>`;
  el.classList.remove('hidden');
  el.onclick = (e) => {
    const btn = e.target.closest('[data-pv-toggle]');
    if (!btn) return;
    const i = btn.getAttribute('data-pv-toggle');
    pvState.open[i] = !pvState.open[i];
    document.getElementById('pvBlogs').innerHTML = pvBlogsHtml();
  };
  el.onchange = (e) => {
    if (e.target.matches('[data-pv-sort]')) pvState.sort = e.target.value;
    else if (e.target.matches('[data-pv-cluster]')) pvState.cluster = e.target.value;
    else return;
    document.getElementById('pvBlogs').innerHTML = pvBlogsHtml();
  };
}
