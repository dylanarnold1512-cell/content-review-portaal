// Pagr. overzicht (Werkplaats fase 2, 23-10-2026, afgemaakt volgens het design): alle klanten met Pagr. op een scherm. Een inbox
// met wat op Dylan wacht, twee bulkknoppen, een rij per klant en wat het systeem deed. Gebruikt /api/lp/pagr-overzicht.
// De per klant werkplaats blijft apart.

function ovEsc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function ovMv(n, een, meer) { return `${n} ${n === 1 ? een : meer}`; }
const OV_KLEUREN = ['#3a5fd9', '#17885a', '#6a35ff', '#9a5a00', '#c2410c', '#0e7490', '#a21caf', '#4d7c0f'];
function ovAvatar(naam, klasse) {
  let h = 0;
  for (const c of String(naam || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const delen = String(naam || '').trim().split(/\s+/).filter(Boolean);
  const init = ((delen[0] || '?')[0] + (delen.length > 1 ? delen[delen.length - 1][0] : (delen[0] || '')[1] || '')).toUpperCase();
  return `<span class="ov-av${klasse ? ' ' + klasse : ''}" style="background:${OV_KLEUREN[h % OV_KLEUREN.length]}" aria-hidden="true">${ovEsc(init)}</span>`;
}
function ovHoofdletter(t) { return String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1); }

// Een rij per punt dat op Dylan wacht, belangrijkste eerst: mislukt, live zetten, controleren, plan, ideeen.
function ovInboxItems(klanten) {
  const items = [];
  const pagr = (klanten || []).filter((k) => k.soort === 'pagr');
  const voeg = (type, soort, klasse, tekstFn, veld) => pagr.forEach((k) => { if (k[veld]) items.push({ type, klant: k.id, naam: k.naam, soort, klasse, tekst: tekstFn(k[veld]) }); });
  voeg('fout', 'Mislukt', 'fout', (n) => ovMv(n, 'pagina is mislukt of afgewezen', "pagina's zijn mislukt of afgewezen"), 'fout');
  voeg('klaar', 'Live zetten', 'plan', (n) => ovMv(n, 'pagina is schoon door de controle', "pagina's zijn schoon door de controle") + '. Vlak voor live volgt nog een controle.', 'klaar');
  voeg('controleren', 'Controleren', '', (n) => ovMv(n, 'pagina wacht op jouw controle', "pagina's wachten op jouw controle"), 'controleren');
  voeg('plan', 'Plan', 'plan', (n) => ovMv(n, 'voorstel staat klaar', 'voorstellen staan klaar') + '. Na akkoord schrijft het systeem ze vanzelf.', 'voorstellen');
  voeg('idee', 'Idee van de klant', 'idee', (n) => ovMv(n, 'idee van de klant', 'ideeen van de klant'), 'ideeen');
  return items;
}

function ovAutoLiveTekst(a) {
  if (!a || !a.aan) return { tekst: 'Uit', klasse: 'wp-controle', sub: a ? `${a.live} van ${a.nodig} live pagina's nodig` : '' };
  if (a.actief) return { tekst: 'Aan', klasse: 'wp-live', sub: `werkt sinds ${a.nodig} live` };
  return { tekst: `Aan vanaf ${a.nodig} live`, klasse: 'wp-gepland', sub: `nu ${a.live} live` };
}

function ovKerncijfers(t, maandNaam) {
  const delen = [];
  if (t.fout) delen.push(`${t.fout} mislukt`);
  if (t.klaar) delen.push(`${t.klaar} live zetten`);
  if (t.controleren) delen.push(`${t.controleren} controleren`);
  if (t.voorstellen) delen.push(ovMv(t.voorstellen, 'voorstel', 'voorstellen'));
  if (t.ideeen) delen.push(ovMv(t.ideeen, 'idee', 'ideeen'));
  const live = t.live == null ? t.gemaakt : t.live;
  return [
    { kop: `${ovHoofdletter(maandNaam || 'Deze maand')}, alle klanten`, waarde: t.doel ? `${live} van ${t.doel}` : String(live), sub: "pagina's live volgens afspraak" },
    { kop: 'Wacht op jou', waarde: String(t.wacht), sub: delen.join(', ') || 'niets', accent: t.wacht > 0 },
    { kop: 'Vanzelf gedaan, 7 dagen', waarde: String(t.vanzelf || 0), sub: 'plannen, teksten, controles en live' },
    { kop: 'Mislukt', waarde: String(t.fout), sub: t.fout ? 'staat bovenaan bij Wacht op jou' : 'niets mislukt', accent: t.fout > 0 }
  ];
}

// Wat het systeem deed, alle klanten, laatste 7 dagen, nieuwste eerst.
function ovLog(klanten, nu) {
  const grens = new Date((nu || new Date()).getTime() - 7 * 86400000).toISOString();
  const uit = [];
  (klanten || []).filter((k) => k.soort === 'pagr').forEach((k) => (k.activiteit || []).forEach((a) => { if (String(a.op) >= grens) uit.push({ op: a.op, klant: k.naam, wat: a.tekst }); }));
  return uit.sort((a, b) => String(b.op).localeCompare(String(a.op))).slice(0, 12);
}

function ovVolgendeCel(k, volgendeNaam) {
  if (k.volgendeMaand.ingepland) return `<span class="wp-pil wp-gepland"><span class="wp-stip"></span>${k.volgendeMaand.ingepland} ingepland${k.volgendeMaand.eerste ? `, eerste ${ovEsc(new Date(k.volgendeMaand.eerste).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }))}` : ''}</span>`;
  if (k.volgendeMaand.voorstellen) return '<span class="wp-pil wp-voorstel"><span class="wp-stip"></span>Plan klaar, akkoord nodig</span>';
  if (k.soort === 'pagr') return `<span class="wp-pil wp-gepland"><span class="wp-stip"></span>Wordt 1 ${ovEsc(String(volgendeNaam || '').slice(0, 3))} gepland</span>`;
  return '<span class="wp-muted">Nog niet gepland</span>';
}

