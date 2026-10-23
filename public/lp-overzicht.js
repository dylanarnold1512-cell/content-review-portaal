// Pagr. overzicht (Werkplaats fase 2, 23-10-2026): alle klanten met Pagr. op een scherm. Een inbox met wat op Dylan wacht,
// twee bulkknoppen en een rij per klant. Gebruikt /api/lp/pagr-overzicht. De per klant werkplaats blijft ongewijzigd.

function ovEsc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function ovMv(n, een, meer) { return `${n} ${n === 1 ? een : meer}`; }

// Een rij per punt dat op Dylan wacht, belangrijkste eerst: mislukt, live zetten, controleren, plan, ideeen.
function ovInboxItems(klanten) {
  const items = [];
  const pagr = (klanten || []).filter((k) => k.soort === 'pagr');
  const voeg = (soort, klasse, tekstFn, veld) => pagr.forEach((k) => { if (k[veld]) items.push({ klant: k.id, naam: k.naam, soort, klasse, tekst: tekstFn(k[veld]) }); });
  voeg('Mislukt', 'fout', (n) => ovMv(n, 'pagina is mislukt of afgewezen', "pagina's zijn mislukt of afgewezen"), 'fout');
  voeg('Live zetten', 'plan', (n) => ovMv(n, 'pagina staat klaar voor live', "pagina's staan klaar voor live"), 'klaar');
  voeg('Controleren', '', (n) => ovMv(n, 'pagina wacht op jouw controle', "pagina's wachten op jouw controle"), 'controleren');
  voeg('Plan', 'plan', (n) => ovMv(n, 'voorstel staat klaar', 'voorstellen staan klaar'), 'voorstellen');
  voeg('Idee van de klant', 'idee', (n) => ovMv(n, 'idee van de klant', 'ideeen van de klant'), 'ideeen');
  return items;
}

function ovAutoLiveTekst(a) {
  if (!a || !a.aan) return { tekst: 'Uit', klasse: 'wp-controle' };
  if (a.actief) return { tekst: 'Aan', klasse: 'wp-live' };
  return { tekst: `Aan vanaf ${a.nodig} live (nu ${a.live})`, klasse: 'wp-gepland' };
}

function ovKerncijfers(t) {
  const delen = [];
  if (t.fout) delen.push(`${t.fout} mislukt`);
  if (t.klaar) delen.push(`${t.klaar} live zetten`);
  if (t.controleren) delen.push(`${t.controleren} controleren`);
  if (t.voorstellen) delen.push(ovMv(t.voorstellen, 'voorstel', 'voorstellen'));
  if (t.ideeen) delen.push(ovMv(t.ideeen, 'idee', 'ideeen'));
  return [
    { kop: 'Deze maand, alle klanten', waarde: t.doel ? `${t.gemaakt} van ${t.doel}` : String(t.gemaakt), sub: "pagina's gemaakt volgens afspraak" },
    { kop: 'Wacht op jou', waarde: String(t.wacht), sub: delen.join(', ') || 'niets', accent: t.wacht > 0 },
    { kop: 'Klanten met Pagr.', waarde: String(t.klanten), sub: 'betalend' },
    { kop: 'Mislukt', waarde: String(t.fout), sub: t.fout ? 'wacht op jou' : 'niets mislukt', accent: t.fout > 0 }
  ];
}

function ovRijHtml(k) {
  const d = k.dezeMaand;
  const auto = ovAutoLiveTekst(k.autoLive);
  const onderweg = [];
  if (k.inDeMaak || k.gepland) onderweg.push(`<span class="wp-pil wp-maak"><span class="wp-stip"></span>${k.inDeMaak + k.gepland} in de maak</span>`);
  if (k.controleren) onderweg.push(`<span class="wp-pil wp-controle"><span class="wp-stip"></span>${k.controleren} controle</span>`);
  if (k.klaar) onderweg.push(`<span class="wp-pil wp-klaar"><span class="wp-stip"></span>${k.klaar} klaar</span>`);
  if (k.fout) onderweg.push(`<span class="wp-pil ov-fout"><span class="wp-stip"></span>${k.fout} mislukt</span>`);
  const maandTekst = d.doel ? `${d.gemaakt} van ${d.doel}` : String(d.gemaakt);
  const voorstelDezeMaand = d.voorstellen ? `<small class="wp-muted">${ovMv(d.voorstellen, 'voorstel', 'voorstellen')} te keuren</small>` : '';
  const volgende = k.volgendeMaand.voorstellen ? `<span class="wp-pil wp-voorstel"><span class="wp-stip"></span>${ovMv(k.volgendeMaand.voorstellen, 'voorstel', 'voorstellen')}</span>` : '<span class="wp-muted">Nog niet gepland</span>';
  const laatst = k.laatst ? new Date(k.laatst).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '';
  return `<tr data-ov-klant="${ovEsc(k.id)}"><td><strong>${ovEsc(k.naam)}</strong><small class="wp-muted">${k.live} live</small></td><td><b>${maandTekst}</b>${voorstelDezeMaand}</td><td>${volgende}</td><td class="ov-pillen">${onderweg.join('') || '<span class="wp-muted">Niets onderweg</span>'}</td><td><span class="wp-pil ${auto.klasse}"><span class="wp-stip"></span>${ovEsc(auto.tekst)}</span></td><td class="wp-muted">${laatst}</td><td><button type="button" class="btn btn-plain" data-ov-open="${ovEsc(k.id)}">Open werkplaats</button></td></tr>`;
}

