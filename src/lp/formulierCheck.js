// LP Fabriek: een ingesloten formulier moet er goed uitzien op elke plek in elk sjabloon, voor elke klant
// en elke formulierplugin (Dylan, 02-10-2026). Aanleiding: bij MAC Bouw stond het Contact Form 7 formulier
// in een smalle zijkolom van 460 px en liepen vinkjes, privacyregel en bestandsveld uit hun vakken.
//
// Drie onderdelen, allemaal los van het gekozen sjabloon:
// 1. Aanpassing aan de breedte (CSS, container query op .lp-formulier, plus een klein script dat
//    meerkoloms grids en rijen van het formulier onder 560 px onder elkaar zet). Draait op de echte
//    WordPress pagina en in het portaalvoorbeeld.
// 2. Een voorbeeldformulier in het portaalvoorbeeld, met alle lastige onderdelen (tegels, vinkjes,
//    bestand, privacyregel, knop met tekst ernaast), in plaats van alleen een placeholder. Het
//    voorbeeld gebruikt dezelfde opmaak als de echte pagina, maar NIET de opmaak van de klantsite zelf.
// 3. Een controle in het portaalvoorbeeld: het script meet of iets buiten het formulier valt, een veld te
//    smal wordt of een groep een eigen rand krijgt, bij de huidige breedte en bij 360 px, en stuurt de
//    uitkomst (postMessage) naar het portaal, dat een melding boven het voorbeeld toont.
// De eindcontrole blijft de echte WordPress pagina: de opmaak van de klantsite laadt niet mee in het voorbeeld.

const SMAL_DREMPEL_PX = 560;
const CONTROLE_BREEDTE_PX = 360;

// CSS onder de rootClass. De container query gaat over de breedte van het formulier zelf, niet over het
// scherm, dus het werkt ook in een smalle kolom op een breed scherm.
function responsiefFormulierCss(rootClass) {
  return `.${rootClass} .lp-formulier { container-type: inline-size; container-name: lpform; width: 100%; }
.${rootClass} .lp-formulier input, .${rootClass} .lp-formulier select, .${rootClass} .lp-formulier textarea { max-width: 100%; }
@container lpform (max-width: ${SMAL_DREMPEL_PX}px) {
  .${rootClass} .lp-formulier input[type="submit"], .${rootClass} .lp-formulier button[type="submit"] { width: 100%; }
}`;
}

// Zelfde idee voor Contact Form 7: keuzes onder elkaar en een volle breedte knop in een smal formulier.
function responsiefCf7Css(rootClass) {
  return `.${rootClass} .lp-formulier .wpcf7-form-control-wrap { max-width: 100%; }
@container lpform (max-width: ${SMAL_DREMPEL_PX}px) {
  .${rootClass} .lp-formulier .wpcf7-list-item { display: block; margin: 0 0 8px; }
  .${rootClass} .lp-formulier .wpcf7-submit { width: 100%; }
}`;
}

// Gedeeld deel van het script (ES5, geen afhankelijkheden): het formulier onder de drempel onder elkaar zetten.
const AANPAS_JS = `var w=document.querySelector('.lp-formulier');if(!w)return;
function pas(){var smal=w.getBoundingClientRect().width<${SMAL_DREMPEL_PX};
if(smal){var els=w.querySelectorAll('*');for(var i=0;i<els.length;i++){var e=els[i];var cs=getComputedStyle(e);
if(cs.display==='grid'&&cs.gridTemplateColumns.split(' ').length>1&&e.getAttribute('data-lp-g')===null){e.setAttribute('data-lp-g',e.style.gridTemplateColumns||'-');e.style.setProperty('grid-template-columns','1fr','important');}
else if(cs.display==='flex'&&cs.flexDirection.indexOf('row')===0&&cs.flexWrap==='nowrap'&&e.children.length>1&&!/^(LABEL|SPAN|A|BUTTON)$/.test(e.tagName)&&e.getAttribute('data-lp-f')===null){e.setAttribute('data-lp-f','1');e.style.setProperty('flex-wrap','wrap','important');}}}
else{var oud=w.querySelectorAll('[data-lp-g],[data-lp-f]');for(var j=0;j<oud.length;j++){var o=oud[j];if(o.getAttribute('data-lp-g')!==null){var v=o.getAttribute('data-lp-g');o.style.removeProperty('grid-template-columns');if(v!=='-')o.style.gridTemplateColumns=v;o.removeAttribute('data-lp-g');}if(o.getAttribute('data-lp-f')!==null){o.style.removeProperty('flex-wrap');o.removeAttribute('data-lp-f');}}}}`;