function ovRijHtml(k, volgendeNaam, eigen) {
  const d = k.dezeMaand;
  const auto = ovAutoLiveTekst(k.autoLive);
  const plan = k.autoPlan && k.autoPlan.aan === false ? { tekst: 'met jouw akkoord', klasse: 'wp-gepland' } : { tekst: 'zelfstandig', klasse: 'wp-live' };
  const onderweg = [];
  if (k.inDeMaak || k.gepland) onderweg.push(`<span class="wp-pil wp-maak"><span class="wp-stip"></span>${k.inDeMaak + k.gepland} in de maak</span>`);
  if (k.controleren) onderweg.push(`<span class="wp-pil wp-controle"><span class="wp-stip"></span>${k.controleren} controle</span>`);
  if (k.klaar) onderweg.push(`<span class="wp-pil wp-klaar"><span class="wp-stip"></span>${k.klaar} klaar</span>`);
  if (k.fout) onderweg.push(`<span class="wp-pil ov-fout"><span class="wp-stip"></span>${k.fout} mislukt</span>`);
  const live = d.live == null ? d.gemaakt : d.live;
  const maandTekst = d.doel ? `${live} van ${d.doel} live` : `${live} live`;
  const procent = d.doel ? Math.max(0, Math.min(100, Math.round((live / d.doel) * 100))) : 0;
  const product = [k.product, d.doel ? `${d.doel} per maand` : ''].filter(Boolean).join(' · ');
  const sub = [product, k.google ? `Google: ${k.google}` : ''].filter(Boolean).join(' · ');
  const pil = (klasse, tekst) => `<span class="wp-pil ${klasse}"><span class="wp-stip"></span>${ovEsc(tekst)}</span>`;
  const cel = (pilHtml, gewoon) => (eigen ? `<span class="ov-gewoon">${gewoon}</span>` : pilHtml);
  const volgende = ovVolgendeCel(k, volgendeNaam);
  const volgendeTekst = k.volgendeMaand.ingepland ? `${k.volgendeMaand.ingepland} ingepland` : k.volgendeMaand.voorstellen ? 'Plan klaar, akkoord nodig' : 'Nog niet gepland';
  return `<div class="ov-trij${k.fout ? ' ov-trij-fout' : ''}${eigen ? ' ov-trij-eigen' : ''}" role="button" tabindex="0" data-ov-klant="${ovEsc(k.id)}" data-ov-open="${ovEsc(k.id)}">
    <div class="ov-klantcel">${ovAvatar(k.naam)}<div><strong>${ovEsc(k.naam)}</strong><small>${ovEsc(sub)}</small></div></div>
    <div class="ov-maandcel"><b>${ovEsc(maandTekst)}</b>${d.doel && !eigen ? `<div class="ov-balk" role="img" aria-label="${ovEsc(maandTekst)}"><span style="width:${procent}%"></span></div>` : ''}</div>
    <div>${cel(volgende, ovEsc(volgendeTekst))}</div>
    <div class="ov-pillen">${onderweg.join('') || '<span class="ov-gewoon">Niets in de maak</span>'}</div>
    <div>${cel(pil(auto.klasse, auto.tekst), ovEsc(auto.tekst))}</div>
    <div>${cel(pil(plan.klasse, plan.tekst), ovEsc(plan.tekst))}</div>
    <svg class="ov-pijl" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
  </div>`;
}

