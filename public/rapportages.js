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

  const F = () => window.PortaalFormat;
  const U = () => window.PortaalUI;
  let alleBlogs = false;
  let alleVooruit = false;

  function blogTabel(blogs) {
    const metCijfers = blogs.filter((b) => (b.vertoningen || 0) > 0 || (b.clicks || 0) > 0);
    const zonder = blogs.length - metCijfers.length;
    const getoond = alleBlogs ? blogs : metCijfers;
    if (!getoond.length) return U().legeStand({ soort: 'wacht', titel: 'Geen blogs met cijfers in deze maand', tekst: 'Zodra Google een blog toont, staat hij hier.' });
    const rijen = getoond.map((b) => `<tr><td>${b.url ? `<a href="${rpEsc(b.url)}" target="_blank" rel="noopener">${rpEsc(b.titel)}</a>` : rpEsc(b.titel)}</td><td class="rp-num">${rpEsc(F().getal(b.vertoningen || 0))}</td><td class="rp-num">${rpEsc(F().getal(b.clicks || 0))}</td></tr>`).join('');
    return `<div class="ai-tabel-wrap"><table class="ai-tabel rp-tabel"><thead><tr><th>Blog</th><th class="rp-num">Getoond</th><th class="rp-num">Bezoekers</th></tr></thead><tbody>${rijen}</tbody></table></div>` +
      (zonder > 0 ? `<button type="button" class="pv-toggle" id="rpAlleBlogs">${alleBlogs ? 'Verberg de blogs zonder cijfers' : `Toon ook de blogs zonder cijfers (${zonder})`}</button>` : '');
  }

  function vooruitblik(lijst) {
    if (!lijst.length) {
      return U().legeStand({ soort: 'wacht', titel: 'Nog geen onderbouwde kansen', tekst: 'Zodra Search Console genoeg data heeft, staat hier wat we gaan oppakken.' });
    }
    const zichtbaar = alleVooruit ? lijst : lijst.slice(0, 3);
    return '<div class="rp-punten">' + zichtbaar.map((p) => `<div class="rp-punt"><div class="pv-ins-titel">${rpEsc(p.titel)}</div><div class="pv-ins-tekst">${rpEsc(p.tekst)}</div></div>`).join('') + '</div>' +
      (lijst.length > 3 ? `<button type="button" class="pv-toggle" id="rpAlleVooruit">${alleVooruit ? 'Toon minder' : `Toon alle ${lijst.length}`}</button>` : '');
  }

  function effectenKaart(e, label) {
    if (!e || !e.items || !e.items.length) return '';
    return U().kaart({ titel: 'Wat hebben we gedaan en wat was het effect', uitleg: `Metingen die in ${label} zijn gedaan. Het zijn gemeten cijfers uit Google. Ze laten niet zien wat de oorzaak was.`,
      inhoud: e.items.map((i) => `<div class="pv-effect-item"><div><span class="pv-effect-soort">${rpEsc(i.soortLabel)}</span>${i.datum ? `<span class="pv-muted"> ${rpEsc(F().datumLang(i.datum))}</span>` : ''}</div><div class="pv-ins-titel">${rpEsc(i.titel)}</div>${i.regels.map((x) => `<div class="pv-ins-tekst">${rpEsc(x)}</div>`).join('')}</div>`).join('') });
  }

  function renderRapport(r) {
    const Fm = F();
    const t = r.totalen || {};
    const vNu = t.vertoningen || 0;
    const regel = vNu > 0 ? `In ${r.label} stonden jullie blogs ${Fm.getal(vNu)} keer in Google` : `In ${r.label} werden jullie blogs nog niet getoond in Google`;
    const vorig = (v) => (v === null || v === undefined ? '' : Fm.getal(v) + ' in de maand ervoor');
    const lijst = [
      { label: 'Keer getoond in Google', icoon: 'oog', waarde: Fm.getal(vNu), verschil: Fm.verschil(vNu, t.vertoningen_vorig), vergelijking: vorig(t.vertoningen_vorig) },
      { label: 'Bezoekers vanuit Google', icoon: 'mensen', waarde: Fm.getal(t.clicks || 0), verschil: Fm.verschil(t.clicks || 0, t.clicks_vorig), vergelijking: vorig(t.clicks_vorig) }
    ];
    if (t.paginaweergaven !== null && t.paginaweergaven !== undefined) lijst.push({ label: 'Paginaweergaven', icoon: 'blad', waarde: Fm.getal(t.paginaweergaven), vergelijking: 'Gemeten in Google Analytics' });
    if (t.hk_positie_gemiddeld !== null && t.hk_positie_gemiddeld !== undefined) lijst.push({ label: 'Positie hoofdzoekwoorden', icoon: 'grafiek', waarde: Fm.decimaal(t.hk_positie_gemiddeld, 1), vergelijking: 'Gemiddelde positie. Lager is beter.' });
    const nieuw = r.nieuweBlogs.length
      ? `<ul class="rp-lijst">${r.nieuweBlogs.map((b) => `<li>${rpEsc(b.titel)}${b.datum ? ` <span class="pv-muted">(${rpEsc(Fm.datumLang(b.datum))})</span>` : ''}</li>`).join('')}</ul>`
      : U().legeStand({ soort: 'neutraal', titel: 'Geen nieuwe blogs', tekst: 'Er zijn deze maand geen nieuwe blogs live gegaan.' });
    const status = `<section class="p-kaart p-ov-status" data-toon="goed"><div class="p-ov-status-hoofd"><div class="p-ov-status-regel"><span class="p-ov-puls"></span>${rpEsc(regel)}</div>
      <p>${rpEsc(r.voortgang || 'Dit rapport ligt vast. De cijfers veranderen niet meer.')}</p></div>
      <div class="p-ov-status-volgend"><div class="p-ov-volgend"><span class="p-ov-lbl">Nieuwe blogs</span><span class="p-ov-val">${r.nieuweBlogs.length}</span><span class="p-ov-txt">in ${rpEsc(r.label)}</span></div>
      <div class="p-ov-volgend"><span class="p-ov-lbl">Vastgelegd op</span><span class="p-ov-val">${rpEsc(r.aangemaakt ? Fm.datumKort(r.aangemaakt) : '')}</span><span class="p-ov-txt">Staat vast</span></div></div></section>`;
    const terug = r.terugblik.length ? r.terugblik.map((a) => `<p>${rpEsc(a)}</p>`).join('') : '<p class="pv-muted">Voor deze maand is geen toelichting beschikbaar.</p>';
    return `${status}
      <section class="p-kerncijfers">${lijst.map((x) => U().kerncijfer(x)).join('')}</section>
      <div class="p-ov-raster2">
        <div class="p-ov-stapel">
          ${U().kaart({ titel: `Terugblik op ${r.label}`, inhoud: `<div class="rp-tekst">${terug}</div>` })}
          ${U().kaart({ titel: 'Blogs met de meeste vertoningen', inhoud: blogTabel(r.blogs) })}
        </div>
        <div class="p-ov-stapel">
          ${U().kaart({ titel: `Nieuwe blogs in ${r.label}`, inhoud: nieuw })}
          ${effectenKaart(r.effecten, r.label)}
          ${U().kaart({ titel: 'Vooruitblik', inhoud: vooruitblik(r.vooruitblik) })}
        </div>
      </div>
      <div class="pv-muted pv-footer">${rpEsc(r.bron || '')}${r.aangemaakt ? `. Vastgelegd op ${rpEsc(Fm.datumLang(r.aangemaakt))}. Deze cijfers staan vast en veranderen niet meer.` : ''}</div>`;
  }

  function el(id) { return document.getElementById(id); }

  function bindRapport(inhoud) {
    const blogs = el('rpAlleBlogs');
    if (blogs) blogs.addEventListener('click', () => { alleBlogs = !alleBlogs; inhoud.innerHTML = renderRapport(rp.huidig); bindRapport(inhoud); });
    const vooruit = el('rpAlleVooruit');
    if (vooruit) vooruit.addEventListener('click', () => { alleVooruit = !alleVooruit; inhoud.innerHTML = renderRapport(rp.huidig); bindRapport(inhoud); });
  }

  async function toon(maand) {
    const inhoud = el('rapportenInhoud');
    alleBlogs = false;
    alleVooruit = false;
    inhoud.innerHTML = U().laden([{ breedte: '100%', hoogte: 120 }, { breedte: '100%', hoogte: 90 }, { breedte: '100%', hoogte: 200 }]);
    try {
      rp.huidig = await api(`/${state.clientId}/rapporten/${encodeURIComponent(maand)}`);
      inhoud.innerHTML = renderRapport(rp.huidig);
      bindRapport(inhoud);
    } catch (err) {
      inhoud.innerHTML = U().foutStand({ titel: 'Dit maandrapport laadt even niet', tekst: 'De rest van het portaal werkt gewoon. Probeer het straks opnieuw.' });
    }
  }

  const KOP = (acties) => `<div class="p-ov-kop"><div><h1>Maandrapporten</h1><p>Een maandrapport ligt vast: de cijfers veranderen niet meer. De laatste stand zie je altijd bij Google.</p></div><div class="p-ov-kop-acties">${acties || ''}</div></div>`;

  async function laad() {
    const kop = el('rapportenKop');
    const inhoud = el('rapportenInhoud');
    try {
      const data = await api(`/${state.clientId}/rapporten`);
      rp.lijst = data.rapporten || [];
    } catch (err) {
      kop.innerHTML = KOP('');
      inhoud.innerHTML = U().foutStand({ titel: 'De maandrapporten laden even niet', tekst: 'De rest van het portaal werkt gewoon. Probeer het straks opnieuw.' });
      return;
    }
    if (!rp.lijst.length) {
      kop.innerHTML = KOP('');
      inhoud.innerHTML = U().kaart({ inhoud: U().legeStand({ soort: 'wacht', titel: 'Het eerste maandrapport volgt', tekst: 'Het verschijnt op de 4e van de volgende maand, met een terugblik, de cijfers die vastliggen en een vooruitblik.' }) });
      return;
    }
    const gekozen = rp.lijst.some((x) => x.maand === rp.gevraagd) ? rp.gevraagd : rp.lijst[0].maand;
    rp.gevraagd = null;
    kop.innerHTML = KOP(`<label class="rp-kies">Maand <select id="rapportKeuze">${rp.lijst.map((x) => `<option value="${rpEsc(x.maand)}"${x.maand === gekozen ? ' selected' : ''}>${rpEsc(x.label)}</option>`).join('')}</select></label>`);
    el('rapportKeuze').addEventListener('change', (e) => toon(e.target.value));
    toon(gekozen);
  }

  window.loadRapportages = function (maand) {
    if (maand) rp.gevraagd = maand;
    return laad();
  };
})();
