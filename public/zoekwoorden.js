// Zoekwoorden over alle blogs heen: waar Google jullie mee toont en waar bezoekers vandaan komen.
// Telt de zoekwoorden per blog bij elkaar op. Positie is gewogen op vertoningen. Los van het scherm, zodat het testbaar is.
(function () {
  const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const nl = (n) => Number(n || 0).toLocaleString('nl-NL');
  const nl1 = (n) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // blogs: [{ zoekwoorden: [{ q, c, i, p }] }]. Geeft [{ q, i, c, p, blogs }] terug.
  function samenvoegen(blogs, sorteer) {
    const kaart = new Map();
    (Array.isArray(blogs) ? blogs : []).forEach((b) => {
      (b && Array.isArray(b.zoekwoorden) ? b.zoekwoorden : []).forEach((z) => {
        const q = String((z && (z.q || z.zoekwoord)) || '').trim();
        if (!q) return;
        const sleutel = q.toLowerCase();
        const i = Number(z.i !== undefined ? z.i : z.vertoningen) || 0;
        const c = Number(z.c !== undefined ? z.c : z.clicks) || 0;
        const p = Number(z.p !== undefined ? z.p : z.positie);
        const x = kaart.get(sleutel) || { q, i: 0, c: 0, pSom: 0, pGewicht: 0, blogs: 0 };
        x.i += i;
        x.c += c;
        x.blogs += 1;
        if (Number.isFinite(p) && p > 0 && i > 0) { x.pSom += p * i; x.pGewicht += i; }
        kaart.set(sleutel, x);
      });
    });
    const lijst = Array.from(kaart.values()).map((x) => ({ q: x.q, i: x.i, c: x.c, blogs: x.blogs, p: x.pGewicht > 0 ? x.pSom / x.pGewicht : null }));
    lijst.sort(sorteer === 'bezoekers'
      ? (a, b) => b.c - a.c || b.i - a.i || a.q.localeCompare(b.q)
      : (a, b) => b.i - a.i || b.c - a.c || a.q.localeCompare(b.q));
    return lijst;
  }

  function positieChip(p) {
    if (p === null || p === undefined) return '<span class="zw-pos zw-pos-geen">geen meting</span>';
    const klasse = p <= 10 ? 'zw-pos-goed' : (p <= 20 ? 'zw-pos-bijna' : 'zw-pos-ver');
    return `<span class="zw-pos ${klasse}">${nl1(p)}</span>`;
  }

  // opties: { aantal, alle, sorteer, idPrefix }
  function html(lijst, opties) {
    const o = opties || {};
    const maxAantal = o.alle ? lijst.length : (o.aantal || 8);
    const getoond = lijst.slice(0, maxAantal);
    if (!getoond.length) return '';
    const maxI = Math.max(1, ...getoond.map((x) => x.i));
    const rijen = getoond.map((x) => `<tr><td class="zw-q"><div class="zw-naam">${esc(x.q)}</div><div class="zw-balk"><span style="width:${Math.max(2, Math.round((x.i / maxI) * 100))}%"></span></div></td><td class="zw-num">${nl(x.i)}</td><td class="zw-num">${nl(x.c)}</td><td class="zw-num">${positieChip(x.p)}</td></tr>`).join('');
    const meer = lijst.length > (o.aantal || 8)
      ? `<button type="button" class="pv-toggle" data-zw-meer>${o.alle ? 'Toon minder' : `Toon alle ${lijst.length} zoekwoorden`}</button>` : '';
    return `<div class="ai-tabel-wrap"><table class="zw-tabel"><thead><tr><th>Zoekwoord</th><th class="zw-num">Getoond</th><th class="zw-num">Bezoekers</th><th class="zw-num">Positie</th></tr></thead><tbody>${rijen}</tbody></table></div>${meer}`;
  }

  const api = { samenvoegen, html };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Zoekwoorden = api;
})();
