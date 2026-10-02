// Standaard WordPress-thema correcties voor elke klant en elk sjabloon (02-10-2026). Alleen op de echte
// WordPress-pagina (opts.forWordPress), niet in het portaalvoorbeeld. Twee problemen die bij elk thema
// voorkomen, gevonden bij Roots (Beaver Builder) en MAC Bouw (thema Elevate):
//
// 1. De content staat in een smalle container van het thema, waardoor donkere en gekleurde vlakken niet
//    tot de rand van het scherm lopen en er witte randen om ons ontwerp staan. Fix: de pagina loopt over
//    de volle schermbreedte (viewport breakout). Het kader om de inhoud regelt het sjabloon zelf (shell).
//    body:has(.lpt) zorgt dat horizontaal scrollen nooit kan ontstaan, alleen op onze pagina's.
// 2. Het thema toont boven de content een eigen titelbalk met de paginatitel als H1 (bij Roots
//    header.fl-post-header, bij MAC Bouw de balk "reactheme-breadcrumbs"). Dat is lelijk en geeft een
//    tweede H1 naast de H1 van onze hero. Fix: een klein script zoekt elke H1 buiten onze pagina, klimt
//    omhoog naar het blok dat alleen de titel (en eventueel een kruimelpad) bevat en verbergt dat blok.
//    Werkt zonder kennis van het thema. Het logo, menu en afbeeldingen worden nooit verborgen.

function themaCss(rootClass) {
  return `<style>
body:has(.${rootClass}) { overflow-x: clip; }
.${rootClass} { width: 100vw; max-width: 100vw; margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw); }
</style>`;
}

// Staat als gewone tekst in de content. Geen afhankelijkheden, geen bibliotheken.
function themaScript(rootClass) {
  const js = `(function(){var r=document.querySelector('.${rootClass}');if(!r)return;function n(t){return(t||'').replace(/\\s+/g,' ').trim();}var hs=document.querySelectorAll('h1');for(var i=0;i<hs.length;i++){var h=hs[i];if(r.contains(h)||h.contains(r))continue;if(!(r.compareDocumentPosition(h)&2))continue;var len=n(h.textContent).length;if(!len)continue;var blok=h,p=h.parentElement;while(p&&p!==document.body&&p!==document.documentElement){if(p.contains(r))break;if(p.querySelector('img,input,textarea,select,form,video,iframe'))break;if(p.querySelectorAll('a').length>5)break;if(n(p.textContent).length>len+60)break;blok=p;p=p.parentElement;}blok.style.setProperty('display','none','important');}})();`;
  return `<script>${js}</script>`;
}

// WordPress verandert tekens in inline scripts: && wordt &#038;&#038; (daardoor een scriptfout, gevonden op
// MAC Bouw 02-10-2026) en < en > kunnen ook geschreven worden. Daarom gaat elk gewoon inline script op de
// WordPress pagina als base64 mee en wordt het in de browser uitgepakt. Base64 bevat alleen letters, cijfers,
// plus, slash en is-teken, dus WordPress kan er niets aan veranderen. Scripts met een type (JSON-LD) blijven staan.
function versluierScripts(html) {
  return String(html).replace(/<script>([\s\S]*?)<\/script>/g, (_, js) => {
    const b64 = Buffer.from(js, 'utf8').toString('base64');
    return `<script>new Function(new TextDecoder().decode(Uint8Array.from(atob("${b64}"),function(c){return c.charCodeAt(0)})))()</script>`;
  });
}

module.exports = { themaCss, themaScript, versluierScripts };
