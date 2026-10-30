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
const PV_KANSEN_ZICHTBAAR = 4;

const pvState = { zwSort: 'vertoningen', zwAlle: false, insTab: '', periode: '28d', laden: false, sort: 'vertoningen', cluster: '', status: '', q: '', taal: '', toon: PV_STAP, open: {}, insOpen: {}, kaartOpen: {}, data: null };

function pvDelta(nu, vorig) {
  if (vorig === null || vorig === undefined) return '';
  const d = nu - vorig;
  if (d === 0) return '<span class="pv-delta pv-flat">gelijk aan de periode ervoor</span>';
  const cls = d > 0 ? 'pv-up' : 'pv-down';
  const teken = d > 0 ? 'meer' : 'minder';
  return `<span class="pv-delta ${cls}">${pvNl(Math.abs(d))} ${teken} dan de periode ervoor</span>`;
}

// Taalfilter: cijfers per taal komen uit b.talen. Zonder vertalingen (b.talen leeg) geldt de blog zelf als hoofdtaal.
function pvTaalCijfers(b) {
  if (!pvState.taal) return null;
  const e = (b.talen || []).find((x) => x.code === pvState.taal);
  if (e) return e;
  if (pvState.taal === 'hoofd' && !(b.talen && b.talen.length)) return { vertoningen: b.vertoningen, clicks: b.clicks, paginaweergaven: b.paginaweergaven };
  return null;
}

function pvTotalenVoorTaal(t) {
  if (!pvState.taal) return t;
  const rijen = pvState.data.blogs.map(pvTaalCijfers).filter(Boolean);
  const heeftGa = rijen.some((r) => r.paginaweergaven !== null && r.paginaweergaven !== undefined);
  return {
    vertoningen: rijen.reduce((s, r) => s + (r.vertoningen || 0), 0),
    clicks: rijen.reduce((s, r) => s + (r.clicks || 0), 0),
    paginaweergaven: heeftGa ? rijen.reduce((s, r) => s + (r.paginaweergaven || 0), 0) : null,
    verbergHk: true,
    conversies: null
  };
}

