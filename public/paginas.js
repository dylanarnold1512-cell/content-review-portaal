// Landingspagina's in het klantportaal (Pagr. stap 5). De klant keurt niets goed: hij ziet welke pagina's er zijn,
// de stand, waarom een pagina gepland staat en kan een idee aandragen. Google en AI per pagina volgen in stap 6.
(function () {
  const KLASSE = { 'Gepland': 'p-pil-plan', 'In de maak': 'p-pil-ai', 'Ter controle': 'p-pil-let-op', 'Live': 'p-pil-goed' };
  const VOLGORDE = { 'Live': 0, 'Ter controle': 1, 'In de maak': 2, 'Gepland': 3 };

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function datum(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  }
  function veilig(url) {
    return /^https?:\/\//i.test(url || '') ? url : '';
  }

  function nl(n) { return Number(n).toLocaleString('nl-NL'); }
  function googleTekst(p, meting) {
    if (p.stand !== 'Live') return '';
    if (!meting || !meting.google || !p.google) return 'nog niet gemeten';
    const g = p.google;
    if (!g.vertoningen) return 'nog geen vertoningen';
    const pijl = g.trend === 'stijgt' ? ' (stijgt)' : g.trend === 'zakt' ? ' (zakt)' : '';
    return `${g.positie != null ? `positie ${String(g.positie).replace('.', ',')}, ` : ''}${nl(g.klikken)} klikken, ${nl(g.vertoningen)} vertoningen${pijl}`;
  }
  function aiTekst(p, meting) {
    if (p.stand !== 'Live') return '';
    if (!meting || !meting.ai || !p.ai) return 'nog niet gemeten';
    return p.ai.geciteerd > 0 ? `genoemd als bron (${p.ai.geciteerd}x)` : 'nog niet genoemd';
  }

  function tekenLijst(data) {
    const k = data.kerncijfers;
    const paginas = [...data.paginas].sort((a, b) => (VOLGORDE[a.stand] - VOLGORDE[b.stand]) || String(b.bijgewerkt).localeCompare(String(a.bijgewerkt)));
    const rijen = paginas.map((p) => `
      <tr>
        <td><strong>${veilig(p.url) ? `<a href="${esc(veilig(p.url))}" target="_blank" rel="noopener">${esc(p.titel)}</a>` : esc(p.titel)}</strong>${p.reden ? `<div class="pg-reden">${esc(p.reden)}</div>` : ''}</td>
        <td><span class="p-pil ${KLASSE[p.stand] || 'p-pil-neutraal'}">${esc(p.stand)}</span></td>
        <td class="pg-gemeten">${googleTekst(p, data.meting)}</td>
        <td class="pg-gemeten">${aiTekst(p, data.meting)}</td>
        <td>${p.schrijfOp ? `Wordt geschreven rond ${esc(datum(p.schrijfOp))}` : esc(datum(p.stand === 'Live' ? (p.liveDatum || p.bijgewerkt) : p.bijgewerkt))}</td>
      </tr>`).join('');
    return `
      <div class="p-kerncijfers">
        <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Pagina's live</div><div class="p-kerncijfer-waarde">${k.live}</div><div class="p-kerncijfer-sub">${k.dezeMaandLive} deze maand erbij</div></div>
        <div class="p-kerncijfer"><div class="p-kerncijfer-kop">In de maak</div><div class="p-kerncijfer-waarde">${k.inDeMaak}</div><div class="p-kerncijfer-sub">wij werken eraan</div></div>
        <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Gepland</div><div class="p-kerncijfer-waarde">${k.gepland}</div><div class="p-kerncijfer-sub">volgens het plan</div></div>
        ${k.aiVragen ? `<div class="p-kerncijfer"><div class="p-kerncijfer-kop">AI noemt jullie</div><div class="p-kerncijfer-waarde">${k.aiGenoemd}/${k.aiVragen}</div><div class="p-kerncijfer-sub">vragen waar jullie genoemd worden</div></div>` : ''}
      </div>
      <section class="p-kaart pg-kaart">
        <div class="pg-tabel-wrap">
          <table class="pg-tabel">
            <thead><tr><th>Pagina</th><th>Stand</th><th>Google</th><th>AI</th><th>Bijgewerkt</th></tr></thead>
            <tbody>${rijen || '<tr><td colspan="5" class="pg-gemeten">Er staan nog geen pagina\'s. Zodra het plan is vastgesteld zie je ze hier.</td></tr>'}</tbody>
          </table>
        </div>
      </section>`;
  }

  async function laad() {
    const root = document.getElementById('paginasInhoud');
    if (!root) return;
    const clientId = (typeof state !== 'undefined' && state.clientId) || null;
    if (!clientId) return;
    root.innerHTML = '<p class="pg-gemeten">Laden...</p>';
    try {
      const data = await api(`/${clientId}/paginas`);
      root.innerHTML = tekenLijst(data);
    } catch (err) {
      root.innerHTML = `<p class="login-error">${esc(err.message)}</p>`;
    }
  }

  function bindIdee() {
    const knop = document.getElementById('paginaIdeeKnop');
    const form = document.getElementById('paginaIdeeForm');
    if (!knop || !form) return;
    knop.addEventListener('click', () => { form.classList.toggle('hidden'); document.getElementById('paginaIdeeTitel').focus(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fout = document.getElementById('paginaIdeeFout');
      const titel = document.getElementById('paginaIdeeTitel').value.trim();
      const toelichting = document.getElementById('paginaIdeeToelichting').value.trim();
      fout.textContent = '';
      if (!titel) { fout.textContent = 'Vul een onderwerp in.'; return; }
      try {
        await api(`/${state.clientId}/paginas/idee`, { method: 'POST', body: JSON.stringify({ titel, toelichting }) });
        form.reset();
        form.classList.add('hidden');
        await laad();
      } catch (err) {
        fout.textContent = err.message;
      }
    });
  }


  // ---- Overzicht en Resultaten voor klanten met alleen Pagr. (stap 13) ----
  // Pure rekenfuncties (getest in test/pagrKlant.test.js) en daarna het tekenen.
  function somResultaten(paginas) {
    const live = (paginas || []).filter((p) => p.stand === 'Live');
    const metGoogle = live.filter((p) => p.google && p.google.vertoningen > 0);
    const klikken = metGoogle.reduce((t, p) => t + (p.google.klikken || 0), 0);
    const vertoningen = metGoogle.reduce((t, p) => t + (p.google.vertoningen || 0), 0);
    const genoemd = live.filter((p) => p.ai && p.ai.geciteerd > 0).length;
    return { live: live.length, metGoogle: metGoogle.length, klikken, vertoningen, genoemd };
  }
  function volgende(paginas, aantal = 3) {
    return (paginas || []).filter((p) => p.stand === 'Gepland').sort((a, b) => (a.schrijfOp || '9999').localeCompare(b.schrijfOp || '9999')).slice(0, aantal);
  }
  function recentLive(paginas, aantal = 3) {
    return (paginas || []).filter((p) => p.stand === 'Live')
      .sort((a, b) => String(b.liveDatum || b.bijgewerkt).localeCompare(String(a.liveDatum || a.bijgewerkt))).slice(0, aantal);
  }

  async function haalData() {
    const clientId = (typeof state !== 'undefined' && state.clientId) || null;
    if (!clientId) return null;
    return api(`/${clientId}/paginas`);
  }

  function paginaLink(p) {
    return veilig(p.url) ? `<a href="${esc(veilig(p.url))}" target="_blank" rel="noopener">${esc(p.titel)}</a>` : esc(p.titel);
  }

  async function laadOverzicht() {
    const root = document.getElementById('pagrOverzichtInhoud');
    if (!root) return;
    root.innerHTML = '<p class="pg-gemeten">Laden...</p>';
    try {
      const data = await haalData();
      if (!data) return;
      const k = data.kerncijfers;
      const komt = volgende(data.paginas);
      const live = recentLive(data.paginas);
      const controle = data.paginas.filter((p) => p.stand === 'Ter controle').length;
      const naam = (document.getElementById('clientName') || {}).textContent || '';
      const status = controle
        ? `${controle === 1 ? 'Een pagina wordt' : controle + " pagina's worden"} door ons gecontroleerd voordat hij live gaat.`
        : (k.inDeMaak ? `We werken aan ${k.inDeMaak === 1 ? 'een pagina' : k.inDeMaak + " pagina's"}.` : (k.live ? 'Alles wat gepland stond is live.' : 'Zodra het plan is vastgesteld beginnen we met de eerste pagina\'s.'));
      root.innerHTML = `
        <div class="p-ov-kop"><div><h1>Overzicht${naam ? ' ' + esc(naam) : ''}</h1><p>${esc(status)}</p></div>
          <div class="p-ov-kop-acties"><button type="button" class="p-knop p-knop-hoofd" id="pagrOvIdee">+ Idee aandragen</button></div></div>
        <div class="p-kerncijfers">
          <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Pagina's live</div><div class="p-kerncijfer-waarde">${k.live}</div><div class="p-kerncijfer-sub">${k.dezeMaandLive} deze maand erbij</div></div>
          <div class="p-kerncijfer"><div class="p-kerncijfer-kop">In de maak</div><div class="p-kerncijfer-waarde">${k.inDeMaak}</div><div class="p-kerncijfer-sub">wij werken eraan</div></div>
          <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Gepland</div><div class="p-kerncijfer-waarde">${k.gepland}</div><div class="p-kerncijfer-sub">volgens het plan</div></div>
          ${k.aiVragen ? `<div class="p-kerncijfer"><div class="p-kerncijfer-kop">AI noemt jullie</div><div class="p-kerncijfer-waarde">${k.aiGenoemd}/${k.aiVragen}</div><div class="p-kerncijfer-sub">vragen waar jullie genoemd worden</div></div>` : ''}
        </div>
        <div class="pg-twee">
          <section class="p-kaart pg-blok"><h2>Hierna</h2>
            ${komt.length ? komt.map((p) => `<div class="pg-regel"><strong>${esc(p.titel)}</strong>${p.schrijfOp ? `<div class="pg-reden">Wordt geschreven rond ${esc(datum(p.schrijfOp))}</div>` : ''}${p.reden ? `<div class="pg-reden">${esc(p.reden)}</div>` : ''}</div>`).join('') : '<p class="pg-gemeten">Er staat op dit moment niets gepland. Heb je zelf een idee, dan hoor ik het graag.</p>'}
          </section>
          <section class="p-kaart pg-blok"><h2>Net live</h2>
            ${live.length ? live.map((p) => `<div class="pg-regel"><strong>${paginaLink(p)}</strong><div class="pg-reden">${esc(datum(p.liveDatum || p.bijgewerkt))}</div></div>`).join('') : '<p class="pg-gemeten">Er staat nog geen pagina live.</p>'}
          </section>
        </div>`;
      const idee = document.getElementById('pagrOvIdee');
      if (idee) idee.addEventListener('click', () => { switchTab('paginas'); const f = document.getElementById('paginaIdeeForm'); if (f) f.classList.remove('hidden'); });
    } catch (err) {
      root.innerHTML = `<p class="login-error">${esc(err.message)}</p>`;
    }
  }

  async function laadResultaten() {
    const root = document.getElementById('pagrResultatenInhoud');
    if (!root) return;
    root.innerHTML = '<p class="pg-gemeten">Laden...</p>';
    try {
      const data = await haalData();
      if (!data) return;
      const live = data.paginas.filter((p) => p.stand === 'Live')
        .sort((a, b) => ((b.google && b.google.klikken) || 0) - ((a.google && a.google.klikken) || 0));
      const som = somResultaten(data.paginas);
      const uitleg = !data.meting.google
        ? 'De meting van Google staat nog niet aan. Zodra hij aan staat zie je hier hoeveel mensen de pagina\'s vinden en aanklikken.'
        : (som.metGoogle ? '' : 'Er zijn nog geen vertoningen gemeten. Een nieuwe pagina heeft meestal enkele weken nodig voordat Google hem toont.');
      const rijen = live.map((p) => `<tr><td><strong>${paginaLink(p)}</strong></td><td class="pg-gemeten">${googleTekst(p, data.meting)}</td><td class="pg-gemeten">${aiTekst(p, data.meting)}</td></tr>`).join('');
      root.innerHTML = `
        <div class="p-ov-kop"><div><h1>Resultaten</h1><p>Hoe de pagina's die live staan presteren in Google en in AI antwoorden.</p></div></div>
        <div class="p-kerncijfers">
          <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Pagina's live</div><div class="p-kerncijfer-waarde">${som.live}</div><div class="p-kerncijfer-sub">${som.metGoogle} al gemeten</div></div>
          <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Klikken uit Google</div><div class="p-kerncijfer-waarde">${nl(som.klikken)}</div><div class="p-kerncijfer-sub">van alle live pagina's</div></div>
          <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Vertoningen</div><div class="p-kerncijfer-waarde">${nl(som.vertoningen)}</div><div class="p-kerncijfer-sub">keer getoond in Google</div></div>
          <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Genoemd door AI</div><div class="p-kerncijfer-waarde">${som.genoemd}</div><div class="p-kerncijfer-sub">pagina's als bron genoemd</div></div>
        </div>
        ${uitleg ? `<p class="pg-gemeten" style="margin-top:14px;">${esc(uitleg)}</p>` : ''}
        <section class="p-kaart pg-kaart"><div class="pg-tabel-wrap"><table class="pg-tabel">
          <thead><tr><th>Pagina</th><th>Google</th><th>AI</th></tr></thead>
          <tbody>${rijen || '<tr><td colspan="3" class="pg-gemeten">Zodra er een pagina live staat zie je hier hoe hij scoort.</td></tr>'}</tbody>
        </table></div></section>`;
    } catch (err) {
      root.innerHTML = `<p class="login-error">${esc(err.message)}</p>`;
    }
  }

  window.loadPagrOverzicht = laadOverzicht;
  window.loadPagrResultaten = laadResultaten;
  window.loadPaginas = laad;
  document.addEventListener('DOMContentLoaded', bindIdee);
  if (typeof module !== 'undefined' && module.exports) module.exports = { esc, veilig, datum, somResultaten, volgende, recentLive };
})();
