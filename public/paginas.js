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
        <td>${esc(datum(p.stand === 'Live' ? (p.liveDatum || p.bijgewerkt) : p.bijgewerkt))}</td>
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

  window.loadPaginas = laad;
  document.addEventListener('DOMContentLoaded', bindIdee);
  if (typeof module !== 'undefined' && module.exports) module.exports = { esc, veilig, datum };
})();
