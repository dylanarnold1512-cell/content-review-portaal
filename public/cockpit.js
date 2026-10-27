// Cockpit in de admin: alle klanten op kleur, alleen de afwijkingen in beeld.
// Gebruikt adminApi, escapeHtmlAdmin, adminInitialen en gaNaar uit admin.js.
(function () {
  const KLEUR = {
    rood: { label: 'Direct aandacht', pil: 'p-pil-fout' },
    oranje: { label: 'Let op', pil: 'p-pil-let-op' },
    groen: { label: 'Draait goed', pil: 'p-pil-goed' },
    uit: { label: 'Uit', pil: 'p-pil-neutraal' }
  };

  const SOORT = { techniek: 'Techniek', kwaliteit: 'Kwaliteit', blog: 'Blog', data: 'Data', klant: 'Klant' };

  function tellingen(data) {
    const t = { rood: 0, oranje: 0, groen: 0, uit: 0 };
    for (const k of (data && data.klanten) || []) t[k.kleur] = (t[k.kleur] || 0) + 1;
    return t;
  }

  // Aantal dat aandacht vraagt (teller in het menu): rode en oranje klanten plus de gedeelde workflows als die niet groen zijn.
  function aandacht(data) {
    if (!data) return 0;
    const t = tellingen(data);
    return t.rood + t.oranje + (data.gedeeld && data.gedeeld.kleur !== 'groen' ? 1 : 0);
  }

  function tijd(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }

  const model = { tellingen, aandacht, KLEUR };
  if (typeof module !== 'undefined' && module.exports) { module.exports = model; return; }

  let stand = { data: null, fout: '', laden: false };

  function signaalHtml(s) {
    const e = escapeHtmlAdmin;
    const details = s.details && s.details.length
      ? `<details class="ck-details"><summary>Toon ${s.details.length === 1 ? 'details' : s.details.length + ' items'}</summary><ul>${s.details.map((d) => `<li>${e(d)}</li>`).join('')}</ul></details>`
      : '';
    const link = s.link ? ` <a class="ck-link" href="${e(s.link)}" target="_blank" rel="noopener">Open in n8n</a>` : '';
    const soort = SOORT[s.soort] ? `<span class="ck-soort">${SOORT[s.soort]}</span>` : '';
    return `<li class="ck-signaal ck-${e(s.niveau)}"><span class="ck-stip" aria-hidden="true"></span><div>${soort}<span>${e(s.tekst)}</span>${link}${details}</div></li>`;
  }

  function datumKort(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  }

  function steekproefHtml(sp) {
    const e = escapeHtmlAdmin;
    if (!sp || !sp.blogs || !sp.blogs.length) return '';
    const open = sp.blogs.filter((b) => !b.oordeel).length;
    const rijen = sp.blogs.map((b, i) => {
      const oordeel = b.oordeel
        ? `<span class="p-pil ${b.oordeel === 'goed' ? 'p-pil-goed' : 'p-pil-fout'}">${b.oordeel === 'goed' ? 'Goed' : 'Niet goed'}</span>${b.opmerking ? `<span class="ck-sp-opm">${e(b.opmerking)}</span>` : ''}`
        : `<div class="ck-sp-knoppen"><button type="button" class="p-knop" data-sp-goed="${i}">Goed</button><button type="button" class="p-knop" data-sp-niet="${i}">Niet goed</button></div>
           <div class="ck-sp-form hidden" data-sp-form="${i}"><textarea rows="2" placeholder="Wat is er niet goed? Bijvoorbeeld: te algemeen, verkeerde toon, feit klopt niet" data-sp-tekst="${i}"></textarea><button type="button" class="p-knop p-knop-hoofd" data-sp-opslaan="${i}">Opslaan</button></div>`;
      return `<li class="ck-sp-rij">
        <div class="ck-sp-info"><a href="${e(b.url)}" target="_blank" rel="noopener">${e(b.titel)}</a><span>${e(b.klantNaam)}, gepubliceerd ${e(datumKort(b.datum))}</span></div>
        <div class="ck-sp-oordeel">${oordeel}</div>
      </li>`;
    }).join('');
    return `
      <section class="ck-sectie">
        <h2>Steekproef deze week ${open ? `<span class="p-teller">${open}</span>` : ''}</h2>
        <p class="ck-uitleg">Lees deze blogs zoals een klant ze leest. De controles vangen fouten, jij vangt of een blog echt goed is. Een afkeuring komt als kwaliteitssignaal bij de klant en in blog_kwaliteit.</p>
        <ul class="ck-klant ck-sp">${rijen}</ul>
      </section>`;
  }

  function klantKaart(k) {
    const e = escapeHtmlAdmin;
    const kl = KLEUR[k.kleur] || KLEUR.groen;
    const signalen = k.signalen.filter((s) => s.niveau !== 'info');
    const info = k.signalen.filter((s) => s.niveau === 'info');
    return `
    <article class="ck-klant ck-rand-${e(k.kleur)}">
      <div class="ck-klant-kop">
        <div class="p-klant-av" aria-hidden="true">${e(adminInitialen(k.naam))}</div>
        <div class="ad-klant-naam"><b>${e(k.naam)}</b><span>${e(k.producten || '')}</span></div>
        <span class="p-pil ${kl.pil}">${kl.label}</span>
      </div>
      <ul class="ck-signalen">${signalen.map(signaalHtml).join('')}${info.map(signaalHtml).join('')}</ul>
      <div class="ck-acties">
        <button type="button" class="p-knop" data-bekijk="${e(k.id)}">Bekijk als klant</button>
        <button type="button" class="p-knop" data-beheer="${e(k.id)}">Beheer</button>
      </div>
    </article>`;
  }

  function teken() {
    const root = document.getElementById('viewCockpit');
    if (!root) return;
    const e = escapeHtmlAdmin;
    const d = stand.data;
    const kop = `
    <div class="p-ov-kop">
      <div><h1>Cockpit</h1><p>Alleen wat afwijkt. Groene klanten hoef je niet te openen.</p></div>
      <div class="p-ov-kop-acties ck-kop-acties">
        ${d ? `<span class="ck-tijd">Bijgewerkt om ${e(tijd(d.bijgewerkt))}</span>` : ''}
        <button type="button" class="p-knop" data-ververs ${stand.laden ? 'disabled' : ''}>${stand.laden ? 'Bezig met controleren' : 'Opnieuw controleren'}</button>
      </div>
    </div>`;
    if (!d) {
      root.innerHTML = `<div class="p-pagina">${kop}<div class="p-kaart ck-leeg">${stand.fout ? `De cockpit kon niet worden geladen: ${e(stand.fout)}` : 'Alle klanten worden gecontroleerd. Dit duurt ongeveer een halve minuut.'}</div></div>`;
      bind(root);
      return;
    }
    const t = tellingen(d);
    const aandachtKlanten = d.klanten.filter((k) => k.kleur === 'rood' || k.kleur === 'oranje');
    const groen = d.klanten.filter((k) => k.kleur === 'groen');
    const uit = d.klanten.filter((k) => k.kleur === 'uit');
    const gedeeld = d.gedeeld || { signalen: [], kleur: 'groen' };
    root.innerHTML = `
    <div class="p-pagina">
      ${kop}
      <div class="p-kerncijfers ad-kerncijfers">
        <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Direct aandacht</div><div class="ad-getal ck-getal-rood">${t.rood}</div></div>
        <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Let op</div><div class="ad-getal ck-getal-oranje">${t.oranje}</div></div>
        <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Draait goed</div><div class="ad-getal ck-getal-groen">${t.groen}</div></div>
        <div class="p-kerncijfer"><div class="p-kerncijfer-kop">Gedeelde workflows met fouten</div><div class="ad-getal ${gedeeld.signalen.length ? 'ck-getal-' + gedeeld.kleur : 'ck-getal-groen'}">${gedeeld.signalen.length}</div></div>
      </div>
      ${(d.problemen || []).map((p) => `<div class="ck-probleem">${e(p)}</div>`).join('')}
      ${gedeeld.signalen.length ? `
      <section class="ck-sectie">
        <h2>Gedeelde workflows</h2>
        <p class="ck-uitleg">Deze workflows draaien voor alle Shared klanten tegelijk. Een fout hier kan meerdere klanten raken.</p>
        <article class="ck-klant ck-rand-${e(gedeeld.kleur)}"><ul class="ck-signalen">${gedeeld.signalen.map(signaalHtml).join('')}</ul></article>
      </section>` : ''}
      <section class="ck-sectie">
        <h2>Klanten die aandacht vragen</h2>
        ${aandachtKlanten.length ? `<div class="ck-raster">${aandachtKlanten.map(klantKaart).join('')}</div>` : '<div class="p-kaart ck-leeg">Geen enkele klant vraagt nu aandacht.</div>'}
      </section>
      ${steekproefHtml(d.steekproef)}
      ${groen.length ? `
      <section class="ck-sectie">
        <h2>Draait goed</h2>
        <div class="ck-chips">${groen.map((k) => `<button type="button" class="ck-chip" data-beheer="${e(k.id)}" title="${e(k.samenvatting || '')}"><span class="ck-stip ck-groen-stip" aria-hidden="true"></span>${e(k.naam)}</button>`).join('')}</div>
      </section>` : ''}
      ${uit.length ? `
      <section class="ck-sectie">
        <h2>Niet actief</h2>
        <div class="ck-chips">${uit.map((k) => `<button type="button" class="ck-chip ck-chip-uit" data-beheer="${e(k.id)}">${e(k.naam)} <small>${e(k.samenvatting || '')}</small></button>`).join('')}</div>
      </section>` : ''}
      <details class="ck-uitleg-blok"><summary>Wat wordt er gecontroleerd</summary>
        <ul>
          <li><b>Techniek:</b> blogs op Fout of vastgelopen, geplande blogs die te laat zijn, een planning die leegloopt, de laatste publicatie, mislukte n8n runs in 7 dagen, workflows die niet meer draaien, prestatiedata die niet meer wordt bijgewerkt en de kritieke punten uit de Clients tabel.</li>
          <li><b>Blog:</b> per gepubliceerde blog van de laatste 4 maanden: na 21 dagen nog niet in Google of geblokkeerd, geen interne link, korter dan 500 woorden, geen tussenkoppen, geen SEO titel of omschrijving, geen Live URL en geen uitgelichte afbeelding.</li>
          <li><b>Kwaliteit:</b> 3 of meer QA afkeuringen in 14 dagen, herschrijvingen na feedback die de controle niet halen, en een klant die 40% of meer van de blogs afwijst (60 dagen, vanaf 3 beoordelingen).</li>
          <li><b>Data:</b> vertoningen 25% of clicks 30% lager dan de 28 dagen ervoor. Vanaf 50% is het rood. Alleen bij genoeg verkeer om iets te zeggen.</li>
          <li><b>Gedeelde workflows:</b> staat de naam van een klant in de invoer van de stap die misging, dan komt de fout ook bij die klant te staan.</li>
          <li><b>Klant:</b> blogs die langer dan 7 dagen op goedkeuring wachten en een klant die langer dan 30 dagen niet in het portaal was.</li>
        </ul>
        <p>Elke maandagochtend komt er één samenvatting in Telegram met alleen de klanten die aandacht vragen en de steekproef van die week.</p>
      </details>
    </div>`;
    bind(root);
  }

  async function bewaarOordeel(i, oordeel, opmerking) {
    const b = stand.data.steekproef.blogs[i];
    try {
      await adminApi('/cockpit/steekproef', { method: 'POST', body: JSON.stringify({ klantNaam: b.klantNaam, blogId: b.blogId, titel: b.titel, oordeel, opmerking }) });
      b.oordeel = oordeel;
      b.opmerking = opmerking || '';
      renderError('');
      teken();
    } catch (err) {
      renderError(err.message);
    }
  }

  function bind(root) {
    root.querySelectorAll('[data-sp-goed]').forEach((b) => b.addEventListener('click', () => bewaarOordeel(Number(b.dataset.spGoed), 'goed', '')));
    root.querySelectorAll('[data-sp-niet]').forEach((b) => b.addEventListener('click', () => {
      const form = root.querySelector(`[data-sp-form="${b.dataset.spNiet}"]`);
      form.classList.remove('hidden');
      form.querySelector('textarea').focus();
    }));
    root.querySelectorAll('[data-sp-opslaan]').forEach((b) => b.addEventListener('click', () => {
      const i = b.dataset.spOpslaan;
      bewaarOordeel(Number(i), 'niet goed', root.querySelector(`[data-sp-tekst="${i}"]`).value);
    }));
    root.querySelectorAll('[data-ververs]').forEach((b) => b.addEventListener('click', () => laadCockpit(true)));
    root.querySelectorAll('[data-bekijk]').forEach((b) => b.addEventListener('click', () => bekijkAlsKlant(b.dataset.bekijk)));
    root.querySelectorAll('[data-beheer]').forEach((b) => b.addEventListener('click', () => gaNaar('klant', b.dataset.beheer)));
  }

  function zetTeller() {
    const el = document.getElementById('cockpitTeller');
    if (!el) return;
    const n = aandacht(stand.data) + (((stand.data && stand.data.steekproef && stand.data.steekproef.blogs) || []).some((b) => !b.oordeel) ? 1 : 0);
    el.textContent = n ? String(n) : '';
    el.classList.toggle('hidden', !n);
  }

  async function laadCockpit(ververs) {
    if (stand.laden) return;
    stand.laden = true;
    stand.fout = '';
    if (huidig.view === 'cockpit') teken();
    try {
      stand.data = await adminApi('/cockpit' + (ververs ? '?ververs=1' : ''));
    } catch (err) {
      stand.fout = err.message;
    }
    stand.laden = false;
    zetTeller();
    if (huidig.view === 'cockpit') teken();
  }

  async function bekijkAlsKlant(clientId) {
    // Het venster gaat meteen open (anders blokkeert de browser het), daarna komt het adres.
    const venster = window.open('', '_blank');
    try {
      const r = await adminApi('/bekijk-als/' + encodeURIComponent(clientId), { method: 'POST' });
      if (venster) venster.location.href = r.url; else window.location.href = r.url;
    } catch (err) {
      if (venster) venster.close();
      renderError(err.message);
    }
  }

  window.renderCockpit = teken;
  window.laadCockpit = laadCockpit;
  window.bekijkAlsKlant = bekijkAlsKlant;
  // Elke 10 minuten opnieuw, gelijk met de cache op de server.
  setInterval(() => { if (!document.hidden) laadCockpit(false); }, 10 * 60 * 1000);
})();
