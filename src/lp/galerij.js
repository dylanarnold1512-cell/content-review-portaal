// Galerij / slideshow als vaste bouwsteen (29-09-2026). Voor elke klant en elk sjabloon beschikbaar.
//
// Opzet, naar het voorbeeld van {{formulier}}: het sjabloon bepaalt alleen de PLEK met de marker
// {{galerij}}. De engine zet daar een vaste, in de huisstijl gestijlde slideshow neer. De foto's komen uit
// de lijst-slot "galleryItems" (itemFields imageSrc, imageAlt, caption), dus alle bestaande machinerie voor
// foto's werkt vanzelf: klikken om te wisselen in het voorbeeld, automatisch kiezen uit de
// mediabibliotheek, en een item verbergen op paginaniveau.
//
// De marker wordt bij het renderen vervangen door gewone sjabloon-HTML met een {{#each galleryItems}}
// blok, VOOR het taggen en invullen van de slots. Daardoor hoeft niets anders te weten dat dit een
// component is. Sectie-nummering verandert niet (geen <section> in de component).
//
// Zonder JavaScript is het een swipebare rij (CSS scroll snap). Een klein script (alleen bij deze
// component) voegt pijltjes en puntjes toe. Het staat bewust niet in het sjabloon zelf: sjablonen mogen
// geen scripts bevatten (templateSafetyCheck), dit is vaste systeemcode.

const GALERIJ_MARKER_RE = /\{\{\s*galerij\s*\}\}/;
const GALERIJ_MARKER_RE_G = /\{\{\s*galerij\s*\}\}/g;
const GALERIJ_SLOT = {
  key: 'galleryItems',
  label: 'Galerij / slideshow',
  type: 'list',
  verplicht: false,
  itemFields: ['imageSrc', 'imageAlt', 'caption']
};

function heeftGalerijMarker(html) {
  return GALERIJ_MARKER_RE.test(String(html || ''));
}

// Zorgt dat een blueprint met de marker ook het bijbehorende slot heeft. Muteert niet, geeft een kopie
// terug als er iets nodig was. Zo hoeft de AI het slot niet zelf goed te declareren.
function zorgVoorGalerijSlot(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') return blueprint;
  if (!heeftGalerijMarker(blueprint.htmlTemplate)) return blueprint;
  const slots = Array.isArray(blueprint.slots) ? blueprint.slots : [];
  const bestaand = slots.find((s) => s && s.key === GALERIJ_SLOT.key);
  if (bestaand) {
    const velden = Array.isArray(bestaand.itemFields) ? bestaand.itemFields : [];
    const compleet = GALERIJ_SLOT.itemFields.every((f) => velden.includes(f));
    if (bestaand.type === 'list' && compleet) return blueprint;
    return {
      ...blueprint,
      slots: slots.map((s) => (s === bestaand ? { ...GALERIJ_SLOT, verplicht: !!s.verplicht } : s))
    };
  }
  return { ...blueprint, slots: [...slots, { ...GALERIJ_SLOT }] };
}

const SCRIPT = `<script>(function(){document.querySelectorAll('.lp-galerij:not([data-lp-init])').forEach(function(g){g.setAttribute('data-lp-init','1');var t=g.querySelector('.lp-galerij-track');if(!t)return;Array.prototype.slice.call(t.children).forEach(function(f){var im=f.querySelector('img');if(im&&!im.getAttribute('src')&&!im.hasAttribute('data-lp-slot'))t.removeChild(f);});var n=t.children.length;if(!n){g.style.display='none';return;}var p=g.querySelector('.lp-galerij-prev'),x=g.querySelector('.lp-galerij-next'),d=g.querySelector('.lp-galerij-dots');var dots=[];function w(){return t.children[0].getBoundingClientRect().width+16;}function m(){var v=Math.max(1,Math.round(t.clientWidth/(w()||1)));return Math.max(1,n-v+1);}function i(){return Math.min(m()-1,Math.max(0,Math.round(t.scrollLeft/(w()||1))));}function go(k){t.scrollTo({left:k*w(),behavior:'smooth'});}function bouw(){if(!d)return;d.innerHTML='';dots=[];for(var k=0;k<m();k++){(function(k){var b=document.createElement('button');b.type='button';b.className='lp-galerij-dot';b.setAttribute('aria-label','Foto '+(k+1));b.addEventListener('click',function(){go(k);});d.appendChild(b);dots.push(b);})(k);}}function upd(){var atEnd=t.scrollLeft+t.clientWidth>=t.scrollWidth-2;var c=atEnd?dots.length-1:i();dots.forEach(function(b,k){b.setAttribute('aria-current',k===c?'true':'false');});if(p)p.disabled=t.scrollLeft<=2;if(x)x.disabled=atEnd;}if(p)p.addEventListener('click',function(){go(Math.max(0,i()-1));});if(x)x.addEventListener('click',function(){go(Math.min(m()-1,i()+1));});t.addEventListener('scroll',function(){window.requestAnimationFrame(upd);});window.addEventListener('resize',function(){bouw();upd();});g.classList.add('lp-galerij--js');bouw();upd();});})();</script>`;

