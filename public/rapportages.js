// Rapportages: vaste maandrapporten (snapshots) die n8n op de 4e van de maand
// vastlegt. Hier wordt alleen getekend, er wordt niets opnieuw berekend.
// Alles wat uit data komt gaat door rpEsc.
(function () {
  const rp = { lijst: null, huidig: null, gevraagd: null };

  function rpEsc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const nl = (n) => Number(n).toLocaleString('nl-NL');
  const nl1 = (n) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const dat = (iso) => {
    if (!iso) return '';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  function verschil(nu, vorig) {
    if (vorig === null || vorig === undefined || !Number.isFinite(Number(vorig))) return '';
    const d = Number(nu) - Number(vorig);
    if (d === 0) return '<span class="pv-delta pv-flat">gelijk aan de maand ervoor</span>';
    return `<span class="pv-delta ${d > 0 ? 'pv-up' : 'pv-down'}">${nl(Math.abs(d))} ${d > 0 ? 'meer' : 'minder'} dan de maand ervoor (${nl(vorig)})</span>`;
  }

  function tegel(label, waarde, extra) {
    return `<div class="pv-tile"><div class="pv-tile-label">${rpEsc(label)}</div><div class="pv-tile-value">${rpEsc(waarde)}</div>${extra || ''}</div>`;
  }

  function blogTabel(blogs) {
    if (!blogs.length) return '<p class="pv-muted">Geen blogs met cijfers in deze maand.</p>';
    return `<table class="pv-kw rp-tabel"><thead><tr><th>Blog</th><th>Getoond</th><th>Bezoekers</th></tr></thead><tbody>${blogs.map((b) => `
      <tr><td>${b.url ? `<a href="${rpEsc(b.url)}" target="_blank" rel="noopener">${rpEsc(b.titel)}</a>` : rpEsc(b.titel)}</td><td>${nl(b.vertoningen || 0)}</td><td>${nl(b.clicks || 0)}</td></tr>`).join('')}</tbody></table>`;
  }

  function vooruitblik(lijst) {
    if (!lijst.length) {
      return '<p class="pv-muted">Voor volgende maand zijn er nog geen onderbouwde kansen. Zodra Search Console genoeg data heeft, staat hier wat we gaan oppakken.</p>';
    }
    return `<div class="rp-punten">${lijst.map((p) => `
      <div class="rp-punt"><div class="pv-ins-titel">${rpEsc(p.titel)}</div><div class="pv-ins-tekst">${rpEsc(p.tekst)}</div></div>`).join('')}</div>`;
  }

  function renderRapport(r) {
    const t = r.totalen || {};
    const tegels = [
      tegel('Keer getoond in Google', nl(t.vertoningen || 0), verschil(t.vertoningen || 0, t.vertoningen_vorig)),
      tegel('Bezoekers vanuit Google', nl(t.clicks || 0), verschil(t.clicks || 0, t.clicks_vorig))
    ];
    if (t.paginaweergaven !== null && t.paginaweergaven !== undefined) tegels.push(tegel('Paginaweergaven', nl(t.paginaweergaven)));
    if (t.hk_positie_gemiddeld !== null && t.hk_positie_gemiddeld !== undefined) {
      tegels.push(tegel('Positie hoofdzoekwoorden', nl1(t.hk_positie_gemiddeld)));
    }
    const nieuw = r.nieuweBlogs.length
      ? `<ul class="rp-lijst">${r.nieuweBlogs.map((b) => `<li>${rpEsc(b.titel)}${b.datum ? ` <span class="pv-muted">(${rpEsc(dat(b.datum))})</span>` : ''}</li>`).join('')}</ul>`
      : '<p class="pv-muted">Er zijn deze maand geen nieuwe blogs live gegaan.</p>';
    return `
      <div class="pv-card pv-samenvatting">
        <div class="pv-sectie-titel">Terugblik op ${rpEsc(r.label)}</div>
        ${r.terugblik.length ? r.terugblik.map((a) => `<p>${rpEsc(a)}</p>`).join('') : '<p class="pv-muted">Voor deze maand is geen toelichting beschikbaar.</p>'}
        ${r.voortgang ? `<p><strong>${rpEsc(r.voortgang)}</strong></p>` : ''}
      </div>
      <div class="pv-tiles">${tegels.join('')}</div>
      <div class="pv-card"><div class="pv-sectie-titel">Nieuwe blogs in ${rpEsc(r.label)}</div>${nieuw}</div>
      <div class="pv-card"><div class="pv-sectie-titel">Blogs met de meeste vertoningen</div>${blogTabel(r.blogs)}</div>
      <div class="pv-card"><div class="pv-sectie-titel">Vooruitblik</div>${vooruitblik(r.vooruitblik)}</div>
      <div class="pv-muted pv-footer">${rpEsc(r.bron || '')}${r.aangemaakt ? `. Vastgelegd op ${rpEsc(dat(r.aangemaakt))}. Deze cijfers staan vast en veranderen niet meer.` : ''}</div>`;
  }

  function el(id) { return document.getElementById(id); }

  async function toon(maand) {
    const inhoud = el('rapportenInhoud');
    inhoud.innerHTML = '<p class="pv-muted">Laden...</p>';
    try {
      rp.huidig = await api(`/${state.clientId}/rapporten/${encodeURIComponent(maand)}`);
      inhoud.innerHTML = renderRapport(rp.huidig);
    } catch (err) {
      inhoud.innerHTML = `<p class="login-error">${rpEsc(err.message)}</p>`;
    }
  }

  async function laad() {
    const kop = el('rapportenKop');
    const inhoud = el('rapportenInhoud');
    try {
      const data = await api(`/${state.clientId}/rapporten`);
      rp.lijst = data.rapporten || [];
    } catch (err) {
      kop.innerHTML = '';
      inhoud.innerHTML = `<p class="login-error">${rpEsc(err.message)}</p>`;
      return;
    }
    if (!rp.lijst.length) {
      kop.innerHTML = '';
      inhoud.innerHTML = '<div class="pv-card"><p>Het eerste maandrapport verschijnt op de 4e van de volgende maand. Daarin vind je een terugblik op de maand, de cijfers die vastliggen en een vooruitblik.</p></div>';
      return;
    }
    const gekozen = rp.lijst.some((x) => x.maand === rp.gevraagd) ? rp.gevraagd : rp.lijst[0].maand;
    rp.gevraagd = null;
    kop.innerHTML = `<label class="rp-kies">Maand <select id="rapportKeuze">${rp.lijst.map((x) => `<option value="${rpEsc(x.maand)}"${x.maand === gekozen ? ' selected' : ''}>${rpEsc(x.label)}</option>`).join('')}</select></label>`;
    el('rapportKeuze').addEventListener('change', (e) => toon(e.target.value));
    toon(gekozen);
  }

  window.loadRapportages = function (maand) {
    if (maand) rp.gevraagd = maand;
    return laad();
  };
})();