function ovOpenWerkplaats(klant) {
  const sel = document.getElementById('wpKlant');
  if (sel) sel.value = klant;
  switchLpTab('werkplaats');
}

// Een stap per klant, zodat bulk en een knop in een rij precies hetzelfde doen.
async function ovKeurKlant(klantId) {
  const v = await lpApi('/plan/voorgesteld?klant=' + encodeURIComponent(klantId));
  const ids = (v.voorstellen || []).map((x) => x.id);
  if (!ids.length) return 0;
  const r = await lpApi('/plan/voorgesteld/keur', { method: 'POST', body: JSON.stringify({ klant: klantId, goedkeuren: ids, afwijzen: [] }) });
  return r.goedgekeurd || 0;
}
async function ovLiveKlant(klantId) {
  return lpApi(`/clients/${encodeURIComponent(klantId)}/zet-schone-live`, { method: 'POST', body: JSON.stringify({ bevestigd: true }) });
}
function ovLiveTekst(r) {
  const over = (r.overgeslagen || []).length; const fouten = (r.fouten || []).length;
  return `${(r.gelukt || []).length} live gezet.${over ? ` ${over} overgeslagen na een laatste controle.` : ''}${fouten ? ` ${fouten} mislukt.` : ''}`;
}

async function ovBulkPlannen(klanten) {
  let goed = 0;
  for (const k of klanten.filter((x) => x.soort === 'pagr' && x.voorstellen)) goed += await ovKeurKlant(k.id);
  return `${ovMv(goed, 'plan goedgekeurd', 'plannen goedgekeurd')}. De tekst wordt nu geschreven.`;
}

async function ovBulkLive(klanten) {
  const tot = { gelukt: [], overgeslagen: [], fouten: [] };
  for (const k of klanten.filter((x) => x.soort === 'pagr' && x.klaar)) {
    const r = await ovLiveKlant(k.id);
    ['gelukt', 'overgeslagen', 'fouten'].forEach((v) => tot[v].push(...(r[v] || [])));
  }
  return ovLiveTekst(tot);
}

let ovMelding = '';
async function ovLaad(ververs) {
  const fout = document.getElementById('ovFout');
  if (!fout) return;
  fout.classList.add('hidden');
  try {
    const d = await lpApi('/pagr-overzicht' + (ververs ? '?ververs=1' : ''));
    ovTeken(d);
  } catch (err) {
    fout.textContent = err.message;
    fout.classList.remove('hidden');
  }
}