// Alleen de aanpassing aan de breedte (echte WordPress pagina). Draait pas als de pagina geladen is.
function formulierAanpasScript() {
  const js = `function lpFormulierPas(){${AANPAS_JS}
pas();if(window.ResizeObserver){var t;new ResizeObserver(function(){clearTimeout(t);t=setTimeout(pas,60);}).observe(w);}else{window.addEventListener('resize',pas);}}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',lpFormulierPas);}else{lpFormulierPas();}`;
  return `<script>${js.replace(/\n/g, "")}</script>`;
}

// Aanpassing plus controle (alleen het portaalvoorbeeld). Meet bij de huidige breedte en bij 360 px.
function formulierControleScript() {
  const js = `function lpFormulierControle(){${AANPAS_JS}
function naam(e){var c=(typeof e.className==='string'?e.className:'').split(' ')[0];return e.tagName.toLowerCase()+(c?'.'+c:'');}
function meet(){var wr=w.getBoundingClientRect();var p=[];var els=w.querySelectorAll('*');
for(var i=0;i<els.length;i++){var e=els[i];var cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden')continue;var r=e.getBoundingClientRect();if(!r.width&&!r.height)continue;
if(r.right>wr.right+2||r.left<wr.left-2){p.push('Een onderdeel ('+naam(e)+') loopt buiten het formulier');}
if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)){var t=e.type;if(t!=='radio'&&t!=='checkbox'&&t!=='hidden'&&t!=='submit'&&t!=='file'&&r.width<110){p.push('Een invoerveld ('+naam(e)+') is te smal');}}
if(/(^|\\s)wpcf7-(radio|checkbox|acceptance)(\\s|$)/.test(typeof e.className==='string'?e.className:'')&&(parseFloat(cs.borderTopWidth)>0||parseFloat(cs.borderBottomWidth)>0)){p.push('Een keuzegroep ('+naam(e)+') heeft een eigen rand');}}
return p;}
function uniek(a){var o=[];for(var i=0;i<a.length;i++){if(o.indexOf(a[i])<0)o.push(a[i]);}return o;}
function controleer(){pas();var nu=Math.round(w.getBoundingClientRect().width);var p1=meet();
var oudW=w.style.width,oudM=w.style.maxWidth;w.style.width='${CONTROLE_BREEDTE_PX}px';w.style.maxWidth='none';pas();var p2=meet();w.style.width=oudW;w.style.maxWidth=oudM;pas();
var uit=[];var a=uniek(p1);for(var i=0;i<a.length;i++)uit.push('Bij de huidige breedte ('+nu+' px): '+a[i]);var b=uniek(p2);for(var j=0;j<b.length;j++)uit.push('Bij ${CONTROLE_BREEDTE_PX} px: '+b[j]);
try{parent.postMessage({type:'lp-formulier-check',problemen:uit,breedte:nu,controleBreedte:${CONTROLE_BREEDTE_PX}},'*');}catch(e){}}
var t;function plan(){clearTimeout(t);t=setTimeout(controleer,400);}
pas();plan();setTimeout(controleer,1500);if(window.ResizeObserver){new ResizeObserver(function(){pas();plan();}).observe(w);}else{window.addEventListener('resize',plan);}}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',lpFormulierControle);}else{lpFormulierControle();}`;
  return `<script>${js.replace(/\n/g, "")}</script>`;
}