function pvTiles(t) {
  const F = window.PortaalFormat;
  const U = window.PortaalUI;
  const vorigTekst = (v) => (v === null || v === undefined ? '' : F.getal(v) + ' in de periode ervoor');
  const hkVerschil = t.hkPositieVerbetering === null || t.hkPositieVerbetering === undefined
    ? null
    : Math.abs(t.hkPositieVerbetering) < 0.5
      ? { tekst: 'Vrijwel gelijk', toon: 'gelijk' }
      : { tekst: F.decimaal(Math.abs(t.hkPositieVerbetering), 1) + (t.hkPositieVerbetering > 0 ? ' plaatsen omhoog' : ' plaatsen omlaag'), toon: t.hkPositieVerbetering > 0 ? 'goed' : 'slecht' };
  const lijst = [
    { label: 'Keer getoond in Google', icoon: 'oog', waarde: F.getal(t.vertoningen), verschil: F.verschil(t.vertoningen, t.vertoningenVorig), vergelijking: vorigTekst(t.vertoningenVorig) || 'Hoe vaak een blog in de zoekresultaten stond' },
    { label: 'Bezoekers vanuit Google', icoon: 'mensen', waarde: F.getal(t.clicks), verschil: F.verschil(t.clicks, t.clicksVorig), vergelijking: vorigTekst(t.clicksVorig) || 'Hoe vaak iemand doorklikte naar een blog' },
    { label: 'Positie hoofdzoekwoorden', icoon: 'grafiek', waarde: t.hkPositieLabel || 'Nog geen meting', verschil: hkVerschil, vergelijking: 'Pagina 1 zijn de eerste tien resultaten' }
  ];
  if (t.verbergHk) lijst.pop();
  if (t.paginaweergaven !== null && t.paginaweergaven !== undefined) {
    lijst.push({ label: 'Paginaweergaven', icoon: 'blad', waarde: F.getal(t.paginaweergaven), vergelijking: 'Hoe vaak de blogpagina\u2019s zijn bekeken' });
  }
  if (t.conversies) {
    const c = t.conversies;
    const w = c.woorden || { lead: ['aanvraag', 'aanvragen'], boeking: ['boeking', 'boekingen'], boekLabel: 'boeken' };
    const delen = [];
    if (c.leads) delen.push(`${F.getal(c.leads)} ${c.leads === 1 ? w.lead[0] : w.lead[1]}`);
    if (c.boekingen) delen.push(`${F.getal(c.boekingen)} ${c.boekingen === 1 ? w.boeking[0] : w.boeking[1]}${c.omzet ? ` (${Number(c.omzet).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })})` : ''}`);
    const doelen = [];
    if (c.heeftLeads || c.heeftDoorklik) doelen.push('contact');
    if (c.heeftBoekingen || c.heeftDoorklik) doelen.push(w.boekLabel);
    const kort = doelen.length ? doelen : ['contact'];
    const nogGeen = [c.heeftLeads || !c.heeftBoekingen ? w.lead[0] : null, c.heeftBoekingen ? w.boeking[0] : null].filter(Boolean).join(' of ');
    lijst.push({
      label: `Van blog naar ${kort.join(' of ')}`, icoon: 'pijl',
      waarde: F.getal(c.heeftDoorklik ? c.doorkliks : (c.leads || 0) + (c.boekingen || 0)),
      vergelijking: delen.length ? `${delen.join(', ')} in bezoeken die op een blog begonnen` : `Nog geen ${nogGeen} vanuit een blog begonnen bezoek`
    });
  }
  // Meting 30-10-2026: AI assistenten, eerder gelezen, waarde en zoekopdrachten op de naam.
  const euro = (n) => Number(n).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  if (t.ai) {
    const a = t.ai;
    const w = a.woorden || { lead: ['aanvraag', 'aanvragen'], boeking: ['boeking', 'boekingen'] };
    const conv = [];
    if (a.leads) conv.push(`${F.getal(a.leads)} ${a.leads === 1 ? w.lead[0] : w.lead[1]}`);
    if (a.boekingen) conv.push(`${F.getal(a.boekingen)} ${a.boekingen === 1 ? w.boeking[0] : w.boeking[1]}`);
    const bron = a.bronnen && a.bronnen.length ? `Vooral via ${a.bronnen.slice(0, 2).map((b) => b.bron).join(' en ')}` : '';
    lijst.push({
      label: 'Bezoekers via AI assistenten', icoon: 'ai', toon: 'ai', waarde: F.getal(a.sessies),
      vergelijking: `Op de hele site, waarvan ${F.getal(a.sessiesBlogs || 0)} op een blog${conv.length ? '. ' + conv.join(' en ') + ' in die bezoeken' : ''}`,
      extra: bron
    });
  }
  if (t.eerderGelezen) {
    const e = t.eerderGelezen;
    const w = e.woorden || { lead: ['aanvraag', 'aanvragen'], boeking: ['boeking', 'boekingen'] };
    const aantal = (e.leads || 0) + (e.boekingen || 0);
    const totaal = (e.leadsTotaal || 0) + (e.boekingenTotaal || 0);
    const beide = e.leads !== null && e.boekingen !== null;
    const woord = beide ? [`${w.lead[0]} of ${w.boeking[0]}`, `${w.lead[1]} en ${w.boeking[1]}`] : (e.boekingen !== null && e.leads === null ? w.boeking : w.lead);
    lijst.push({
      label: `${woord[1].charAt(0).toUpperCase() + woord[1].slice(1)} na het lezen van een blog`, icoon: 'blad', waarde: F.getal(aantal),
      vergelijking: totaal ? `Van de ${F.getal(totaal)} ${totaal === 1 ? woord[0] : woord[1]} op de site in deze periode` : `Nog geen ${woord[0]} na het lezen van een blog`,
      extra: 'Ook als iemand later terugkwam en toen pas contact zocht'
    });
  }
  if (t.waarde) {
    const v = t.waarde;
    lijst.push({
      label: 'Waarde van de klikken uit Google', icoon: 'euro', waarde: euro(v.bedrag),
      vergelijking: 'Wat dezelfde klikken via Google Ads ongeveer hadden gekost',
      extra: v.dekking !== null && v.dekking < 100 ? `Berekend over ${F.getal(v.klikkenMetPrijs)} van de ${F.getal(v.klikken)} klikken, waarvan de klikprijs bekend is` : ''
    });
  }
  if (t.merk) {
    const m = t.merk;
    lijst.push({
      label: 'Zoekopdrachten op jullie naam', icoon: 'zoek', waarde: F.getal(m.vertoningen),
      verschil: F.verschil(m.vertoningen, m.vertoningenVorig),
      vergelijking: `${F.getal(m.klikken)} ${m.klikken === 1 ? 'klik' : 'klikken'}${m.vertoningenVorig !== null && m.vertoningenVorig !== undefined ? `. ${F.getal(m.vertoningenVorig)} keer in de periode ervoor` : ''}`,
      extra: 'Meer zoekopdrachten op de naam betekent dat meer mensen jullie kennen'
    });
  }
  return lijst.map((x) => U.kerncijfer(x)).join('');
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

