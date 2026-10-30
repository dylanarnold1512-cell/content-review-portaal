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

  const F = () => window.PortaalFormat;
  const U = () => window.PortaalUI;
  let toonAlleVragen = false;

  function platformKerncijfer(p) {
    const vt = verschilTekst(p.verschil);
    return U().kerncijfer({
      label: p.label, icoon: 'ai', toon: 'ai', info: 'Wij stellen elke week dezelfde vragen over jullie vakgebied aan ' + p.label + '. Dit is het percentage antwoorden waarin jullie merk genoemd wordt. Een meting is een momentopname, het antwoord van een AI assistent kan per dag verschillen.', waarde: F().procent(p.percentage),
      verschil: p.verschil && p.verschil.soort === 'meer' ? { tekst: 'Vaker genoemd', toon: 'goed' } : p.verschil && p.verschil.soort === 'minder' ? { tekst: 'Minder genoemd', toon: 'slecht' } : p.verschil && p.verschil.soort === 'schommeling' ? { tekst: 'Gelijk', toon: 'gelijk' } : null,
      vergelijking: p.genoemd + ' van de ' + p.antwoorden + ' antwoorden noemt jullie merk',
      extra: p.geciteerd + ' keer is jullie website als bron gebruikt' + (vt && p.verschil.soort !== 'schommeling' ? '. ' + vt : '')
    });
  }

  function onderwerpKaarten(clusters, markt) {
    if (!clusters.length) return '';
    const cel = (naam, c) => {
      if (!c || !c.antwoorden) return '<div><dt>' + naam + '</dt><dd class="ai-nvt">Geen data</dd></div>';
      return '<div><dt>' + naam + '</dt><dd>' + esc(F().procent((c.genoemd / c.antwoorden) * 100)) + '<span class="ai-klein"> ' + c.genoemd + ' van ' + c.antwoorden + '</span></dd></div>';
    };
    const kaarten = clusters.map((c) => '<article class="p-ov-onderwerp"><h3>' + esc(c.naam) + '</h3><dl>' + cel('ChatGPT', c.platformen.chatgpt) + cel('Gemini', c.platformen.gemini) + '</dl></article>').join('');
    return U().kaart({ titel: markt ? 'Per markt' : 'Per onderwerp', uitleg: markt ? 'In welke markten (talen) de AI jullie merk het vaakst noemt' : 'Bij welke onderwerpen de AI jullie merk het vaakst noemt', inhoud: '<div class="p-ov-onderwerpen">' + kaarten + '</div>' });
  }

  function trendBlok(trend, reeks, laatsteControle) {
    if (!trend.length) return '';
    const rijen = trend.map((w) => {
      const balk = (p) => {
        const d = w.platformen[p];
        const pct = d.antwoorden ? Math.round((d.genoemd / d.antwoorden) * 100) : 0;
        return `<div class="ai-balk-rij"><span class="ai-balk-naam">${p === 'chatgpt' ? 'ChatGPT' : 'Gemini'}</span><span class="ai-balk"><span class="ai-balk-vul" style="width:${pct}%"></span></span><span class="ai-balk-waarde">${pct}%</span></div>`;
      };
      const markering = w.kernVervangen ? `<div class="ai-markering">Vanaf deze week ${w.kernVervangen === 1 ? 'is 1 vaste vraag' : `zijn ${w.kernVervangen} vaste vragen`} vervangen. Vergelijk met eerdere weken daarom met enige voorzichtigheid.</div>` : '';
      return `<div class="ai-trend-week"><div class="ai-trend-label">${esc(w.label)}</div>${balk('chatgpt')}${balk('gemini')}${markering}</div>`;
    }).join('');
    const basis = reeks === 'kern'
      ? 'Dit verloop is gebaseerd op een vaste set kernvragen, zodat de weken goed vergelijkbaar zijn. Elk kwartaal controleren wij of die vragen nog bij jullie aanbod en de zoekopdrachten passen.'
      : '';
    const controle = reeks === 'kern' && laatsteControle ? ` Laatste controle van de kernvragen: ${esc(F().datumLang(laatsteControle))}.` : '';
    return U().kaart({ titel: 'Verloop per week', uitleg: 'Het percentage antwoorden waarin jullie merk genoemd wordt. Kijk vooral naar de richting over meerdere weken.', inhoud: (basis || controle ? `<p class="ai-uitleg">${esc(basis)}${controle}</p>` : '') + rijen });
  }

  function kansenBlok(kansen) {
    if (!kansen || !kansen.length) return '';
    const label = { hoog: 'Hoge prioriteit', middel: 'Middelhoge prioriteit', laag: 'Lage prioriteit' };
    const items = kansen.map((k) => `<div class="pv-kans">
      <div class="pv-kans-tags"><span class="pv-tag pv-tag-${esc(k.prioriteit)}">${esc(label[k.prioriteit] || 'Prioriteit')}</span></div>
      <div class="pv-ins-titel">${esc(k.signaal)}</div>
      ${k.waarom ? `<div class="pv-ins-tekst">${esc(k.waarom)}</div>` : ''}
      ${k.actie ? `<div class="pv-ins-actie">Wat wij doen: ${esc(k.actie)}</div>` : ''}
      ${k.onderbouwing ? `<details class="pv-onderbouwing"><summary>Onderbouwing</summary><div class="pv-ins-tekst">${esc(k.onderbouwing)}</div></details>` : ''}
    </div>`).join('');
    return U().kaart({ titel: 'Kansen voor AI zichtbaarheid', inhoud: items + '<div class="pv-muted pv-kans-noot">Dit zijn signalen uit de meting, geen garanties. AI antwoorden verschillen van keer tot keer.</div>' });
  }

  // Kansen per vraag: per vraag zonder vermelding de pagina van de site die erbij past.
  function vraagKansenBlok(kansen) {
    if (!kansen || !kansen.length) return '';
    return '<div id="aiVraagKansen">' + U().kaart({
      titel: 'Kansen per vraag',
      uitleg: 'Vragen waarbij AI jullie merk niet noemt. Daarbij zie je welke pagina op jullie site bij het onderwerp past.',
      inhoud: A().vraagKansenHtml(kansen) + '<div class="pv-muted pv-kans-noot">Dit zijn signalen uit de meting, geen garanties. De pagina is gekozen op onderwerp. We hebben nog niet gecontroleerd of het antwoord al in de pagina staat.</div>'
    }) + '</div>';
  }

  function urlBlok(urls) {
    if (!urls.length) return '';
    const lijst = urls.map((u) => `<li><a href="${esc(u.url)}" target="_blank" rel="noopener noreferrer">${esc(u.url.replace(/^https?:\/\//, ''))}</a> <span class="ai-klein">${u.aantal} keer</span></li>`).join('');
    return U().kaart({ titel: 'Pagina’s die de AI gebruikt', uitleg: 'Deze pagina’s van jullie website zijn als bron aangehaald in de antwoorden.', inhoud: `<ul class="ai-lijst">${lijst}</ul>` });
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

  function vragenBlok(data) {
    const markt = data.clusterSoort === 'markt';
    const lijst = data.vragen || [];
    if (!lijst.length) return '';
    const genoemd = (v) => v.chatgpt.genoemd + v.gemini.genoemd > 0;
    const met = lijst.filter(genoemd);
    const zonder = lijst.length - met.length;
    const getoond = toonAlleVragen ? lijst : met;
    const rij = (v) => `<tr class="${genoemd(v) ? '' : 'ai-rij-zwak'}"><td><button type="button" class="ai-vraag-knop" data-ai-vraag="${esc(v.id)}">${esc(v.vraag)}<span class="ai-vraag-lees">Lees het antwoord</span></button></td>${markt ? `<td class="ai-kol">${esc(v.onderwerp)}</td>` : ''}<td class="ai-kol">${stip(v.chatgpt)}</td><td class="ai-kol">${stip(v.gemini)}</td><td class="ai-kol-bron">${bronCel(v)}</td></tr>`;
    const tabel = getoond.length
      ? `<div class="ai-tabel-wrap"><table class="ai-tabel"><thead><tr><th>Vraag</th>${markt ? '<th class="ai-kol">Markt</th>' : ''}<th class="ai-kol">ChatGPT</th><th class="ai-kol">Gemini</th><th class="ai-kol-bron">Website als bron</th></tr></thead><tbody>${getoond.map(rij).join('')}</tbody></table></div>`
      : U().legeStand({ soort: 'wacht', titel: 'Nog bij geen enkele vraag genoemd', tekst: 'Zodra jullie merk in een antwoord staat, zie je de vraag hier.' });
    const knop = zonder > 0 ? `<button type="button" class="pv-toggle" id="aiVragenAlle">${toonAlleVragen ? 'Verberg de vragen zonder vermelding' : `Toon ook de vragen zonder vermelding (${zonder})`}</button>` : '';
    return U().kaart({ titel: 'Per vraag', uitleg: `Bij ${met.length} van de ${lijst.length} vragen werd jullie merk genoemd in de ${data.week.label}. Een groene stip betekent dat het merk in het antwoord stond. Klik op een vraag om het antwoord van de AI te lezen.`, inhoud: tabel + knop });
  }

  // Venster met het antwoord van de AI op een vraag (rechts, zelfde opbouw als het paneel bij Pagina's).
  const antw = { data: null, keuze: null, terugFocus: null, bezig: '' };
  const A = () => window.AiAntwoord;

  function sluitAntwoord() {
    const v = el('aiAntwoord');
    if (v) v.remove();
    if (!document.querySelector('.pa-paneel-achter')) document.body.classList.remove('rp-viewer-open');
    antw.bezig = '';
    const terug = antw.terugFocus;
    antw.terugFocus = null;
    if (terug && document.contains(terug)) terug.focus();
  }

  function tekenAntwoordBody() {
    const body = el('aiAntwoordBody');
    if (body && antw.data) body.innerHTML = A().antwoordHtml(antw.data, antw.keuze) + '<p class="ai-antw-voet">Dit is het antwoord zoals de AI het gaf op onze meetvraag. Antwoorden verschillen van keer tot keer. Andere bedrijven in het antwoord zijn door de AI genoemd, niet door ons.</p>';
  }

  async function openAntwoord(id, bron) {
    sluitAntwoord();
    antw.terugFocus = bron || document.activeElement;
    antw.bezig = id;
    antw.data = null;
    document.body.insertAdjacentHTML('beforeend', `<div class="pa-paneel-achter" id="aiAntwoord"><aside class="pa-paneel ai-antw-paneel" role="dialog" aria-modal="true" aria-labelledby="aiAntwoordTitel"><div class="pa-paneel-kop"><div><span class="ai-antw-label">Antwoord wordt geladen</span><h2 id="aiAntwoordTitel">${esc(bron ? (bron.getAttribute('data-ai-titel') || bron.firstChild.textContent) : '')}</h2></div><button type="button" class="rp-icoonknop" data-ai-sluit aria-label="Sluiten"><svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="pa-paneel-body">${U().laden([{ breedte: '60%', hoogte: 18 }, { breedte: '100%', hoogte: 220 }])}</div></aside></div>`);
    document.body.classList.add('rp-viewer-open');
    const v = el('aiAntwoord');
    v.addEventListener('click', (e) => {
      if (e.target === v || e.target.closest('[data-ai-sluit]')) { sluitAntwoord(); return; }
      const pf = e.target.closest('[data-ai-platform]');
      if (pf) { antw.keuze = { platform: pf.getAttribute('data-ai-platform'), run: 0 }; tekenAntwoordBody(); const k = v.querySelector(`[data-ai-platform="${antw.keuze.platform}"]`); if (k) k.focus(); return; }
      const run = e.target.closest('[data-ai-run]');
      if (run) { antw.keuze = { ...antw.keuze, run: Number(run.getAttribute('data-ai-run')) || 0 }; tekenAntwoordBody(); const k = v.querySelector(`[data-ai-run="${antw.keuze.run}"]`); if (k) k.focus(); }
    });
    v.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); sluitAntwoord(); return; }
      if (e.key !== 'Tab') return;
      const knoppen = Array.from(v.querySelectorAll('a[href], button'));
      if (!knoppen.length) return;
      if (e.shiftKey && document.activeElement === knoppen[0]) { e.preventDefault(); knoppen[knoppen.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === knoppen[knoppen.length - 1]) { e.preventDefault(); knoppen[0].focus(); }
    });
    const sluit = v.querySelector('[data-ai-sluit]');
    if (sluit) sluit.focus();
    try {
      const data = await apiAi(`/${clientId}/ai-zichtbaarheid/vragen/${encodeURIComponent(id)}`);
      if (antw.bezig !== id || !el('aiAntwoord')) return;
      if (data.status !== 'ok') throw new Error('leeg');
      antw.data = data;
      antw.keuze = A().startKeuze(data);
      v.querySelector('.pa-paneel').innerHTML = A().vensterHtml(data, antw.keuze);
      const k = v.querySelector('[data-ai-sluit]');
      if (k) k.focus();
    } catch (err) {
      if (antw.bezig !== id || !el('aiAntwoord')) return;
      const body = v.querySelector('.pa-paneel-body');
      if (body) body.innerHTML = U().foutStand({ titel: 'Dit antwoord laadt even niet', tekst: 'Probeer het straks opnieuw.' });
    }
  }

  async function laadVragen() {
    const blok = el('aiVragenBlok');
    if (!blok) return;
    try {
      const data = await apiAi(`/${clientId}/ai-zichtbaarheid/vragen`);
      if (data.status !== 'ok' || !(data.vragen || []).length) { blok.remove(); return; }
      const teken2 = () => {
        blok.innerHTML = vragenBlok(data);
        const knop = el('aiVragenAlle');
        if (knop) knop.addEventListener('click', () => { toonAlleVragen = !toonAlleVragen; teken2(); });
      };
      if (!blok.dataset.aiGebonden) {
        blok.dataset.aiGebonden = '1';
        blok.addEventListener('click', (e) => {
          const v = e.target.closest('[data-ai-vraag]');
          if (v) openAntwoord(v.getAttribute('data-ai-vraag'), v);
        });
      }
      teken2();
    } catch (err) {
      blok.remove();
    }
  }

  function teken(data) {
    const inhoud = el('aiZichtbaarheidInhoud');
    if (!inhoud) return;
    const kop = '<div class="p-ov-kop"><div><h1>AI zichtbaarheid</h1><p>Steeds meer mensen stellen hun vraag aan ChatGPT of Gemini in plaats van aan Google. Wij stellen elke week dezelfde vragen aan beide en tellen hoe vaak jullie merk in het antwoord voorkomt.</p></div>' +
      (data.status === 'ok' ? `<div class="p-ov-kop-acties"><span class="p-ov-chip"><i class="p-ov-punt"></i>Laatste meting: ${esc(data.laatsteWeek.label)}</span></div>` : '') + '</div>';
    if (data.status !== 'ok') {
      inhoud.innerHTML = '<div class="p-pagina">' + kop + U().kaart({ inhoud: U().legeStand({ soort: 'wacht', titel: 'De eerste meting volgt', tekst: data.melding || 'Zodra de eerste volledige week is gemeten, zie je hier de resultaten.' }) }) + '</div>';
      return;
    }
    const antw = data.platformen.reduce((t, p) => t + p.antwoorden, 0);
    const gen = data.platformen.reduce((t, p) => t + p.genoemd, 0);
    const totaal = antw ? Math.round((gen / antw) * 100) : 0;
    const gec = data.platformen.reduce((t, p) => t + p.geciteerd, 0);
    const d = new Date(Date.UTC(+data.laatsteWeek.start.slice(0, 4), +data.laatsteWeek.start.slice(5, 7) - 1, +data.laatsteWeek.start.slice(8, 10) + 7)).toISOString().slice(0, 10);
    const volgende = d >= new Date().toISOString().slice(0, 10) ? F().datumLang(d) : 'Deze week';
    const status = `<section class="p-kaart p-ov-status" data-toon="goed"><div class="p-ov-status-hoofd"><div class="p-ov-status-regel"><span class="p-ov-puls p-ov-puls-ai"></span>${esc(totaal === 0 ? 'AI noemt jullie merk nog niet' : 'AI noemt jullie merk in ' + totaal + '% van de antwoorden')}</div>
      <p>${esc(totaal === 0 ? 'Dat is een normaal beginpunt. Wij meten elke week en laten hier zien wat er verandert.' : 'Dit is het totaal over ChatGPT en Gemini in de laatste volledige week.')}${data.melding ? ' ' + esc(data.melding) : ''}</p></div>
      <div class="p-ov-status-volgend">
        <div class="p-ov-volgend"><span class="p-ov-lbl">Laatste meting</span><span class="p-ov-val">${esc(data.laatsteWeek.label)}</span><span class="p-ov-txt">${antw} antwoorden</span></div>
        <div class="p-ov-volgend"><span class="p-ov-lbl">Volgende meting</span><span class="p-ov-val">${esc(volgende)}</span><span class="p-ov-txt">Elke week</span></div>
        <div class="p-ov-volgend"><span class="p-ov-lbl">Weken gemeten</span><span class="p-ov-val">${data.aantalWeken}</span><span class="p-ov-txt">${data.aantalWeken < 3 ? 'Verloop volgt na 3 weken' : 'Zie het verloop'}</span></div>
      </div></section>`;
    const verloop = data.aantalWeken < 3
      ? U().kaart({ titel: 'Verloop per week', inhoud: U().legeStand({ soort: 'wacht', titel: 'Het verloop volgt na drie weken', tekst: 'Zo voorkomen we dat toeval als winst of verlies wordt gezien.' }) })
      : trendBlok(data.trend, data.reeks, data.laatsteKernControle);
    inhoud.innerHTML = `<div class="p-pagina">${kop}${status}
      <section class="p-kerncijfers">${data.platformen.map(platformKerncijfer).join('')}${U().kerncijfer({ label: 'Website als bron', icoon: 'blad', info: 'Hoe vaak een AI assistent jullie website als bron noemde onder het antwoord. Dat is waardevol, want mensen kunnen dan doorklikken.', waarde: F().getal(gec), vergelijking: 'Keer dat jullie website in een antwoord werd aangehaald' })}</section>
      ${data.clusterSoort === 'markt' ? '<p class="ai-uitleg">De cijfers hierboven zijn het totaal over alle markten.</p>' : ''}
      <div class="p-ov-raster2">
        <div class="p-ov-stapel">${verloop}${onderwerpKaarten(data.clusters, data.clusterSoort === 'markt')}<div id="aiVragenBlok"></div></div>
        <div class="p-ov-stapel">${kansenBlok(data.kansen)}${vraagKansenBlok(data.vraagKansen)}${urlBlok(data.eigenUrls)}<p class="ai-voet">Het gaat om vragen die wij zelf hebben opgesteld. AI antwoorden verschillen van keer tot keer, dus het gaat om het grote beeld.</p></div>
      </div></div>`;
    const kansenVraag = el('aiVraagKansen');
    if (kansenVraag) {
      kansenVraag.addEventListener('click', (e) => {
        const v = e.target.closest('[data-ai-vraag]');
        if (v) openAntwoord(v.getAttribute('data-ai-vraag'), v);
      });
    }
    laadVragen();
  }

  async function laad() {
    const inhoud = el('aiZichtbaarheidInhoud');
    if (inhoud) inhoud.innerHTML = '<div class="p-pagina">' + U().laden([{ breedte: '40%', hoogte: 30 }, { breedte: '100%', hoogte: 120 }, { breedte: '100%', hoogte: 160 }]) + '</div>';
    try {
      teken(await apiAi(`/${clientId}/ai-zichtbaarheid`));
    } catch (err) {
      if (inhoud) inhoud.innerHTML = '<div class="p-pagina">' + U().foutStand({ titel: 'De AI meting laadt even niet', tekst: 'De rest van het portaal werkt gewoon. Probeer het straks opnieuw.' }) + '</div>';
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
