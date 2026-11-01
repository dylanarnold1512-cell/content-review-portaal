// Paid Ads > Rapportages: de drie n8n datacollectie formulieren (Advertisr, Digital Impact, House of Talents)
// starten vanuit het portaal. Gebruikt adminApi en escapeHtmlAdmin uit admin.js.
(function () {
  const e = (t) => escapeHtmlAdmin(String(t === undefined || t === null ? '' : t));
  const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const STATUS = { wacht: ['Wacht op n8n', 'p-pil-neutraal'], bezig: ['Bezig', 'p-pil-let-op'], klaar: ['Klaar', 'p-pil-goed'], fout: ['Fout', 'p-pil-fout'] };
  const staat = { config: null, org: '', klant: '', maand: 0, jaar: 0, waarden: {}, notities: '', bezig: false, melding: null, starts: [], timer: null };

  function vorigeMaand() {
    const d = new Date();
    const v = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return { maand: v.getMonth() + 1, jaar: v.getFullYear() };
  }

  function huidigeOrg() {
    return staat.config.find((o) => o.id === staat.org) || staat.config[0];
  }

  function velden(org) {
    return org.velden.filter((v) => !v.klanten || v.klanten.includes(staat.klant));
  }

  function tijd(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function formulierHtml() {
    const org = huidigeOrg();
    const lijst = velden(org);
    const groepen = [];
    lijst.forEach((v) => { let g = groepen.find((x) => x.naam === v.groep); if (!g) { g = { naam: v.groep, velden: [] }; groepen.push(g); } g.velden.push(v); });
    const jaren = [];
    const nu = new Date().getFullYear();
    for (let j = nu; j >= nu - 2; j--) jaren.push(j);
    return `
    <div class="rs-tabs" role="tablist">${staat.config.map((o) => `<button type="button" role="tab" class="rs-tab${o.id === org.id ? ' actief' : ''}" data-org="${e(o.id)}" aria-selected="${o.id === org.id}">${e(o.naam)}</button>`).join('')}</div>
    <div class="rs-kaart">
      <div class="rs-rij">
        <label class="rs-veld"><span>${e(org.klantLabel)}</span>
          <select id="rsKlant">${org.klanten.map((k) => `<option value="${e(k)}"${k === staat.klant ? ' selected' : ''}>${e(k)}</option>`).join('')}</select></label>
        <label class="rs-veld"><span>Maand</span>
          <select id="rsMaand">${MAANDEN.map((m, i) => `<option value="${i + 1}"${i + 1 === staat.maand ? ' selected' : ''}>${e(m)}</option>`).join('')}</select></label>
        <label class="rs-veld"><span>Jaar</span>
          <select id="rsJaar">${jaren.map((j) => `<option value="${j}"${j === staat.jaar ? ' selected' : ''}>${j}</option>`).join('')}</select></label>
      </div>
      <p class="rs-hint">Standaard staat de vorige maand. Alle velden hieronder zijn optioneel. Leeg betekent automatisch uit de API, net als in het n8n formulier.</p>
      ${groepen.length ? `<details class="rs-details"><summary>Handmatige invoer (${lijst.length} velden)</summary>
        ${groepen.map((g) => `<div class="rs-groep"><h4>${e(g.naam)}</h4><div class="rs-velden">${g.velden.map((v) => `<label class="rs-veld"><span>${e(v.label)}</span><input type="text" inputmode="decimal" data-label="${e(v.label)}" value="${e(staat.waarden[v.label] || '')}"></label>`).join('')}</div></div>`).join('')}
      </details>` : ''}
      <label class="rs-veld rs-notities"><span>Notities (optioneel)</span><textarea id="rsNotities" rows="2">${e(staat.notities)}</textarea></label>
      <div class="rs-acties"><button type="button" id="rsStart" class="primary"${staat.bezig ? ' disabled' : ''}>${staat.bezig ? 'Bezig met starten' : 'Start rapportage'}</button></div>
      ${staat.melding ? `<p class="${staat.melding.fout ? 'rs-fout' : 'rs-ok'}" role="status">${e(staat.melding.tekst)}</p>` : ''}
    </div>`;
  }

  function lijstHtml() {
    if (!staat.starts.length) return '<p class="rs-hint">Nog geen rapportages gestart vanuit het portaal.</p>';
    return `<table class="rs-tabel"><thead><tr><th>Klant</th><th>Maand</th><th>Gestart</th><th>Status</th></tr></thead><tbody>
      ${staat.starts.map((s) => { const st = STATUS[s.status] || STATUS.wacht; return `<tr><td>${e(s.klant)}<small>${e(s.organisatie)}</small></td><td>${e(s.maand)}</td><td>${e(tijd(s.gestart))}</td><td><span class="p-pil ${st[1]}">${e(st[0])}</span></td></tr>`; }).join('')}
    </tbody></table>`;
  }

  function tekenLijst() {
    const el = document.getElementById('rsLijst');
    if (el) el.innerHTML = lijstHtml();
  }

  function bind(root) {
    root.querySelectorAll('[data-org]').forEach((b) => b.addEventListener('click', () => {
      staat.org = b.dataset.org;
      staat.klant = huidigeOrg().klanten[0];
      staat.waarden = {};
      staat.melding = null;
      teken();
    }));
    const k = root.querySelector('#rsKlant');
    if (k) k.addEventListener('change', () => { leesVelden(root); staat.klant = k.value; staat.melding = null; teken(); });
    root.querySelector('#rsMaand').addEventListener('change', (ev) => { staat.maand = Number(ev.target.value); });
    root.querySelector('#rsJaar').addEventListener('change', (ev) => { staat.jaar = Number(ev.target.value); });
    root.querySelector('#rsStart').addEventListener('click', () => verstuur(root));
  }

  function leesVelden(root) {
    root.querySelectorAll('input[data-label]').forEach((i) => { staat.waarden[i.dataset.label] = i.value; });
    const n = root.querySelector('#rsNotities');
    if (n) staat.notities = n.value;
  }

  async function verstuur(root) {
    leesVelden(root);
    const org = huidigeOrg();
    const m = vorigeMaand();
    const afwijkend = staat.maand !== m.maand || staat.jaar !== m.jaar;
    const ingevuld = Object.values(staat.waarden).filter((w) => String(w).trim() !== '').length;
    const vraag = `Rapportage starten voor ${staat.klant}, ${MAANDEN[staat.maand - 1]} ${staat.jaar}` + (ingevuld ? ` met ${ingevuld} handmatig ingevulde velden` : '') + (afwijkend ? '' : ' (vorige maand)') + '?';
    if (!window.confirm(vraag)) return;
    staat.bezig = true; staat.melding = null; teken();
    try {
      await adminApi('/rapport-start', { method: 'POST', body: JSON.stringify({ organisatieId: org.id, klant: staat.klant, maand: staat.maand, jaar: staat.jaar, velden: staat.waarden, notities: staat.notities }) });
      staat.melding = { tekst: `Gestart voor ${staat.klant}. Het rapport komt in Drive zodra de workflow klaar is, meestal binnen een paar minuten.` };
      staat.waarden = {}; staat.notities = '';
      ververs();
    } catch (err) {
      staat.melding = { fout: true, tekst: err.message };
    }
    staat.bezig = false;
    teken();
  }

  function teken() {
    const root = document.getElementById('viewRapportstart');
    root.innerHTML = `<div class="p-pagina">
      <div class="p-ov-kop"><div><h1>Rapportages</h1><p>Start de maandrapportage voor een klant. Dit is hetzelfde formulier als in n8n, met dezelfde handmatige velden.</p></div></div>
      <div id="rsFormulier">${formulierHtml()}</div>
      <div class="admin-section-title">Laatste starts</div>
      <div id="rsLijst">${lijstHtml()}</div>
    </div>`;
    bind(root);
  }

  async function ververs() {
    try {
      staat.starts = (await adminApi('/rapport-start/recent')).starts || [];
    } catch (err) {
      staat.starts = [];
    }
    tekenLijst();
    clearTimeout(staat.timer);
    if (staat.starts.some((s) => s.status === 'wacht' || s.status === 'bezig') && !document.getElementById('viewRapportstart').classList.contains('hidden')) {
      staat.timer = setTimeout(ververs, 15000);
    }
  }

  window.renderRapportStart = async function () {
    const root = document.getElementById('viewRapportstart');
    if (!staat.config) {
      root.innerHTML = '<div class="p-pagina"><p class="rs-hint">Laden</p></div>';
      try {
        staat.config = (await adminApi('/rapport-start/config')).organisaties;
      } catch (err) {
        root.innerHTML = `<div class="p-pagina"><p class="rs-fout">${e(err.message)}</p></div>`;
        return;
      }
      const m = vorigeMaand();
      staat.org = staat.config[0].id; staat.klant = staat.config[0].klanten[0]; staat.maand = m.maand; staat.jaar = m.jaar;
    }
    teken();
    ververs();
  };
})();
