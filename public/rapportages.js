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

  function vorigeMaand(maand) {
    const m = /^(\d{4})-(\d{2})$/.exec(maand || '');
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 2, 1));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  // Telt de wekelijkse AI metingen die in een kalendermaand beginnen.
  function aiMaand(ai, maand) {
    if (!ai || !Array.isArray(ai.trend)) return null;
    const weken = ai.trend.filter((w) => w && String(w.weekStart || '').slice(0, 7) === maand);
    if (!weken.length) return null;
    const per = {};
    let antwoorden = 0;
    let genoemd = 0;
    weken.forEach((w) => {
      Object.keys(w.platformen || {}).forEach((id) => {
        const x = w.platformen[id] || {};
        per[id] = per[id] || { antwoorden: 0, genoemd: 0 };
        per[id].antwoorden += x.antwoorden || 0;
        per[id].genoemd += x.genoemd || 0;
        antwoorden += x.antwoorden || 0;
        genoemd += x.genoemd || 0;
      });
    });
    if (!antwoorden) return null;
    return { weken: weken.length, antwoorden, genoemd, percentage: Math.round((genoemd / antwoorden) * 100), per };
  }

  function aiGegevens(ai, r) {
    if (!ai || ai.beschikbaar === false) return null;
    const nu = aiMaand(ai, r.maand);
    const vorig = aiMaand(ai, vorigeMaand(r.maand));
    return { ai, nu, vorig };
  }

  function aiKaart(g, label) {
    if (!g) return '';
    if (!g.nu) {
      return U().kaart({ titel: `AI zichtbaarheid in ${label}`, inhoud: U().legeStand({ soort: 'wacht', titel: 'In deze maand is nog niet gemeten', tekst: 'We stellen elke week dezelfde vragen aan ChatGPT en Gemini. De metingen verschijnen hier zodra ze er zijn.' }) });
    }
    const namen = {};
    (g.ai.platformen || []).forEach((p) => { if (p && p.id) namen[p.id] = p.label || p.id; });
    const regels = Object.keys(g.nu.per).map((id) => {
      const x = g.nu.per[id];
      const pct = x.antwoorden ? Math.round((x.genoemd / x.antwoorden) * 100) : 0;
      return `<div class="rp-ai-rij"><div class="rp-ai-naam">${rpEsc(namen[id] || id)}</div><div class="rp-ai-balk"><span style="width:${Math.min(100, pct)}%"></span></div><div class="rp-ai-pct">${pct}%</div><div class="rp-ai-sub">${x.genoemd} van ${x.antwoorden} antwoorden</div></div>`;
    }).join('');
    let vergelijking = '';
    if (g.vorig) {
      const d = g.nu.percentage - g.vorig.percentage;
      vergelijking = d === 0 ? `Even hoog als de maand ervoor (${g.vorig.percentage}%).`
        : `${Math.abs(d)} procentpunt ${d > 0 ? 'hoger' : 'lager'} dan de maand ervoor (${g.vorig.percentage}%).`;
    } else {
      vergelijking = 'Er is nog geen vorige maand om mee te vergelijken.';
    }
    const klein = g.nu.antwoorden < 100 ? ' Het gaat om een beperkt aantal antwoorden, dus kleine verschillen zeggen nog weinig.' : '';
    return U().kaart({ titel: `AI zichtbaarheid in ${label}`, uitleg: 'Hoe vaak ChatGPT en Gemini jullie merk noemen bij vragen die jullie klanten stellen.',
      inhoud: `<p class="rp-ai-zin"><strong>AI noemde jullie merk in ${g.nu.percentage}% van de antwoorden.</strong> ${rpEsc(vergelijking)}${rpEsc(klein)}</p><div class="rp-ai">${regels}</div><div class="pv-muted">${g.nu.weken} ${g.nu.weken === 1 ? 'meting' : 'metingen'} in ${rpEsc(label)}, ${g.nu.antwoorden} antwoorden in totaal.</div>` });
  }

  function renderRapport(r, g) {
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
    if (g && g.nu) lijst.push({ label: 'AI noemt jullie', icoon: 'ai', waarde: g.nu.percentage + '%', vergelijking: g.vorig ? `${g.vorig.percentage}% in de maand ervoor` : 'van de antwoorden' });
    const nieuw = r.nieuweBlogs.length
      ? `<ul class="rp-lijst">${r.nieuweBlogs.map((b) => `<li>${rpEsc(b.titel)}${b.datum ? ` <span class="pv-muted">(${rpEsc(Fm.datumLang(b.datum))})</span>` : ''}</li>`).join('')}</ul>`
      : U().legeStand({ soort: 'neutraal', titel: 'Geen nieuwe blogs', tekst: 'Er zijn deze maand geen nieuwe blogs live gegaan.' });
    const status = `<section class="p-kaart p-ov-status" data-toon="goed"><div class="p-ov-status-hoofd"><div class="p-ov-status-regel"><span class="p-ov-puls"></span>${rpEsc(regel)}</div>
      <p>${rpEsc(r.voortgang || 'Dit rapport ligt vast. De cijfers veranderen niet meer.')}</p></div>
      <div class="p-ov-status-volgend"><div class="p-ov-volgend"><span class="p-ov-lbl">Nieuwe blogs</span><span class="p-ov-val">${r.nieuweBlogs.length}</span><span class="p-ov-txt">in ${rpEsc(r.label)}</span></div>
      <div class="p-ov-volgend"><span class="p-ov-lbl">Vastgelegd op</span><span class="p-ov-val">${rpEsc(r.aangemaakt ? Fm.datumKort(r.aangemaakt) : '')}</span><span class="p-ov-txt">Staat vast</span></div></div></section>`;
    const terug = r.terugblik.length ? r.terugblik.map((a) => `<p>${rpEsc(a)}</p>`).join('') : '<p class="pv-muted">Voor deze maand is geen toelichting beschikbaar.</p>';
    const klant = (document.getElementById('clientName') || {}).textContent || '';
    const printkop = `<div class="rp-printkop"><div class="rp-printmerk">Advertisr.</div><h1>Maandrapport ${rpEsc(r.label)}</h1><p>${rpEsc(klant)}${r.aangemaakt ? ' · vastgelegd op ' + rpEsc(Fm.datumLang(r.aangemaakt)) : ''}</p></div>`;
    return `${printkop}${status}
      <section class="p-kerncijfers${lijst.length === 5 ? ' rp-vijf' : ''}">${lijst.map((x) => U().kerncijfer(x)).join('')}</section>
      <div class="p-ov-raster2">
        <div class="p-ov-stapel">
          ${U().kaart({ titel: `Terugblik op ${r.label}`, inhoud: `<div class="rp-tekst">${terug}</div>` })}
          ${aiKaart(g, r.label)}
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
    if (blogs) blogs.addEventListener('click', () => { alleBlogs = !alleBlogs; inhoud.innerHTML = renderRapport(rp.huidig, rp.ai); bindRapport(inhoud); });
    const vooruit = el('rpAlleVooruit');
    if (vooruit) vooruit.addEventListener('click', () => { alleVooruit = !alleVooruit; inhoud.innerHTML = renderRapport(rp.huidig, rp.ai); bindRapport(inhoud); });
  }

  async function toon(maand) {
    const inhoud = el('rapportenInhoud');
    alleBlogs = false;
    alleVooruit = false;
    inhoud.innerHTML = U().laden([{ breedte: '100%', hoogte: 120 }, { breedte: '100%', hoogte: 90 }, { breedte: '100%', hoogte: 200 }]);
    try {
      const [rapport, ai] = await Promise.all([
        api(`/${state.clientId}/rapporten/${encodeURIComponent(maand)}`),
        api(`/${state.clientId}/ai-zichtbaarheid`).catch(() => null)
      ]);
      rp.huidig = rapport;
      rp.ai = aiGegevens(ai, rapport);
      inhoud.innerHTML = renderRapport(rp.huidig, rp.ai);
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
    kop.innerHTML = KOP(`<label class="rp-kies"><span>Maand</span><select id="rapportKeuze" aria-label="Kies een maand">${rp.lijst.map((x) => `<option value="${rpEsc(x.maand)}"${x.maand === gekozen ? ' selected' : ''}>${rpEsc(x.label)}</option>`).join('')}</select></label><button type="button" class="p-knop" id="rpPdf">Opslaan als PDF</button>`);
    el('rpPdf').addEventListener('click', () => {
      const inh = el('rapportenInhoud');
      const was = [alleBlogs, alleVooruit];
      alleBlogs = false;
      alleVooruit = true;
      inh.innerHTML = renderRapport(rp.huidig, rp.ai);
      window.print();
      alleBlogs = was[0];
      alleVooruit = was[1];
      inh.innerHTML = renderRapport(rp.huidig, rp.ai);
      bindRapport(inh);
    });
    el('rapportKeuze').addEventListener('change', (e) => toon(e.target.value));
    toon(gekozen);
  }

  window.loadRapportages = function (maand) {
    if (maand) rp.gevraagd = maand;
    return laad();
  };
})();