// Voorbeeldformulier voor het portaalvoorbeeld. Contact Form 7 achtige opbouw met alle lastige onderdelen.
// De naam van de klasse volgt Contact Form 7, de opmaak komt uit formulierStijl.js (of de generieke regels).
function voorbeeldFormulierHtml() {
  const radio = (naam, tekst, aan) => `<span class="wpcf7-list-item"><label><input type="radio" name="${naam}" value="${tekst}"${aan ? ' checked' : ''}><span class="wpcf7-list-item-label">${tekst}</span></label></span>`;
  const vink = (naam, tekst) => `<span class="wpcf7-list-item"><label><input type="checkbox" name="${naam}[]" value="${tekst}"><span class="wpcf7-list-item-label">${tekst}</span></label></span>`;
  return `<div class="wpcf7 lp-voorbeeldformulier"><form class="wpcf7-form" onsubmit="return false">
<p><label>Wat voor project heb je in gedachten? *<span class="wpcf7-form-control-wrap"><span class="wpcf7-form-control wpcf7-radio">${radio('project', 'Totaalrenovatie woning', true)}${radio('project', 'Aanbouw of uitbouw')}${radio('project', 'Verbouwing')}${radio('project', 'Anders')}</span></span></label></p>
<p><label>Welke werkzaamheden zijn gewenst?<span class="wpcf7-form-control-wrap"><span class="wpcf7-form-control wpcf7-checkbox">${vink('werk', 'Aanbouw')}${vink('werk', 'Renovatie')}${vink('werk', 'Keuken of badkamer')}${vink('werk', 'Vergunning en begeleiding')}</span></span></label></p>
<p><label>Beschrijf kort je plannen *<span class="wpcf7-form-control-wrap"><textarea class="wpcf7-form-control wpcf7-textarea" rows="4" placeholder="Bijvoorbeeld: een aanbouw met nieuwe indeling"></textarea></span></label></p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
<p><label>Naam *<span class="wpcf7-form-control-wrap"><input class="wpcf7-form-control" type="text" placeholder="Voor- en achternaam"></span></label></p>
<p><label>E-mailadres *<span class="wpcf7-form-control-wrap"><input class="wpcf7-form-control" type="email" placeholder="naam@voorbeeld.nl"></span></label></p>
<p><label>Telefoonnummer *<span class="wpcf7-form-control-wrap"><input class="wpcf7-form-control" type="tel" placeholder="06 12 34 56 78"></span></label></p>
<p><label>Wanneer wil je starten?<span class="wpcf7-form-control-wrap"><select class="wpcf7-form-control"><option>Kies een optie</option><option>Zo snel mogelijk</option></select></span></label></p>
</div>
<p><label>Foto's of bestand meesturen<span class="wpcf7-form-control-wrap"><input class="wpcf7-form-control" type="file"></span></label></p>
<p><span class="wpcf7-form-control-wrap"><span class="wpcf7-form-control wpcf7-acceptance"><span class="wpcf7-list-item"><label><input type="checkbox"><span class="wpcf7-list-item-label">Ik ga akkoord met de verwerking van mijn gegevens conform het privacybeleid.</span></label></span></span></span></p>
<div style="display:flex;align-items:center;gap:16px"><input class="wpcf7-form-control wpcf7-submit" type="submit" value="Vraag vrijblijvend offerte aan"><span>Geen verplichtingen. We nemen zo snel mogelijk contact op.</span></div>
</form></div>
<p class="lp-voorbeeldformulier-noot">Voorbeeldformulier voor controle. Op de echte pagina staat het formulier van de klant, met ook de opmaak van de klantsite.</p>`;
}

module.exports = {
  SMAL_DREMPEL_PX,
  CONTROLE_BREEDTE_PX,
  responsiefFormulierCss,
  responsiefCf7Css,
  formulierAanpasScript,
  formulierControleScript,
  voorbeeldFormulierHtml
};