const PV_PRIO = { hoog: 'Hoge prioriteit', middel: 'Middel prioriteit', laag: 'Lage prioriteit' };

// Twee lange kaarten staan standaard ingeklapt, zodat de rest van de pagina in beeld blijft.
function pvKaartKop(sleutel, titel, aantal) {
  const open = Boolean(pvState.kaartOpen[sleutel]);
  return `<button type="button" class="pv-kaart-knop" data-pv-kaart="${sleutel}" aria-expanded="${open}"><span class="p-kaart-titel">${pvEsc(titel)}</span>${aantal ? `<span class="pv-kaart-aantal">${aantal}</span>` : ''}<span class="pv-pijl">${open ? '−' : '+'}</span></button>`;
}

const PV_EFFECT_ZICHTBAAR = 4;

function pvEffecten(e) {
  if (!e || !e.items || !e.items.length) return '';
  const open = Boolean(pvState.insOpen.effecten);
  const zichtbaar = open ? e.items : e.items.slice(0, PV_EFFECT_ZICHTBAAR);
  const meer = e.items.length - PV_EFFECT_ZICHTBAAR;
  const intro = e.gemeten
    ? `${e.gemeten} ${e.gemeten === 1 ? 'actie is' : 'acties zijn'} gemeten${e.nogTeMeten ? `, ${e.nogTeMeten} ${e.nogTeMeten === 1 ? 'volgt' : 'volgen'} nog` : ''}.`
    : 'De eerste metingen volgen ongeveer een maand na publicatie.';
  return `
    <section class="p-kaart pv-effecten"><h2 class="pv-kaart-h2">${pvKaartKop('effecten', 'Wat hebben we gedaan en wat was het effect', e.items.length)}</h2>${pvState.kaartOpen.effecten ? '<div class="p-kaart-inhoud">' : '<div class="p-kaart-inhoud" hidden>'}
      <p class="pv-muted">${pvEsc(intro)} We meten 28, 56 en 90 dagen na de actie. Het zijn gemeten cijfers uit Google. Ze laten niet zien wat de oorzaak was.</p>
      ${zichtbaar.map((i) => `
        <div class="pv-effect-item">
          <div class="pv-effect-kop"><span class="pv-effect-soort">${pvEsc(i.soortLabel)}</span>${i.datum ? `<span class="pv-muted"> ${pvEsc(pvDatum(String(i.datum).slice(0, 10)))}</span>` : ''}</div>
          <div class="pv-ins-titel">${pvEsc(i.titel)}</div>
          ${i.regels.map((r) => `<div class="pv-ins-tekst">${pvEsc(r)}</div>`).join('')}
        </div>`).join('')}
      ${meer > 0 ? `<button type="button" class="pv-toggle" data-pv-ins="effecten">${open ? 'Toon minder' : `Toon alle ${e.items.length}`}</button>` : ''}
    </div></section>`;
}

function pvTekenEffecten() {
  const el = document.getElementById('pvEffecten');
  if (el && pvState.data) el.innerHTML = pvEffecten(pvState.data.effecten);
}

function pvPeriodeKeuze(d) {
  const opties = d.periodeOpties || [];
  if (!opties.length) return '';
  return `<div class="pv-periode" role="group" aria-label="Periode">
    ${opties.map((o) => `<button type="button" class="pv-chip${d.periodeType === o.code ? ' pv-chip-aan' : ''}" data-pv-periode="${pvEsc(o.code)}"${pvState.laden ? ' disabled' : ''}>${pvEsc(o.label)}</button>`).join('')}
  </div>`;
}

async function pvLaadPeriode(code) {
  if (pvState.laden || code === pvState.periode) return;
  const vorige = pvState.periode;
  pvState.periode = code;
  pvState.laden = true;
  const el = document.getElementById('performanceV2');
  if (el) el.classList.add('pv-laden');
  try {
    const v2Param = new URLSearchParams(location.search).get('prestaties') === 'nieuw' ? '&v2=1' : '';
    const d = await api(`/${state.clientId}/performance-v2?periode=${encodeURIComponent(code)}${v2Param}`);
    pvState.laden = false;
    renderPrestatiesV2(d);
  } catch (err) {
    // Periode niet beschikbaar (sync heeft nog niet gedraaid): terug naar de vorige keuze.
    pvState.laden = false;
    pvState.periode = vorige;
    if (el) el.classList.remove('pv-laden');
    const melding = document.getElementById('pvPeriodeMelding');
    if (melding) melding.textContent = 'Voor deze periode is nog geen data. Die komt na de volgende dagelijkse update.';
  }
}