const GALERIJ_HTML =
  '<div class="lp-galerij" data-lp-galerij="1">' +
  '<div class="lp-galerij-track" tabindex="0" role="region" aria-label="Fotogalerij">' +
  '{{#each galleryItems}}' +
  '<figure class="lp-galerij-slide"><img src="{{imageSrc}}" alt="{{imageAlt}}" loading="lazy">' +
  '<figcaption class="lp-galerij-bijschrift">{{caption}}</figcaption></figure>' +
  '{{/each}}' +
  '</div>' +
  '<button type="button" class="lp-galerij-knop lp-galerij-prev" aria-label="Vorige foto">&#8249;</button>' +
  '<button type="button" class="lp-galerij-knop lp-galerij-next" aria-label="Volgende foto">&#8250;</button>' +
  '<div class="lp-galerij-dots"></div>' +
  '</div>' +
  SCRIPT;

const galerijCss = (rootClass) => `<style>
.${rootClass} .lp-galerij { position: relative; font-family: var(--lp-font-body); }
.${rootClass} .lp-galerij-track { display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; -webkit-overflow-scrolling: touch; padding: 0; margin: 0; }
.${rootClass} .lp-galerij-track::-webkit-scrollbar { display: none; }
.${rootClass} .lp-galerij-slide { flex: 0 0 calc((100% - 32px) / 3); scroll-snap-align: start; margin: 0; }
.${rootClass} .lp-galerij-slide img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--lp-card-radius); background: var(--lp-bg-alt); }
.${rootClass} .lp-galerij-bijschrift { margin-top: 8px; font-size: 0.95rem; color: var(--lp-text-muted, var(--lp-text)); }
.${rootClass} .lp-galerij-bijschrift:empty { display: none; }
.${rootClass} .lp-galerij-knop, .${rootClass} .lp-galerij-dots { display: none; }
.${rootClass} .lp-galerij--js .lp-galerij-knop { display: flex; align-items: center; justify-content: center; position: absolute; top: calc(50% - 40px); width: 44px; height: 44px; padding: 0 0 4px; border: 0; border-radius: var(--lp-button-radius); background: var(--lp-cta-bg); color: var(--lp-cta-text); font-size: 28px; line-height: 1; cursor: pointer; }
.${rootClass} .lp-galerij--js .lp-galerij-knop:disabled { opacity: 0.35; cursor: default; }
.${rootClass} .lp-galerij-prev { left: 8px; }
.${rootClass} .lp-galerij-next { right: 8px; }
.${rootClass} .lp-galerij--js .lp-galerij-dots { display: flex; justify-content: center; gap: 8px; margin-top: 16px; }
.${rootClass} .lp-galerij-dot { width: 10px; height: 10px; padding: 0; border: 0; border-radius: 50%; background: var(--lp-border); cursor: pointer; }
.${rootClass} .lp-galerij-dot[aria-current="true"] { background: var(--lp-cta-bg); }
@media (max-width: 900px) { .${rootClass} .lp-galerij-slide { flex-basis: calc((100% - 16px) / 2); } }
@media (max-width: 560px) { .${rootClass} .lp-galerij-slide { flex-basis: 88%; } }
</style>`;

// html: sjabloon-HTML. Geeft { html, css }. Zonder marker gebeurt er niets (geen css).
// Hoogstens een galerij per pagina: een tweede marker wordt verwijderd.
function pasGalerijToe(html, { rootClass }) {
  const bron = String(html || '');
  if (!GALERIJ_MARKER_RE.test(bron)) return { html: bron, css: '' };
  let eerste = true;
  const uit = bron.replace(GALERIJ_MARKER_RE_G, () => {
    if (!eerste) return '';
    eerste = false;
    return GALERIJ_HTML;
  });
  return { html: uit, css: galerijCss(rootClass) };
}

module.exports = { pasGalerijToe, heeftGalerijMarker, zorgVoorGalerijSlot, GALERIJ_SLOT };