function ovOpenWerkplaats(klant) {
  const sel = document.getElementById('wpKlant');
  if (sel) sel.value = klant;
  switchLpTab('werkplaats');
}

async function ovBulkPlannen(klanten) {
  const lijst = klanten.filter((k) => k.soort === 'pagr' && k.voorstellen);
  let goed = 0;
  for (const k of lijst) {
    const v = await lpApi('/plan/voorgesteld?klant=' + encodeURIComponent(k.id));
    const ids = (v.voorstellen || []).map((x) => x.id);
    if (!ids.length) continue;
    const r = await lpApi('/plan/voorgesteld/keur', { method: 'POST', body: JSON.stringify({ klant: k.id, goedkeuren: ids, afwijzen: [] }) });
    goed += r.goedgekeurd || 0;
  }
  return `${ovMv(goed, 'plan goedgekeurd', 'plannen goedgekeurd')}. De tekst wordt nu geschreven.`;
}

async function ovBulkLive(klanten) {
  const lijst = klanten.filter((k) => k.soort === 'pagr' && k.klaar);
  let gelukt = 0; let over = 0; let fouten = 0;
  for (const k of lijst) {
    const r = await lpApi(`/clients/${encodeURIComponent(k.id)}/zet-schone-live`, { method: 'POST', body: JSON.stringify({ bevestigd: true }) });
    gelukt += (r.gelukt || []).length; over += (r.overgeslagen || []).length; fouten += (r.fouten || []).length;
  }
  return `${gelukt} live gezet.${over ? ` ${over} overgeslagen na een laatste controle.` : ''}${fouten ? ` ${fouten} mislukt.` : ''}`;
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
  document.getElementById('ovKerncijfers').innerHTML = ovKerncijfers(t).map((c) => `<div class="wp-kaart ov-cijfer"><div class="wp-muted">${ovEsc(c.kop)}</div><div class="ov-getal${c.accent ? ' ov-accent' : ''}">${ovEsc(c.waarde)}</div><div class="wp-muted">${ovEsc(c.sub)}</div></div>`).join('');

  const items = ovInboxItems(klanten);
  const wacht = document.getElementById('ovWacht');
  wacht.innerHTML = (items.length ? items.map((it, i) => `<div class="wp-wrij"><span class="wp-wsoort ${it.klasse}">${ovEsc(it.soort)}</span><div class="wp-wtekst"><b>${ovEsc(it.naam)}</b><span class="wp-muted">${ovEsc(it.tekst)}</span></div><div class="wp-idee-knoppen"><button type="button" class="btn btn-plain" data-ov-wacht="${i}">Open werkplaats</button></div></div>`).join('') : '<p class="wp-muted">Niets wacht op jou. Het systeem draait door.</p>') + (ovMelding ? `<p class="ov-melding">${ovEsc(ovMelding)}</p>` : '');
  wacht.querySelectorAll('[data-ov-wacht]').forEach((b) => b.addEventListener('click', () => ovOpenWerkplaats(items[Number(b.dataset.ovWacht)].klant)));

  const bulk = document.getElementById('ovBulk');
  bulk.innerHTML = `${t.voorstellen ? `<button type="button" class="btn btn-plain" id="ovKeurAlles">Keur alle plannen goed (${t.voorstellen})</button>` : ''}${t.klaar ? `<button type="button" class="btn btn-approve" id="ovLiveAlles">Alle schone pagina's live (${t.klaar})</button>` : ''}`;
  const loop = async (knop, bevestig, actie) => {
    if (!confirm(bevestig)) return;
    knop.disabled = true;
    try { ovMelding = await actie(klanten); } catch (err) { ovMelding = err.message; }
    await ovLaad(true);
  };
  const keur = document.getElementById('ovKeurAlles');
  if (keur) keur.addEventListener('click', () => loop(keur, `Alle ${t.voorstellen} voorstellen van alle klanten goedkeuren? Daarna wordt de tekst geschreven.`, ovBulkPlannen));
  const live = document.getElementById('ovLiveAlles');
  if (live) live.addEventListener('click', () => loop(live, `Alle ${t.klaar} schone pagina's live zetten? Elke pagina wordt vlak voor het live gaat nog eens gecontroleerd.`, ovBulkLive));

  const pagr = klanten.filter((k) => k.soort === 'pagr');
  const eigen = klanten.filter((k) => k.soort === 'eigen');
  document.getElementById('ovKlanten').innerHTML = pagr.map(ovRijHtml).join('') || '<tr><td colspan="7" class="wp-muted">Nog geen klanten met Pagr.</td></tr>';
  document.getElementById('ovEigenKaart').classList.toggle('hidden', !eigen.length);
  document.getElementById('ovEigen').innerHTML = eigen.map(ovRijHtml).join('');
  document.querySelectorAll('[data-ov-open]').forEach((b) => b.addEventListener('click', () => ovOpenWerkplaats(b.dataset.ovOpen)));
}

if (typeof module !== 'undefined') module.exports = { ovInboxItems, ovAutoLiveTekst, ovKerncijfers, ovRijHtml };
