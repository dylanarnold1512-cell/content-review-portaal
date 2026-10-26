// Pagina's als agenda (Pagr. in het klantportaal, 26-10-2026). Alleen de dagen waarop er iets gebeurt staan erin,
// per maand, met een lijn voor vandaag. Hier staat het model en de HTML, los van het scherm zodat het testbaar is.
// Alles wat uit data komt gaat door esc().
(function () {
  const F = (typeof window !== 'undefined' && window.PortaalFormat) || require('./portaal-format');

  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const veilig = (url) => (/^https?:\/\//i.test(url || '') ? url : '');
  const kortUrl = (url) => String(url || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  const WEEKDAG = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  const BEZIG = ['In de maak', 'Ter controle', 'Klaar voor live'];
  const TOON = { 'Live': 'goed', 'Gepland': 'plan', 'In de maak': 'let-op', 'Ter controle': 'let-op', 'Klaar voor live': 'let-op', 'Maandplan': 'neutraal' };

  const isoDag = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : '');
  function weekdag(iso) {
    const [j, m, d] = iso.split('-').map(Number);
    return WEEKDAG[new Date(Date.UTC(j, m - 1, d)).getUTCDay()];
  }
  function volgendeMaand(maand) {
    const [j, m] = String(maand).split('-').map(Number);
    return m === 12 ? `${j + 1}-01` : `${j}-${String(m + 1).padStart(2, '0')}`;
  }
  const hoofdletter = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);

  // Op welke dag staat een pagina in de agenda? Live: de livedatum. Gepland: de schrijfdatum. Bezig: vandaag.
  function agendaDatum(p) {
    if (p.stand === 'Live') return isoDag(p.liveDatum) || isoDag(p.bijgewerkt);
    if (p.stand === 'Gepland') return isoDag(p.schrijfOp);
    return '';
  }

  function googleTekst(p, meting) {
    if (p.stand !== 'Live') return '';
    if (!meting || !meting.google || !p.google) return 'nog niet gemeten';
    const g = p.google;
    if (!g.vertoningen) return 'nog geen vertoningen';
    return `${F.getal(g.vertoningen)} keer getoond`;
  }
  function bezoekersTekst(p, meting) {
    if (p.stand !== 'Live') return '';
    if (!meting || !meting.google || !p.google) return 'nog niet gemeten';
    return p.google.klikken ? F.getal(p.google.klikken) : 'nog geen';
  }
  function positieTekst(p, meting) {
    if (p.stand !== 'Live') return '';
    if (!meting || !meting.google || !p.google) return 'nog niet gemeten';
    return p.google.positie != null && p.google.vertoningen ? F.decimaal(p.google.positie, 1) : 'nog geen';
  }
  function aiTekst(p, meting) {
    if (p.stand !== 'Live') return '';
    if (!meting || !meting.ai || !p.ai) return 'nog niet gemeten';
    return p.ai.geciteerd > 0 ? `genoemd als bron (${p.ai.geciteerd}x)` : 'nog niet genoemd';
  }

  // Wat er bij een pagina in de agenda staat.
  function watTekst(p) {
    if (p.stand === 'Live') return `Live gezet op ${F.datumKort(agendaDatum(p))}`;
    if (p.stand === 'Gepland') return p.schrijfOp ? `Wordt geschreven rond ${F.datumKort(p.schrijfOp)}` : (p.vanKlant ? 'Jullie idee, wij beoordelen het' : 'Nog geen datum');
    if (p.stand === 'Ter controle') return 'Wij controleren de pagina';
    if (p.stand === 'Klaar voor live') return 'Klaar, gaat binnenkort live';
    return 'Wij werken eraan';
  }

  // Voor welke maand komt het volgende maandplan? De maand na de laatste maand met geplande pagina's, en nooit eerder dan
  // volgende maand. Het plan wordt op de 1e van die maand gemaakt.
  function volgendPlan(paginas, vandaag) {
    let maand = volgendeMaand(vandaag.slice(0, 7));
    (paginas || []).forEach((p) => {
      const d = p && p.stand === 'Gepland' ? isoDag(p.schrijfOp) : '';
      if (d && volgendeMaand(d.slice(0, 7)) > maand) maand = volgendeMaand(d.slice(0, 7));
    });
    return maand;
  }

  // Het model van de agenda. paginas: lijst uit /api/:klant/paginas. vandaag: 'YYYY-MM-DD'.
  // opties: { filter: 'alles' | 'komt' | 'live', perMaand }.
  function agendaModel(paginas, vandaag, opties) {
    const o = opties || {};
    const filter = ['alles', 'komt', 'live'].includes(o.filter) ? o.filter : 'alles';
    const lijst = (paginas || []).filter((p) => p && p.titel);
    const past = (p) => filter === 'alles' || (filter === 'live' ? p.stand === 'Live' : p.stand !== 'Live');
    const zichtbaar = lijst.filter(past);
    const huidig = vandaag.slice(0, 7);

    const metDatum = zichtbaar.filter((p) => !BEZIG.includes(p.stand) && agendaDatum(p)).map((p) => ({ soort: 'pagina', datum: agendaDatum(p), p }));
    const bezig = zichtbaar.filter((p) => BEZIG.includes(p.stand));
    const zonderDatum = zichtbaar.filter((p) => !BEZIG.includes(p.stand) && !agendaDatum(p));
    if (filter !== 'live' && Number(o.perMaand) > 0) {
      const planMaand = volgendPlan(lijst, vandaag);
      metDatum.push({ soort: 'plan', datum: planMaand + '-01', maand: planMaand, aantal: Number(o.perMaand) });
    }

    const perMaand = {};
    metDatum.forEach((x) => { const k = x.datum.slice(0, 7); (perMaand[k] = perMaand[k] || []).push(x); });
    const toonVandaag = filter !== 'live';
    if (toonVandaag && !perMaand[huidig]) perMaand[huidig] = [];

    const maanden = Object.keys(perMaand).sort().map((k) => {
      const regels = [];
      const dagen = {};
      perMaand[k].forEach((x) => { (dagen[x.datum] = dagen[x.datum] || []).push(x); });
      let vandaagGezet = false;
      const zetVandaag = () => { regels.push({ soort: 'vandaag', datum: vandaag, items: bezig }); vandaagGezet = true; };
      Object.keys(dagen).sort().forEach((iso) => {
        if (toonVandaag && k === huidig && !vandaagGezet && iso > vandaag) zetVandaag();
        // Twee pagina's op dezelfde dag in volgorde van titel, het maandplan als laatste.
        const items = dagen[iso].sort((a, b) => (a.soort === 'plan') - (b.soort === 'plan') || String(a.p && a.p.titel).localeCompare(String(b.p && b.p.titel)));
        regels.push({ soort: 'dag', datum: iso, dag: Number(iso.slice(8, 10)), weekdag: weekdag(iso), verleden: iso < vandaag, items });
      });
      if (toonVandaag && k === huidig && !vandaagGezet) zetVandaag();
      const pags = perMaand[k].filter((x) => x.soort === 'pagina').map((x) => x.p).concat(k === huidig ? bezig : []);
      const delen = [];
      const nLive = pags.filter((p) => p.stand === 'Live').length;
      const nBezig = pags.filter((p) => BEZIG.includes(p.stand)).length;
      const nGepland = pags.filter((p) => p.stand === 'Gepland').length;
      if (nLive) delen.push(`${nLive} live`);
      if (nBezig) delen.push(`${nBezig} in de maak`);
      if (nGepland) delen.push(`${nGepland} gepland`);
      if (!delen.length && perMaand[k].some((x) => x.soort === 'plan')) delen.push('plan volgt');
      return { maand: k, label: F.maand(k), samenvatting: delen.join(' · '), regels };
    });

    const telling = {
      alles: lijst.length,
      komt: lijst.filter((p) => p.stand !== 'Live').length,
      live: lijst.filter((p) => p.stand === 'Live').length
    };
    return { filter, maanden, zonderDatum, telling, leeg: !zichtbaar.length };
  }

  // De eerstvolgende pagina: wat nu in de maak is, anders de vroegste geplande met een datum vanaf vandaag.
  function volgendePagina(paginas, vandaag) {
    const lijst = paginas || [];
    const bezig = lijst.find((p) => BEZIG.includes(p.stand));
    if (bezig) return { p: bezig, tekst: 'Nu in de maak' };
    const gepland = lijst.filter((p) => p.stand === 'Gepland' && isoDag(p.schrijfOp) && isoDag(p.schrijfOp) >= vandaag)
      .sort((a, b) => (a.schrijfOp < b.schrijfOp ? -1 : 1))[0];
    return gepland ? { p: gepland, tekst: F.datumKort(gepland.schrijfOp) } : null;
  }

  // ---------- HTML ----------

  function pil(stand) {
    return `<span class="p-pil p-pil-${TOON[stand] || 'neutraal'}">${esc(stand)}</span>`;
  }

  function itemHtml(x, meting) {
    if (x.soort === 'plan') {
      return `<div class="pa-item pa-item-plan"><div class="pa-item-kop">${pil('Maandplan')}<span class="pa-wat">Op basis van wat er in Google gezocht wordt</span></div>
        <div class="pa-item-titel">Maandplan ${esc(F.maand(x.maand))}: we kiezen ${esc(x.aantal)} nieuwe ${x.aantal === 1 ? 'pagina' : "pagina's"}</div></div>`;
    }
    const p = x.p || x;
    const live = p.stand === 'Live';
    const cijfers = live ? `<div class="pa-cijfers"><span><b>Google</b> ${esc(googleTekst(p, meting))}</span><span><b>Bezoekers</b> ${esc(bezoekersTekst(p, meting))}</span><span><b>AI</b> ${esc(aiTekst(p, meting))}</span>${veilig(p.url) ? `<span class="pa-url">${esc(kortUrl(p.url))}</span>` : ''}</div>` : '';
    const reden = !live && p.reden ? `<div class="pa-reden">${esc(p.reden)}</div>` : '';
    return `<button type="button" class="pa-item" data-pa-open="${esc(p.id)}"><div class="pa-item-kop">${pil(p.stand)}<span class="pa-wat">${esc(watTekst(p))}</span></div>
      <div class="pa-item-titel">${esc(p.titel)}</div>${reden}${cijfers}</button>`;
  }

  function agendaHtml(model, meting, vandaag) {
    const filters = [['alles', 'Alles'], ['komt', 'Komt eraan'], ['live', 'Live']].map(([id, label]) =>
      `<button type="button" class="pa-filter${model.filter === id ? ' pa-filter-aan' : ''}" data-pa-filter="${id}" aria-pressed="${model.filter === id}">${label} <span>${model.telling[id]}</span></button>`).join('');
    const maanden = model.maanden.map((m) => `<div class="pa-maand">
        <div class="pa-maand-kop"><span class="pa-maand-naam">${esc(m.label.toUpperCase())}</span><span class="pa-maand-lijn"></span><span class="pa-maand-sam">${esc(m.samenvatting)}</span></div>
        ${m.regels.map((r) => {
          if (r.soort === 'vandaag') {
            return `<div class="pa-vandaag"><span class="pa-vandaag-stip"></span><span class="pa-vandaag-tekst">VANDAAG, ${esc(F.datumKort(vandaag).toUpperCase())}</span><span class="pa-vandaag-lijn"></span></div>` +
              (r.items.length ? `<div class="pa-dag pa-dag-nu"><div class="pa-datum"><div class="pa-datum-nr">Nu</div></div><div class="pa-spoor"><span class="pa-bol pa-bol-let-op"></span></div><div class="pa-items">${r.items.map((p) => itemHtml({ soort: 'pagina', p }, meting)).join('')}</div></div>` : '');
          }
          const eerste = r.items[0];
          const toon = eerste.soort === 'plan' ? 'maandplan' : (TOON[eerste.p.stand] || 'neutraal');
          return `<div class="pa-dag${r.verleden ? ' pa-dag-verleden' : ''}"><div class="pa-datum"><div class="pa-datum-nr">${r.dag}</div><div class="pa-datum-wd">${esc(r.weekdag)}</div></div>
            <div class="pa-spoor"><span class="pa-bol pa-bol-${toon}"></span></div><div class="pa-items">${r.items.map((x) => itemHtml(x, meting)).join('')}</div></div>`;
        }).join('')}
      </div>`).join('');
    const zonder = model.zonderDatum.length ? `<div class="pa-maand"><div class="pa-maand-kop"><span class="pa-maand-naam">NOG ZONDER DATUM</span><span class="pa-maand-lijn"></span></div>
      <div class="pa-zonder">${model.zonderDatum.map((p) => itemHtml({ soort: 'pagina', p }, meting)).join('')}</div></div>` : '';
    const leeg = model.leeg ? `<div class="pa-leeg">${model.filter === 'live' ? 'Er staat nog geen pagina live.' : "Er staan nog geen pagina's in de agenda. Zodra het plan is vastgesteld zie je ze hier."}</div>` : '';
    return `<section class="p-kaart pa-agenda" aria-labelledby="paAgendaTitel">
      <div class="pa-agenda-kop"><h2 id="paAgendaTitel">Agenda</h2><div class="pa-filters" role="group" aria-label="Toon">${filters}</div></div>
      ${maanden}${zonder}${leeg}</section>`;
  }

  function kerncijfersHtml(k, volgende) {
    const vol = volgende
      ? `<button type="button" class="p-kerncijfer pa-volgende" data-pa-open="${esc(volgende.p.id)}"><div class="p-kerncijfer-kop">Volgende pagina</div><div class="p-kerncijfer-waarde">${esc(volgende.tekst)}</div><div class="p-kerncijfer-sub pa-volgende-titel">${esc(volgende.p.titel)}</div></button>`
      : '<div class="p-kerncijfer"><div class="p-kerncijfer-kop">Volgende pagina</div><div class="p-kerncijfer-waarde">Volgt</div><div class="p-kerncijfer-sub">met het maandplan</div></div>';
    return `<section class="p-kerncijfers pa-kerncijfers">
      <div class="p-kerncijfer"><div class="p-kerncijfer-kop"><span class="pa-stip pa-stip-goed"></span>Live</div><div class="p-kerncijfer-waarde">${esc(k.live)}</div><div class="p-kerncijfer-sub">${esc(k.dezeMaandLive)} deze maand erbij</div></div>
      <div class="p-kerncijfer"><div class="p-kerncijfer-kop"><span class="pa-stip pa-stip-let-op"></span>In de maak</div><div class="p-kerncijfer-waarde">${esc(k.inDeMaak)}</div><div class="p-kerncijfer-sub">wij werken eraan</div></div>
      <div class="p-kerncijfer"><div class="p-kerncijfer-kop"><span class="pa-stip pa-stip-plan"></span>Gepland</div><div class="p-kerncijfer-waarde">${esc(k.gepland)}</div><div class="p-kerncijfer-sub">volgens het plan</div></div>
      ${vol}
    </section>`;
  }

  function planHtml(perMaand, vandaag, paginas) {
    const aantal = Number(perMaand) > 0 ? Number(perMaand) : null;
    const volgend = F.datumLang(volgendPlan(paginas, vandaag) + '-01').replace(/ \d{4}$/, '');
    return `<section class="p-kaart pa-plan" aria-labelledby="paPlanTitel"><h2 id="paPlanTitel">Het plan</h2>
      ${aantal ? `<div class="pa-plan-aantal"><b>${aantal}</b><span>nieuwe ${aantal === 1 ? 'pagina' : "pagina's"} per maand</span></div>` : ''}
      <ol class="pa-stappen">
        <li><span>1</span>Op de 1e van de maand kiezen wij welke pagina's we maken, op basis van wat er in Google gezocht wordt.</li>
        <li><span>2</span>We schrijven de pagina rond de datum in de agenda en controleren hem.</li>
        <li><span>3</span>Daarna gaat hij live. Jullie hoeven niets goed te keuren.</li>
      </ol>
      ${aantal ? `<div class="pa-plan-volgend"><b>Volgend maandplan:</b> ${esc(volgend)}</div>` : ''}
    </section>
    <section class="p-kaart pa-plan"><h2>Een idee voor een pagina?</h2>
      <p>Een dienst of plaats waar jullie meer klanten willen? Geef het door, dan nemen we het mee in het volgende maandplan.</p>
      <button type="button" class="p-knop" data-pa-idee>Idee aandragen</button></section>`;
  }

  function scoreHtml(paginas, meting) {
    const live = (paginas || []).filter((p) => p.stand === 'Live')
      .sort((a, b) => ((b.google && b.google.vertoningen) || 0) - ((a.google && a.google.vertoningen) || 0));
    if (!live.length) return '';
    const rijen = live.map((p) => `<tr><td><button type="button" class="pa-link" data-pa-open="${esc(p.id)}">${esc(p.titel)}</button>${veilig(p.url) ? `<div class="pa-sub">${esc(kortUrl(p.url))}</div>` : ''}</td>
      <td class="pa-nowrap">${esc(F.datumKort(agendaDatum(p)))}</td><td class="pa-num">${esc(googleTekst(p, meting))}</td><td class="pa-num">${esc(bezoekersTekst(p, meting))}</td><td class="pa-num">${esc(positieTekst(p, meting))}</td><td>${esc(aiTekst(p, meting))}</td></tr>`).join('');
    return `<section class="p-kaart pa-score" aria-labelledby="paScoreTitel"><div class="pa-score-kop"><h2 id="paScoreTitel">Hoe de live pagina's scoren</h2>
      <p>Cijfers van de laatste 28 dagen. Google laat een nieuwe pagina meestal pas na een paar weken zien.</p></div>
      <div class="pg-tabel-wrap"><table class="pg-tabel pa-tabel"><thead><tr><th>Pagina</th><th>Live sinds</th><th class="pa-num">Getoond</th><th class="pa-num">Bezoekers</th><th class="pa-num">Positie</th><th>AI</th></tr></thead><tbody>${rijen}</tbody></table></div></section>`;
  }

  // De stappen van een pagina in het paneel. stand: klaar, bezig of komt.
  function stappen(p, meting) {
    const datum = agendaDatum(p);
    if (p.stand === 'Live') {
      const cijfers = meting && meting.google && p.google && p.google.vertoningen > 0;
      return [
        { naam: 'Gepland in het maandplan', stand: 'klaar' },
        { naam: 'Geschreven en gecontroleerd', stand: 'klaar' },
        { naam: 'Live gezet', datum: datum ? F.datumLang(datum) : '', stand: 'klaar' },
        { naam: 'Eerste cijfers uit Google', datum: cijfers ? 'Binnen' : 'Meestal na een paar weken', stand: cijfers ? 'klaar' : 'komt' }
      ];
    }
    if (p.stand === 'Gepland') {
      return [
        { naam: p.vanKlant ? 'Jullie idee is binnen' : 'Gepland in het maandplan', stand: 'klaar' },
        { naam: 'Schrijven', datum: p.schrijfOp ? 'Rond ' + F.datumLang(p.schrijfOp) : '', stand: 'komt' },
        { naam: 'Controle en live zetten', datum: p.schrijfOp ? 'Kort daarna' : '', stand: 'komt' }
      ];
    }
    const controle = p.stand === 'Ter controle' || p.stand === 'Klaar voor live';
    return [
      { naam: 'Gepland in het maandplan', stand: 'klaar' },
      { naam: 'Schrijven', stand: controle ? 'klaar' : 'bezig' },
      { naam: 'Controle en live zetten', stand: controle ? 'bezig' : 'komt' }
    ];
  }

  function paneelHtml(p, meting) {
    const live = p.stand === 'Live';
    const st = stappen(p, meting).map((s, i, a) => `<li class="pa-stap pa-stap-${s.stand}"><span class="pa-stap-bol"></span>${i < a.length - 1 ? '<span class="pa-stap-lijn"></span>' : ''}<div><b>${esc(s.naam)}</b>${s.datum ? `<span>${esc(s.datum)}</span>` : ''}${s.stand === 'bezig' ? '<span>Nu bezig</span>' : ''}</div></li>`).join('');
    const reden = p.reden ? `<div class="pa-paneel-blok"><h3>Waarom deze pagina</h3><p>${esc(p.reden)}</p></div>` : '';
    const cijfers = live ? `<div class="pa-paneel-blok"><h3>Resultaten, laatste 28 dagen</h3>
        <div class="pa-paneel-cijfers"><div><span>Getoond in Google</span><b>${esc(googleTekst(p, meting))}</b></div><div><span>Bezoekers</span><b>${esc(bezoekersTekst(p, meting))}</b></div><div><span>Positie</span><b>${esc(positieTekst(p, meting))}</b></div><div><span>AI</span><b>${esc(aiTekst(p, meting))}</b></div></div>
        ${!(p.google && p.google.vertoningen) ? '<p class="pa-zacht">Google laat een nieuwe pagina meestal pas na een paar weken zien. De eerste cijfers verschijnen hier vanzelf.</p>' : ''}</div>` : '';
    const adres = live && veilig(p.url) ? `<div class="pa-paneel-blok"><h3>Adres</h3><a href="${esc(veilig(p.url))}" target="_blank" rel="noopener" class="pa-adres">${esc(p.url)}</a></div>
      <a class="p-knop pa-bekijk" href="${esc(veilig(p.url))}" target="_blank" rel="noopener">Bekijk de pagina</a>` : '';
    const uitleg = p.stand === 'Gepland'
      ? `<div class="pa-paneel-uitleg">${p.schrijfOp ? `Deze pagina schrijven we rond ${esc(F.datumLang(p.schrijfOp))}. Na een controle zetten we hem live.` : (p.vanKlant ? 'Dit is jullie idee. Wij beoordelen het en nemen het mee in een volgend maandplan.' : 'Deze pagina krijgt een datum in het maandplan.')} Jullie hoeven niets te doen.</div>`
      : (live ? '' : '<div class="pa-paneel-uitleg">Wij werken aan deze pagina. Na een controle zetten we hem live. Jullie hoeven niets te doen.</div>');
    return `<div class="pa-paneel-kop"><div>${pil(p.stand)}<h2 id="paPaneelTitel">${esc(p.titel)}</h2></div>
        <button type="button" class="rp-icoonknop" data-pa-sluit aria-label="Sluiten"><svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="pa-paneel-body"><div class="pa-paneel-blok"><h3>Planning</h3><ol class="pa-tijdlijn">${st}</ol></div>${reden}${uitleg}${cijfers}${adres}</div>`;
  }

  const api = { agendaModel, volgendPlan, agendaDatum, volgendePagina, watTekst, googleTekst, bezoekersTekst, positieTekst, aiTekst, stappen,
    agendaHtml, kerncijfersHtml, planHtml, scoreHtml, paneelHtml, hoofdletter, volgendeMaand };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PaginasAgenda = api;
})();
