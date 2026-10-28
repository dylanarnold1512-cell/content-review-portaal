// Het antwoord van ChatGPT of Gemini op een meetvraag, als leesbare tekst met het
// merk van de klant gemarkeerd. Alleen tekenen, los van het scherm, zodat het in
// Node testbaar is. Alle tekst uit de AI gaat eerst door esc(): de AI tekst kan
// nooit eigen HTML in het portaal zetten. Links worden alleen gemaakt voor http(s).
(function () {
  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const regexEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // "Bubbel Broeders" vindt ook "BubbelBroeders" en "Bubbel-Broeders".
  function termPatroon(term) {
    const tekens = Array.from(String(term || '').replace(/[^\p{L}\p{N}]/gu, ''));
    if (tekens.length < 2) return null;
    return tekens.map(regexEsc).join('[\\s.\\-]?');
  }

  function merkRegex(termen) {
    const delen = (termen || []).map(termPatroon).filter(Boolean);
    if (!delen.length) return null;
    return new RegExp('(?<![\\p{L}\\p{N}])(' + delen.join('|') + ')(?![\\p{L}\\p{N}])', 'giu');
  }

  // Markeert het merk alleen in tekst, nooit binnen een HTML tag.
  function markeer(html, re) {
    if (!re) return html;
    return html.split(/(<[^>]+>)/).map((deel) => (deel.startsWith('<') ? deel : deel.replace(re, '<mark class="ai-merk">$1</mark>'))).join('');
  }

  function veiligeUrl(url) {
    return /^https?:\/\//i.test(String(url || '')) ? String(url) : '';
  }

  function korteUrl(url) {
    return String(url || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/$/, '');
  }

  // Opmaak binnen een regel: links, **vet**, en het merk gemarkeerd.
  function inline(tekst, re) {
    const linkRe = /\[((?:\[[^\]]*\]|[^\]])*)\]\((https?:\/\/[^)\s]+)\)/g;
    let uit = '';
    let pos = 0;
    let m;
    const opmaak = (t) => markeer(esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*\*/g, ''), re);
    while ((m = linkRe.exec(tekst))) {
      uit += opmaak(tekst.slice(pos, m.index));
      const url = veiligeUrl(m[2]);
      const label = m[1].replace(/^\[|\]$/g, '');
      if (/^\d{1,3}$/.test(label)) {
        uit += url ? `<a class="ai-ref" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(korteUrl(url))}">${esc(label)}</a>` : '';
      } else {
        uit += url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${opmaak(label)}</a>` : opmaak(label);
      }
      pos = m.index + m[0].length;
    }
    uit += opmaak(tekst.slice(pos));
    return uit;
  }

  function tabelCellen(regel) {
    return regel.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  }

  // Een eenvoudige, veilige weergave van de Markdown die ChatGPT en Gemini teruggeven:
  // kopjes, alinea's, opsommingen, tabellen, vet en links.
  function markdownNaarHtml(md, termen) {
    const re = merkRegex(termen);
    const regels = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    const blokken = [];
    let lijst = null;
    let alinea = [];
    let tabel = null;
    const sluitAlinea = () => { if (alinea.length) { blokken.push(`<p>${alinea.map((r) => inline(r, re)).join('<br>')}</p>`); alinea = []; } };
    const sluitLijst = () => { if (lijst) { blokken.push(`<${lijst.soort}>${lijst.items.map((i) => `<li>${inline(i, re)}</li>`).join('')}</${lijst.soort}>`); lijst = null; } };
    const sluitTabel = () => {
      if (!tabel) return;
      const [kop, ...rest] = tabel;
      blokken.push(`<div class="ai-antw-tabel"><table><thead><tr>${kop.map((c) => `<th>${inline(c, re)}</th>`).join('')}</tr></thead><tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${inline(c, re)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      tabel = null;
    };
    const sluitAlles = () => { sluitAlinea(); sluitLijst(); sluitTabel(); };
    for (const ruwMd of regels) {
      // "2\. Kwaliteit" is in Markdown gewone tekst, geen genummerde lijst.
      const letterlijk = /^\s*\d{1,3}\\[.)]/.test(ruwMd);
      const ruw = ruwMd.replace(/\\([.#\-!|()[\]_*])/g, '$1');
      const regel = ruw.replace(/\s+$/, '');
      if (!regel.trim()) { sluitAlles(); continue; }
      if (/^\s*\|.*\|\s*$/.test(regel)) {
        sluitAlinea(); sluitLijst();
        if (/^\s*\|?\s*:?-{2,}/.test(regel)) continue;
        tabel = tabel || [];
        tabel.push(tabelCellen(regel));
        continue;
      }
      sluitTabel();
      const kop = /^\s*#{1,6}\s+(.*)$/.exec(regel);
      if (kop) { sluitAlinea(); sluitLijst(); blokken.push(`<h4>${inline(kop[1].replace(/#+\s*$/, ''), re)}</h4>`); continue; }
      if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(regel)) { sluitAlles(); blokken.push('<hr>'); continue; }
      const punt = /^\s*[-*•]\s+(.*)$/.exec(regel);
      const nummer = letterlijk ? null : /^\s*\d{1,3}[.)]\s+(.*)$/.exec(regel);
      if (punt || nummer) {
        sluitAlinea();
        const soort = punt ? 'ul' : 'ol';
        if (lijst && lijst.soort !== soort) sluitLijst();
        lijst = lijst || { soort, items: [] };
        lijst.items.push((punt || nummer)[1]);
        continue;
      }
      if (lijst && /^\s{2,}\S/.test(ruw)) { lijst.items[lijst.items.length - 1] += ' ' + regel.trim(); continue; }
      sluitLijst();
      alinea.push(regel.trim());
    }
    sluitAlles();
    return blokken.join('');
  }

  function telMerk(md, termen) {
    const re = merkRegex(termen);
    if (!re) return 0;
    // Alleen de leesbare tekst telt, niet de adressen achter links.
    const tekst = String(md || '').replace(/\]\((https?:\/\/[^)\s]+)\)/g, ']');
    return (tekst.match(re) || []).length;
  }

  function statusRegel(run) {
    const delen = [];
    delen.push(run.genoemd ? '<span class="ai-antw-pil ai-antw-ja"><span class="ai-stip ai-stip-ja"></span>Merk genoemd</span>' : '<span class="ai-antw-pil"><span class="ai-stip"></span>Merk niet genoemd</span>');
    if (run.geciteerd) delen.push('<span class="ai-antw-pil ai-antw-ja">Website als bron</span>');
    return delen.join('');
  }

  function runKnoppen(platform, gekozen) {
    if (platform.runs.length < 2) return '';
    return `<div class="ai-antw-runs" role="group" aria-label="Metingen"><span>Deze week ${platform.runs.length} keer gevraagd:</span>${platform.runs.map((r, i) => `<button type="button" class="ai-antw-run${i === gekozen ? ' is-actief' : ''}" data-ai-run="${i}" aria-pressed="${i === gekozen}"><span class="ai-stip${r.genoemd ? ' ai-stip-ja' : ''}"></span>Meting ${i + 1}</button>`).join('')}</div>`;
  }

  function bronnenHtml(run) {
    if (!run.bronnen.length) return '';
    const eigen = new Set((run.eigenUrls || []).map((u) => korteUrl(u)));
    const items = run.bronnen.map((b) => {
      const isEigen = eigen.has(korteUrl(b.url));
      return `<li${isEigen ? ' class="ai-antw-eigen"' : ''}><a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">${esc(b.titel)}</a><span>${esc(b.domein || korteUrl(b.url))}${isEigen ? ' · jullie website' : ''}</span></li>`;
    }).join('');
    return `<div class="ai-antw-bronnen"><h3>Bronnen in dit antwoord (${run.bronnen.length})</h3><ol>${items}</ol></div>`;
  }

  // Het deel van het venster onder de kop: tabs per platform en het gekozen antwoord.
  function antwoordHtml(data, keuze) {
    const platformen = (data && data.platformen) || [];
    const actief = platformen.find((p) => p.id === keuze.platform) || platformen[0];
    if (!actief) return '';
    const tabs = `<div class="ai-antw-tabs" role="tablist">${platformen.map((p) => {
      const genoemd = p.runs.some((r) => r.genoemd);
      return `<button type="button" role="tab" class="ai-antw-tab${p.id === actief.id ? ' is-actief' : ''}" data-ai-platform="${esc(p.id)}" aria-selected="${p.id === actief.id}"><span class="ai-stip${genoemd ? ' ai-stip-ja' : ''}"></span>${esc(p.label)}</button>`;
    }).join('')}</div>`;
    if (!actief.runs.length) {
      return `${tabs}<div class="ai-antw-leeg">${esc(actief.label)} gaf deze week geen bruikbaar antwoord op deze vraag.</div>`;
    }
    const idx = Math.min(Math.max(0, keuze.run || 0), actief.runs.length - 1);
    const run = actief.runs[idx];
    const aantal = telMerk(run.antwoord, data.termen);
    const nietGevonden = run.genoemd && !aantal && run.ingekort
      ? '<p class="ai-antw-noot">Het merk staat verderop in dit antwoord. Van deze meting is alleen het begin bewaard.</p>'
      : '';
    const ingekort = run.ingekort && !nietGevonden ? '<p class="ai-antw-noot">Van deze meting is alleen het begin van het antwoord bewaard.</p>' : '';
    return `${tabs}${runKnoppen(actief, idx)}<div class="ai-antw-status">${statusRegel(run)}</div>${nietGevonden}<div class="ai-antw-tekst">${markdownNaarHtml(run.antwoord, data.termen) || '<p class="ai-antw-leeg">Geen tekst bewaard.</p>'}</div>${ingekort}${bronnenHtml(run)}`;
  }

  // Het hele venster. keuze: { platform, run }.
  function vensterHtml(data, keuze) {
    const k = keuze || {};
    return `<div class="pa-paneel-kop ai-antw-kop"><div><span class="ai-antw-label">${esc(data.week ? 'Antwoord uit de ' + data.week.label : 'Antwoord')}</span><h2 id="aiAntwoordTitel">${esc(data.vraag)}</h2></div><button type="button" class="rp-icoonknop" data-ai-sluit aria-label="Sluiten"><svg class="p-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="pa-paneel-body ai-antw-body" id="aiAntwoordBody">${antwoordHtml(data, k)}
      <p class="ai-antw-voet">Dit is het antwoord zoals de AI het gaf op onze meetvraag. Antwoorden verschillen van keer tot keer. Andere bedrijven in het antwoord zijn door de AI genoemd, niet door ons.</p></div>`;
  }

  // Standaardkeuze: het eerste platform waarin het merk genoemd werd.
  function startKeuze(data) {
    const p = ((data && data.platformen) || []).find((x) => x.runs.some((r) => r.genoemd)) || ((data && data.platformen) || [])[0];
    return { platform: p ? p.id : 'chatgpt', run: 0 };
  }

  const api = { markdownNaarHtml, vensterHtml, antwoordHtml, startKeuze, telMerk, merkRegex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.AiAntwoord = api;
})();
