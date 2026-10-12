// AI zichtbaarheid-tabblad: hoe vaak ChatGPT en Gemini het merk van de klant
// noemen. Toont alleen het eigen merk. Data en regels staan in
// src/services/aiZichtbaarheid.js, hier wordt alleen getekend.
(function () {
  let clientId = '';
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function apiAi(pad) {
    const res = await fetch('/api' + pad, { headers: { 'Content-Type': 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Er ging iets mis.');
    return data;
  }

  function verschilTekst(v) {
    if (!v || v.soort === 'geen') return '';
    if (v.soort === 'schommeling') return 'Ongeveer gelijk aan de vorige meting';
    if (v.soort === 'meer') return `${v.aantal} keer vaker genoemd dan verwacht op basis van de vorige meting`;
    return `${v.aantal} keer minder genoemd dan verwacht op basis van de vorige meting`;
  }

  function verschilKlasse(v) {
    if (v && v.soort === 'meer') return 'ai-verschil ai-omhoog';
    if (v && v.soort === 'minder') return 'ai-verschil ai-omlaag';
    return 'ai-verschil';
  }

  function kaart(p) {
    const vt = verschilTekst(p.verschil);
    return `<div class="ai-kaart">
      <div class="ai-kaart-kop">${esc(p.label)}</div>
      <div class="ai-groot">${p.percentage}%</div>
      <div class="ai-onder">${p.genoemd} van de ${p.antwoorden} antwoorden noemt jullie merk</div>
      <div class="ai-onder">${p.geciteerd} keer is jullie website als bron gebruikt</div>
      ${vt ? `<div class="${verschilKlasse(p.verschil)}">${esc(vt)}</div>` : ''}
    </div>`;
  }

  function procent(c) {
    if (!c || !c.antwoorden) return '<span class="ai-nvt">geen data</span>';
    return `${Math.round((c.genoemd / c.antwoorden) * 100)}% <span class="ai-klein">(${c.genoemd} van ${c.antwoorden})</span>`;
  }

  function clusterTabel(clusters, markt) {
    if (!clusters.length) return '';
    const woord = markt ? 'Markt' : 'Onderwerp';
    const rijen = clusters.map((c) => `<tr><td>${esc(c.naam)}</td><td>${procent(c.platformen.chatgpt)}</td><td>${procent(c.platformen.gemini)}</td></tr>`).join('');
    return `<div class="ai-blok"><h3>${markt ? 'Per markt' : 'Per onderwerp'}</h3>
      <p class="ai-uitleg">${markt ? 'In welke markten (talen) noemt de AI jullie merk het vaakst.' : 'Bij welke onderwerpen noemt de AI jullie merk het vaakst.'}</p>
      <div class="ai-tabel-wrap"><table class="ai-tabel"><thead><tr><th>${woord}</th><th>ChatGPT</th><th>Gemini</th></tr></thead><tbody>${rijen}</tbody></table></div></div>`;
  }

  function trendBlok(trend) {
    if (!trend.length) return '';
    const rijen = trend.map((w) => {
      const balk = (p) => {
        const d = w.platformen[p];
        const pct = d.antwoorden ? Math.round((d.genoemd / d.antwoorden) * 100) : 0;
        return `<div class="ai-balk-rij"><span class="ai-balk-naam">${p === 'chatgpt' ? 'ChatGPT' : 'Gemini'}</span><span class="ai-balk"><span class="ai-balk-vul" style="width:${pct}%"></span></span><span class="ai-balk-waarde">${pct}%</span></div>`;
      };
      return `<div class="ai-trend-week"><div class="ai-trend-label">${esc(w.label)}</div>${balk('chatgpt')}${balk('gemini')}</div>`;
    }).join('');
    return `<div class="ai-blok"><h3>Verloop per week</h3>
      <p class="ai-uitleg">Het percentage antwoorden waarin jullie merk genoemd wordt. Kleine schommelingen zeggen weinig, kijk vooral naar de richting over meerdere weken.</p>${rijen}</div>`;
  }

  function urlBlok(urls) {
    if (!urls.length) return '';
    const lijst = urls.map((u) => `<li><a href="${esc(u.url)}" target="_blank" rel="noopener noreferrer">${esc(u.url.replace(/^https?:\/\//, ''))}</a> <span class="ai-klein">${u.aantal} keer</span></li>`).join('');
    return `<div class="ai-blok"><h3>Pagina's die de AI gebruikt</h3>
      <p class="ai-uitleg">Deze pagina's van jullie website zijn als bron aangehaald in de antwoorden.</p><ul class="ai-lijst">${lijst}</ul></div>`;
  }

  function stip(p) {
    if (!p || !p.metingen) return '<span class="ai-cel"><span class="ai-stip ai-stip-leeg" title="Geen meting"></span></span>';
    const goed = p.genoemd > 0;
    const tekst = p.metingen > 1 ? `${p.genoemd} van ${p.metingen}` : (goed ? 'ja' : 'nee');
    return `<span class="ai-cel"><span class="ai-stip${goed ? ' ai-stip-ja' : ''}"></span><span class="ai-klein">${esc(tekst)}</span></span>`;
  }

  function bronCel(v) {
    const n = (v.chatgpt.geciteerd || 0) + (v.gemini.geciteerd || 0);
    if (!n) return '<span class="ai-nvt">geen</span>';
    const url = v.urls[0];
    return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48))}</a>` : `${n} keer`;
  }

  function vragenBlok(data, alles) {
    const markt = data.clusterSoort === 'markt';
    const lijst = data.vragen || [];
    if (!lijst.length) return '';
    const getoond = alles ? lijst : lijst.slice(0, 15);
    const rijen = getoond.map((v) => {
      const gevonden = v.chatgpt.genoemd + v.gemini.genoemd > 0;
      return `<tr class="${gevonden ? '' : 'ai-rij-zwak'}"><td>${esc(v.vraag)}</td>${markt ? `<td class="ai-kol">${esc(v.onderwerp)}</td>` : ''}<td class="ai-kol">${stip(v.chatgpt)}</td><td class="ai-kol">${stip(v.gemini)}</td><td class="ai-kol-bron">${bronCel(v)}</td></tr>`;
    }).join('');
    const gevonden = lijst.filter((v) => v.chatgpt.genoemd + v.gemini.genoemd > 0).length;
    const meer = !alles && lijst.length > 15 ? `<button type="button" class="mp-link" id="aiVragenAlle">Toon alle ${lijst.length} vragen</button>` : '';
    return `<h3>Per vraag</h3>
      <p class="ai-uitleg">Bij ${gevonden} van de ${lijst.length} vragen werd jullie merk genoemd in de ${esc(data.week.label)}. Een groene stip betekent dat het merk in het antwoord stond.</p>
      <div class="ai-tabel-wrap"><table class="ai-tabel"><thead><tr><th>Vraag</th>${markt ? '<th class="ai-kol">Markt</th>' : ''}<th class="ai-kol">ChatGPT</th><th class="ai-kol">Gemini</th><th class="ai-kol-bron">Website als bron</th></tr></thead><tbody>${rijen}</tbody></table></div>${meer}`;
  }

  async function laadVragen() {
    const blok = el('aiVragenBlok');
    if (!blok) return;
    try {
      const data = await apiAi(`/${clientId}/ai-zichtbaarheid/vragen`);
      if (data.status !== 'ok') { blok.remove(); return; }
      const teken2 = (alles) => {
        blok.innerHTML = vragenBlok(data, alles);
        const knop = el('aiVragenAlle');
        if (knop) knop.addEventListener('click', () => teken2(true));
      };
      teken2(false);
    } catch (err) {
      blok.remove();
    }
  }

  function teken(data) {
    const inhoud = el('aiZichtbaarheidInhoud');
    if (!inhoud) return;
    if (data.status !== 'ok') {
      inhoud.innerHTML = `<div class="ai-leeg">${esc(data.melding || 'Er zijn nog geen resultaten.')}</div>`;
      return;
    }
    inhoud.innerHTML = `
      <div class="ai-intro">
        <h2>AI zichtbaarheid</h2>
        <p>Steeds meer mensen stellen hun vraag aan ChatGPT of Gemini in plaats van aan Google. Wij stellen elke week dezelfde vragen aan beide en tellen hoe vaak jullie merk in het antwoord voorkomt.</p>
        <p class="ai-stand">Laatste volledige meting: ${esc(data.laatsteWeek.label)}</p>
        ${data.melding ? `<p class="ai-let-op">${esc(data.melding)}</p>` : ''}
      </div>
      ${data.clusterSoort === 'markt' ? '<p class="ai-uitleg">De cijfers hieronder zijn het totaal over alle markten. Per markt staat het hieronder.</p>' : ''}
      <div class="ai-kaarten">${data.platformen.map(kaart).join('')}</div>
      ${data.aantalWeken < 3 ? '<p class="ai-uitleg">Het verloop per week verschijnt zodra er drie volledige weken zijn gemeten. Zo voorkomen we dat toeval als winst of verlies wordt gezien.</p>' : ''}
      ${trendBlok(data.trend)}
      ${clusterTabel(data.clusters, data.clusterSoort === 'markt')}
      <div class="ai-blok" id="aiVragenBlok"><p class="ai-uitleg">Vragen laden...</p></div>
      ${urlBlok(data.eigenUrls)}
      <p class="ai-voet">Het gaat om vragen die wij zelf hebben opgesteld. AI antwoorden verschillen van keer tot keer, dus het gaat om het grote beeld.</p>`;
    laadVragen();
  }

  async function laad() {
    const inhoud = el('aiZichtbaarheidInhoud');
    if (inhoud) inhoud.innerHTML = '<div class="ai-leeg">Laden...</div>';
    try {
      teken(await apiAi(`/${clientId}/ai-zichtbaarheid`));
    } catch (err) {
      if (inhoud) inhoud.innerHTML = `<div class="ai-leeg">${esc(err.message)}</div>`;
    }
  }

  async function controleer(id) {
    clientId = id;
    const knop = el('aiZichtbaarheidTabBtn');
    try {
      const data = await apiAi(`/${clientId}/ai-zichtbaarheid`);
      if (knop) knop.classList.toggle('hidden', !data.beschikbaar);
    } catch (err) {
      if (knop) knop.classList.add('hidden');
    }
  }

  window.checkAiZichtbaarheid = controleer;
  window.loadAiZichtbaarheid = laad;
})();