function pvBlogRegel(b0, idx) {
  const tc = pvTaalCijfers(b0);
  const b = tc ? Object.assign({}, b0, { vertoningen: tc.vertoningen || 0, clicks: tc.clicks || 0, paginaweergaven: tc.paginaweergaven === undefined ? null : tc.paginaweergaven, talen: [] }) : b0;
  const toonNl = true;
  if (tc && pvState.taal !== 'hoofd') b.zoekwoorden = tc.zoekwoorden || [];
  const open = Boolean(pvState.open[idx]);
  const dagen = b.leeftijdDagen === null ? '' : b.leeftijdDagen === 0 ? 'vandaag live' : `${b.leeftijdDagen} ${b.leeftijdDagen === 1 ? 'dag' : 'dagen'} live`;
  const g = b.gedrag;
  const gedragRegels = [];
  if (g) {
    if (g.sessiesGoogle !== null && g.sessiesGoogle !== undefined) {
      gedragRegels.push(`${pvNl(g.sessiesGoogle)} ${g.sessiesGoogle === 1 ? 'bezoek' : 'bezoeken'} vanuit Google${g.sessiesGoogle > 0 && g.betrokkenSeconden ? `, gemiddeld ${pvNl(Math.round(g.betrokkenSeconden))} seconden actief per bezoek` : ''}`);
    }
    const doorkliks = (g.doorkliksContact || 0) + (g.doorkliksBoeken || 0);
    if (doorkliks) gedragRegels.push(`${pvNl(doorkliks)} ${doorkliks === 1 ? 'doorklik' : 'doorkliks'} naar contact of boeken`);
    if (g.leads) gedragRegels.push(`${pvNl(g.leads)} ${g.leads === 1 ? 'aanvraag' : 'aanvragen'} in bezoeken die hier begonnen`);
    if (g.boekingen) gedragRegels.push(`${pvNl(g.boekingen)} ${g.boekingen === 1 ? 'boeking' : 'boekingen'} in bezoeken die hier begonnen`);
    if (g.sessiesAi) gedragRegels.push(`${pvNl(g.sessiesAi)} ${g.sessiesAi === 1 ? 'bezoek' : 'bezoeken'} via een AI assistent`);
    const eerder = (g.ondersteundLeads || 0) + (g.ondersteundBoekingen || 0);
    if (eerder) gedragRegels.push(`${pvNl(eerder)} ${eerder === 1 ? 'aanvraag of boeking' : 'aanvragen of boekingen'} van mensen die deze blog eerder lazen`);
  }
  if (b.cpc !== null && b.cpc !== undefined && b.clicks > 0) {
    gedragRegels.push(`De klikken uit Google zijn ongeveer ${Math.round(b.clicks * b.cpc).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })} waard aan advertentiekosten`);
  }
  const kw = b.zoekwoorden.length
    ? `<table class="pv-kw"><thead><tr><th>Zoekwoord</th><th>Getoond</th><th>Clicks</th><th>Positie</th></tr></thead><tbody>${b.zoekwoorden.map((z) => `
        <tr><td>${pvEsc(z.q)}</td><td>${pvNl(z.i)}</td><td>${pvNl(z.c)}</td><td>${pvEsc(z.label || '')}</td></tr>`).join('')}</tbody></table>`
    : '<div class="pv-muted">Nog geen zoekwoorden gemeten.</div>';
  const talen = !pvState.taal && b.talen && b.talen.length
    ? `<div class="pv-kw-wrap"><div class="pv-muted">Per taal (de cijfers hierboven tellen alle talen mee)</div><table class="pv-kw"><thead><tr><th>Taal</th><th>Getoond</th><th>Clicks</th><th>Paginaweergaven</th></tr></thead><tbody>${b.talen.map((t) => `
        <tr><td>${pvEsc(t.taal)}</td><td>${pvNl(t.vertoningen)}</td><td>${pvNl(t.clicks)}</td><td>${t.paginaweergaven === null ? '' : pvNl(t.paginaweergaven)}</td></tr>`).join('')}</tbody></table></div>`
    : '';
  const pijl = b.hkPositie !== null && b.hkPositieVorig !== null
    ? (b.hkPositieVorig - b.hkPositie >= 0.5 ? ' <span class="pv-up">omhoog</span>' : b.hkPositie - b.hkPositieVorig >= 0.5 ? ' <span class="pv-down">omlaag</span>' : '')
    : '';
  const detail = open ? `
    <div class="pv-detail">
      ${b.hoofdwoord && toonNl ? `<div class="pv-hw"><span class="pv-muted">Hoofdzoekwoord:</span> ${pvEsc(b.hoofdwoord)}. ${pvEsc(b.hoofdwoordTekst || '')}${pijl}</div>` : ''}
      ${b.indexatie && b.indexatie.tekst ? `<div class="pv-hw"><span class="pv-muted">In Google:</span> ${pvEsc(b.indexatie.tekst)}</div>` : ''}
      ${gedragRegels.length ? `<div class="pv-hw"><span class="pv-muted">Op de website:</span> ${gedragRegels.map(pvEsc).join('. ')}.</div>` : ''}
      ${b.paginaweergaven !== null && b.paginaweergaven !== undefined ? `<div class="pv-hw"><span class="pv-muted">Paginaweergaven:</span> ${pvNl(b.paginaweergaven)}</div>` : ''}
      ${talen}
      ${toonNl ? `<div class="pv-kw-wrap">${kw}</div>` : '<div class="pv-muted">Zoekwoorden meten we alleen in de hoofdtaal.</div>'}
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
  if (pvState.taal) lijst = lijst.filter((x) => pvTaalCijfers(x.b));
  if (pvState.status) lijst = lijst.filter((x) => x.b.status.code === pvState.status);
  if (pvState.cluster) lijst = lijst.filter((x) => x.b.cluster === pvState.cluster);
  const q = pvState.q.trim().toLowerCase();
  if (q) lijst = lijst.filter((x) => (x.b.titel + ' ' + x.b.hoofdwoord + ' ' + x.b.cluster).toLowerCase().indexOf(q) !== -1);
  if (pvState.taal && pvState.sort === 'vertoningen') lijst.sort((a, c) => ((pvTaalCijfers(c.b) || {}).vertoningen || 0) - ((pvTaalCijfers(a.b) || {}).vertoningen || 0));
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
  pvState.periode = d.periodeType || pvState.periode;
  pvState.toon = PV_STAP;
  el.classList.remove('pv-laden');
  const t = d.totalen;
  const F = window.PortaalFormat;
  const U = window.PortaalUI;
  const getoond = t.blogsGetoond || 0;
  const gemeten = t.blogsGemeten || 0;
  const paginaEen = d.blogs.filter((b) => b.hkPositie !== null && b.hkPositie !== undefined && b.hkPositie <= 10).length;
  const regel = t.vertoningen > 0 ? `Jullie blogs stonden ${F.getal(t.vertoningen)} keer in Google` : 'Google heeft jullie blogs nog niet getoond';
  const uitleg = t.vertoningen > 0 ? d.samenvatting.slice(1).join(' ') : 'Een nieuwe blog heeft meestal een paar weken nodig voordat Google hem oppakt. Zodra het zover is, zie je het hier.';
  const status = `<section class="p-kaart p-ov-status" data-toon="goed"><div class="p-ov-status-hoofd"><div class="p-ov-status-regel"><span class="p-ov-puls"></span>${pvEsc(regel)}</div><p>${pvEsc(uitleg)}</p></div>
    <div class="p-ov-status-volgend">
      <div class="p-ov-volgend"><span class="p-ov-lbl">Blogs in Google</span><span class="p-ov-val">${getoond} van ${gemeten}</span><span class="p-ov-txt">worden al getoond</span></div>
      <div class="p-ov-volgend"><span class="p-ov-lbl">Op pagina 1</span><span class="p-ov-val">${paginaEen} ${paginaEen === 1 ? 'blog' : 'blogs'}</span><span class="p-ov-txt">voor het hoofdzoekwoord</span></div>
      <div class="p-ov-volgend"><span class="p-ov-lbl">Cijfers tot en met</span><span class="p-ov-val">${pvEsc(F.datumKort(d.periode && d.periode.eind))}</span><span class="p-ov-txt">Google loopt 2 tot 3 dagen achter</span></div>
    </div></section>`;
  el.innerHTML = `<div class="p-pagina">
    <div class="p-ov-kop"><div><h1>Google</h1><p>Hoe jullie blogs het doen in de zoekresultaten van Google. Dit is altijd de laatste stand. Wat vastligt per maand staat bij Maandrapporten.</p></div>
      <div class="p-ov-kop-acties">${d.laatstBijgewerkt ? `<span class="p-ov-chip"><i class="p-ov-punt"></i>Bijgewerkt ${pvEsc(F.datumKort(d.laatstBijgewerkt))}</span>` : ''}</div></div>
    <div class="pv-periode-wrap">${pvPeriodeKeuze(d)}<div class="pv-muted" id="pvPeriodeMelding"></div></div>
    ${d.toelichting ? `<section class="p-kaart pv-toelichting"><div class="p-kaart-inhoud"><b>Toelichting van Advertisr</b><p>${pvEsc(d.toelichting)}</p></div></section>` : ''}
    ${status}
    <div id="pvTaalRij"></div>
    <section class="p-kerncijfers" id="pvTiles">${pvTiles(t)}</section>
    <div class="p-ov-raster2">
      <div class="p-ov-stapel">
        ${d.weken.length ? `<section class="p-kaart" id="pvWekenKaart"><div class="p-kaart-kop"><div class="p-kaart-titel-blok"><h2 class="p-kaart-titel">De laatste weken</h2><div class="p-kaart-uitleg">Een stip onder een week betekent dat er die week een nieuwe blog live ging. De lichte staaf is de week die nog loopt.</div></div></div>
          <div class="p-kaart-inhoud"><div class="pv-charts">${pvBars(d.weken, 'vertoningen', 'pv-bar-a', 'Keer getoond per week')}${pvBars(d.weken, 'clicks', 'pv-bar-b', 'Bezoekers vanuit Google per week')}</div></div></section>` : ''}
        <section class="p-kaart" id="pvZwKaart"></section>
        <section class="p-kaart"><div class="p-kaart-kop"><div class="p-kaart-titel-blok"><h2 class="p-kaart-titel">Per blog</h2></div></div><div class="p-kaart-inhoud"><div id="pvBlogControls"></div><div id="pvBlogList"></div></div></section>
      </div>
      <div class="p-ov-stapel">
        <div id="pvInzichten"></div>
        <div id="pvEffecten"></div>
        <details class="p-kaart pv-uitleg"><summary>Hoe lees ik dit?</summary><div class="p-kaart-inhoud">
          <p><b>Getoond</b> betekent dat een blog in de zoekresultaten van Google stond. Dat gebeurt vaak eerder dan dat iemand doorklikt.</p>
          <p><b>Positie</b> laten we in pagina\u2019s zien. Pagina 1 zijn de eerste tien resultaten, en daar komen de meeste bezoekers vandaan. Een lagere positie is beter.</p>
          <p>Een nieuwe blog heeft meestal een paar weken nodig voordat Google hem oppakt. Cijfers uit Google lopen bovendien 2 tot 3 dagen achter.</p>
          <p>Blogs zijn vaak het begin van een ori\u00ebntatie. Iemand die eerst een blog leest en later via een andere weg terugkomt om te boeken, zien we niet terug. De cijfers over aanvragen en boekingen laten dus zien wat een blog aantoonbaar bijdraagt, niet alles wat een blog oplevert.</p></div></details>
      </div>
    </div>
  </div>`;
  pvTekenInzichten();
  pvTekenZoekwoorden();
  pvTekenEffecten();
  document.getElementById('pvBlogControls').innerHTML = pvControlsHtml();
  document.getElementById('pvBlogList').innerHTML = pvLijstHtml();
  pvTekenTaalRij();
  el.classList.remove('hidden');

  const herteken = () => {
    document.getElementById('pvBlogControls').innerHTML = pvControlsHtml();
    document.getElementById('pvBlogList').innerHTML = pvLijstHtml();
  };
  el.onclick = (e) => {
    const per = e.target.closest('[data-pv-periode]');
    if (per) { pvLaadPeriode(per.getAttribute('data-pv-periode')); return; }
    const taalKnop = e.target.closest('[data-pv-taal]');
    if (taalKnop) {
      pvState.taal = taalKnop.getAttribute('data-pv-taal');
      pvState.toon = PV_STAP;
      pvState.open = {};
      pvTekenTaalRij();
      herteken();
      return;
    }
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
    const zwSort = e.target.closest('[data-pv-zwsort]');
    if (zwSort) { pvState.zwSort = zwSort.getAttribute('data-pv-zwsort'); pvTekenZoekwoorden(); return; }
    if (e.target.closest('[data-zw-meer]')) { pvState.zwAlle = !pvState.zwAlle; pvTekenZoekwoorden(); return; }
    const kaartKnop = e.target.closest('[data-pv-kaart]');
    if (kaartKnop) {
      const k = kaartKnop.getAttribute('data-pv-kaart');
      pvState.kaartOpen[k] = !pvState.kaartOpen[k];
      pvTekenInzichten();
      pvTekenEffecten();
      return;
    }
    const insTab = e.target.closest('[data-pv-instab]');
    if (insTab) { pvState.insTab = insTab.getAttribute('data-pv-instab'); pvTekenInzichten(); return; }
    const ins = e.target.closest('[data-pv-ins]');
    if (ins) {
      const k = ins.getAttribute('data-pv-ins');
      pvState.insOpen[k] = !pvState.insOpen[k];
      pvTekenInzichten();
      pvTekenEffecten();
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

function pvTekenTaalRij() {
  const d = pvState.data;
  const talen = (d.totalen && d.totalen.talen) || [];
  if (talen.length < 2) pvState.taal = '';
  const rij = document.getElementById('pvTaalRij');
  if (rij) {
    rij.innerHTML = talen.length < 2 ? '' : `<div class="pv-periode" role="group" aria-label="Taal">
      <button type="button" class="pv-chip${pvState.taal === '' ? ' pv-chip-aan' : ''}" data-pv-taal="">Alle talen</button>
      ${talen.map((x) => `<button type="button" class="pv-chip${pvState.taal === x.code ? ' pv-chip-aan' : ''}" data-pv-taal="${pvEsc(x.code)}">${pvEsc(x.label)}</button>`).join('')}
    </div>${pvState.taal ? '<div class="pv-muted">Je ziet alleen de cijfers van deze taal. Vergelijking met de periode ervoor en de weekgrafiek zijn er alleen voor alle talen samen.</div>' : ''}`;
  }
  const tegels = document.getElementById('pvTiles');
  if (tegels) tegels.innerHTML = pvTiles(pvTotalenVoorTaal(d.totalen));
  pvTekenZoekwoorden();
  const weken = document.getElementById('pvWekenKaart');
  if (weken) weken.style.display = pvState.taal ? 'none' : '';
}

const PV_ZIN_KANSEN = 'Advertisr beoordeelt of een blog kan worden aangevuld. Bestaande blogs worden niet automatisch aangepast.';

function pvKansenPerBlog(lijst) {
  const open = Boolean(pvState.insOpen.kansen);
  const groepen = [];
  lijst.forEach((k) => {
    const naam = k.blogTitel || (k.soort === 'nieuw_onderwerp' ? 'Nieuwe onderwerpen' : 'Overige kansen');
    let g = groepen.find((x) => x.naam === naam);
    if (!g) { g = { naam, items: [] }; groepen.push(g); }
    g.items.push(k);
  });
  const zichtbaar = open ? groepen : groepen.slice(0, PV_KANSEN_ZICHTBAAR);
  const html = zichtbaar.map((g) => `
    <div class="pv-groep">
      <div class="pv-groep-naam">${pvEsc(g.naam)}</div>
      ${g.items.map((k) => k.signaal ? `
        <div class="pv-kans">
          <div class="pv-kans-tags"><span class="pv-tag">${pvEsc(k.soortLabel)}</span><span class="pv-tag pv-tag-${pvEsc(k.prioriteit)}">${pvEsc(PV_PRIO[k.prioriteit] || '')}</span></div>
          <div class="pv-ins-titel">${pvEsc(k.signaal)}</div>
          ${k.waarom ? `<div class="pv-ins-tekst">${pvEsc(k.waarom)}</div>` : ''}
          ${k.actie ? `<div class="pv-ins-actie">Wat wij doen: ${pvEsc(k.actie)}</div>` : ''}
          ${k.onderbouwing ? `<details class="pv-onderbouwing"><summary>Onderbouwing</summary><div class="pv-ins-tekst">${pvEsc(k.onderbouwing)}</div></details>` : ''}
        </div>` : `
        <div class="pv-kans">
          <div class="pv-ins-titel">${pvEsc(k.titel)}</div>
          <div class="pv-ins-tekst">${pvEsc(k.tekst)}</div>
        </div>`).join('')}
    </div>`).join('');
  const meer = groepen.length - PV_KANSEN_ZICHTBAAR;
  return html + (meer > 0 ? `<button type="button" class="pv-toggle" data-pv-ins="kansen">${open ? 'Toon minder' : `Toon alle ${groepen.length} blogs`}</button>` : '') + `<div class="pv-muted pv-kans-noot">${pvEsc(PV_ZIN_KANSEN)}</div>`;
}

// Zoekwoorden volgen de gekozen taal. Zonder taalkeuze tellen alle talen mee.
// Elke taalpagina heeft in b.talen zijn eigen zoekwoorden (veld zoekwoorden), de hoofdtaal staat in b.zoekwoorden.
function pvZoekwoordenBlogs() {
  const blogs = pvState.data.blogs || [];
  return blogs.map((b) => {
    const talen = b.talen || [];
    const metTaal = (code) => { const e = talen.find((x) => x.code === code); return e && e.zoekwoorden ? e.zoekwoorden : []; };
    if (!pvState.taal) {
      return { zoekwoorden: (b.zoekwoorden || []).concat(...talen.filter((x) => x.code !== 'hoofd').map((x) => x.zoekwoorden || [])) };
    }
    if (pvState.taal === 'hoofd') return { zoekwoorden: b.zoekwoorden || [] };
    return { zoekwoorden: metTaal(pvState.taal) };
  });
}

function pvTekenZoekwoorden() {
  const box = document.getElementById('pvZwKaart');
  if (!box || !pvState.data || !window.Zoekwoorden) return;
  const lijst = window.Zoekwoorden.samenvoegen(pvZoekwoordenBlogs(), pvState.zwSort);
  if (!lijst.length && !pvState.taal) { box.style.display = 'none'; return; }
  box.style.display = '';
  if (!lijst.length) {
    box.innerHTML = '<div class="p-kaart-kop"><div class="p-kaart-titel-blok"><h2 class="p-kaart-titel">Zoekwoorden</h2><div class="p-kaart-uitleg">Voor deze taal zijn nog geen zoekwoorden gemeten. Die komen na de volgende dagelijkse update.</div></div></div>';
    return;
  }
  const keuzes = [['vertoningen', 'Meest getoond'], ['bezoekers', 'Meeste bezoekers']];
  box.innerHTML = `<div class="p-kaart-kop"><div class="p-kaart-titel-blok"><h2 class="p-kaart-titel">Zoekwoorden</h2><div class="p-kaart-uitleg">Waar mensen op zochten toen ze jullie blogs in Google zagen. Een lage positie is beter, pagina 1 is positie 1 tot en met 10.</div></div>
    <div class="pv-periode" role="group" aria-label="Sorteer zoekwoorden">${keuzes.map((k) => `<button type="button" class="pv-chip${pvState.zwSort === k[0] ? ' pv-chip-aan' : ''}" data-pv-zwsort="${k[0]}">${k[1]}</button>`).join('')}</div></div>
    <div class="p-kaart-inhoud">${window.Zoekwoorden.html(lijst, { aantal: 8, alle: pvState.zwAlle })}</div>`;
}

function pvTekenInzichten() {
  const box = document.getElementById('pvInzichten');
  if (!box) return;
  const i = pvState.data.inzichten;
  if (!(i.goed.length || i.kansen.length || i.aandacht.length)) { box.innerHTML = ''; return; }
  const tabs = [['goed', 'Goed nieuws', i.goed], ['kansen', 'Kansen', i.kansen], ['aandacht', 'Aandacht', i.aandacht]].filter((t) => t[2].length);
  if (!tabs.some((t) => t[0] === pvState.insTab)) pvState.insTab = tabs[0][0];
  const actief = tabs.find((t) => t[0] === pvState.insTab);
  let inhoud;
  if (actief[0] === 'kansen') {
    const noot = i.kansen.some((k) => k.signaal) && pvState.data.kansenPeriode && pvState.data.kansenPeriode.start
      ? `<div class="pv-muted pv-kans-noot">Kansen horen bij de laatste 28 dagen (${pvEsc(pvDatum(pvState.data.kansenPeriode.start))} tot en met ${pvEsc(pvDatum(pvState.data.kansenPeriode.eind))}), ook als je een andere periode kiest.</div>` : '';
    inhoud = noot + pvKansenPerBlog(i.kansen);
  } else {
    const lijst = actief[2];
    const open = Boolean(pvState.insOpen[actief[0]]);
    const zichtbaar = open ? lijst : lijst.slice(0, PV_INZICHT_ZICHTBAAR);
    const meer = lijst.length - PV_INZICHT_ZICHTBAAR;
    inhoud = zichtbaar.map((x) => `<div class="pv-kans"><div class="pv-ins-titel">${pvEsc(x.titel)}</div><div class="pv-ins-tekst">${pvEsc(x.tekst)}</div>${actief[0] === 'aandacht' && x.actie ? `<div class="pv-ins-actie">Wat wij doen: ${pvEsc(x.actie)}</div>` : ''}</div>`).join('') +
      (meer > 0 ? `<button type="button" class="pv-toggle" data-pv-ins="${actief[0]}">${open ? 'Toon minder' : `Toon alle ${lijst.length}`}</button>` : '');
  }
  box.innerHTML = `<section class="p-kaart"><h2 class="pv-kaart-h2">${pvKaartKop('inzichten', 'Wat we zien en wat we doen', tabs.reduce((n, t) => n + t[2].length, 0))}</h2>
    <div class="p-kaart-inhoud"${pvState.kaartOpen.inzichten ? '' : ' hidden'}><div class="pv-tabs" role="tablist">${tabs.map((t) => `<button type="button" role="tab" aria-selected="${t[0] === pvState.insTab}" class="pv-tab${t[0] === pvState.insTab ? ' actief' : ''}" data-pv-instab="${t[0]}">${t[1]}<span>${t[2].length}</span></button>`).join('')}</div>
    <div class="pv-tabinhoud">${inhoud}</div></div></section>`;
}