function ovTeken(d) {
  const klanten = d.klanten || [];
  const t = d.totalen || {};
  const maandNaam = typeof wpMaandNaam === 'function' ? wpMaandNaam(d.maand) : '';
  const volgendeNaam = typeof wpMaandNaam === 'function' ? wpMaandNaam(wpVolgendeMaand(d.maand)) : '';
  document.getElementById('ovKerncijfers').innerHTML = ovKerncijfers(t, maandNaam).map((c) => `<div class="ov-cijfer"><div class="ov-cijfer-l">${ovEsc(c.kop)}</div><div class="ov-getal${c.accent ? ' ov-accent' : ''}">${ovEsc(c.waarde)}</div><div class="ov-cijfer-s">${ovEsc(c.sub)}</div></div>`).join('');

  const verversNa = async (actie) => { try { ovMelding = await actie(); } catch (err) { ovMelding = err.message; } await ovLaad(true); };
  const items = ovInboxItems(klanten);
  items.forEach((it) => {
    const open = { label: it.type === 'fout' || it.type === 'controleren' ? 'Bekijk' : 'Open werkplaats', actie: () => ovOpenWerkplaats(it.klant) };
    if (it.type === 'plan') it.knoppen = [{ label: 'Bekijk plan', actie: () => ovOpenWerkplaats(it.klant) }, { label: 'Keur goed', hoofd: true, actie: (b) => { if (!confirm(`Het plan van ${it.naam} goedkeuren? Daarna wordt de tekst geschreven.`)) return; b.disabled = true; verversNa(async () => `${ovMv(await ovKeurKlant(it.klant), 'plan goedgekeurd', 'plannen goedgekeurd')} voor ${it.naam}.`); } }];
    else if (it.type === 'klaar') it.knoppen = [open, { label: 'Zet live', hoofd: true, actie: (b) => { if (!confirm(`De schone pagina's van ${it.naam} live zetten? Elke pagina wordt vlak voor het live gaat nog eens gecontroleerd.`)) return; b.disabled = true; verversNa(async () => ovLiveTekst(await ovLiveKlant(it.klant))); } }];
    else it.knoppen = [{ ...open, hoofd: it.type === 'fout' }];
  });
  const banner = document.getElementById('ovBanner');
  banner.className = 'ov-banner' + (items.length ? ' ov-banner-actie' : '');
  banner.innerHTML = items.length
    ? `<span class="ov-banner-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/></svg></span><div><div class="ov-banner-kop">${t.wacht} ${t.wacht === 1 ? 'ding wacht' : 'dingen wachten'} op jou</div><div class="ov-banner-sub">Hieronder staat het in ${ovMv(items.length, 'regel', 'regels')}, belangrijkste bovenaan.</div></div>`
    : `<span class="ov-banner-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><div><div class="ov-banner-kop">Niets wacht op jou</div><div class="ov-banner-sub">Er is niets mislukt en er hoeft niets goedgekeurd te worden. Zodra er iets is, staat het hier bovenaan.</div></div>`;
  document.getElementById('ovWachtKaart').classList.toggle('hidden', !items.length);
  const wacht = document.getElementById('ovWacht');
  wacht.innerHTML = (items.length ? items.map((it, i) => `<div class="ov-rij">${ovAvatar(it.naam)}<div class="ov-rij-tekst"><div class="ov-rij-kop"><b>${ovEsc(it.naam)}</b><span class="ov-soort ${it.klasse}">${ovEsc(it.soort)}</span></div><span>${ovEsc(it.tekst)}</span></div><div class="wp-idee-knoppen">${it.knoppen.map((k, j) => `<button type="button" class="btn ${k.hoofd ? 'btn-approve' : 'btn-plain'}" data-ov-w="${i}" data-ov-k="${j}">${ovEsc(k.label)}</button>`).join('')}</div></div>`).join('') : '<p class="ov-leeg">Niets wacht op jou. Het systeem draait door.</p>') + (ovMelding ? `<p class="ov-melding">${ovEsc(ovMelding)}</p>` : '');
  wacht.querySelectorAll('[data-ov-w]').forEach((b) => b.addEventListener('click', () => items[Number(b.dataset.ovW)].knoppen[Number(b.dataset.ovK)].actie(b)));

  const bulk = document.getElementById('ovBulk');
  bulk.innerHTML = `${t.klaar ? `<button type="button" class="btn btn-approve" id="ovLiveAlles">Alle schone pagina's live (${t.klaar})</button>` : ''}${t.voorstellen ? `<button type="button" class="btn btn-plain" id="ovKeurAlles">Keur alle plannen goed (${t.voorstellen})</button>` : ''}`;
  const loop = (knop, bevestig, actie) => { if (!confirm(bevestig)) return; knop.disabled = true; verversNa(() => actie(klanten)); };
  const keur = document.getElementById('ovKeurAlles');
  if (keur) keur.addEventListener('click', () => loop(keur, `Alle ${t.voorstellen} voorstellen van alle klanten goedkeuren? Daarna wordt de tekst geschreven.`, ovBulkPlannen));
  const live = document.getElementById('ovLiveAlles');
  if (live) live.addEventListener('click', () => loop(live, `Alle ${t.klaar} schone pagina's live zetten? Elke pagina wordt vlak voor het live gaat nog eens gecontroleerd.`, ovBulkLive));

  const pagr = klanten.filter((k) => k.soort === 'pagr');
  const eigen = klanten.filter((k) => k.soort === 'eigen');
  document.getElementById('ovKlanten').innerHTML = pagr.map((k) => ovRijHtml(k, volgendeNaam)).join('') || '<p class="ov-leeg">Nog geen klanten met Pagr.</p>';
  document.getElementById('ovEigenKop').classList.toggle('hidden', !eigen.length);
  document.getElementById('ovEigen').innerHTML = eigen.map((k) => ovRijHtml(k, volgendeNaam, true)).join('');
  document.querySelectorAll('[data-ov-open]').forEach((b) => {
    b.addEventListener('click', () => ovOpenWerkplaats(b.dataset.ovOpen));
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ovOpenWerkplaats(b.dataset.ovOpen); } });
  });

  const log = ovLog(klanten);
  document.getElementById('ovLog').innerHTML = log.length ? log.map((l) => `<div class="ov-logrij"><span class="ov-tijd-stip"></span><span class="ov-logtekst"><b>${ovEsc(l.klant)}</b> ${ovEsc(l.wat)}</span><span class="ov-logdatum">${new Date(l.op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span></div>`).join('') : '<p class="ov-leeg">De afgelopen 7 dagen was er geen activiteit.</p>';
}

if (typeof module !== 'undefined') module.exports = { ovInboxItems, ovAutoLiveTekst, ovKerncijfers, ovRijHtml, ovLog };
