// LP Fabriek: herstylen van een ingesloten klantformulier (Contact Form 7, Gravity Forms, e.d.).
//
// Aanleiding: de standaardopmaak van een formulierenplugin is meestal lelijk en sluit niet aan bij
// de rest van de gegenereerde pagina. Dylan wil dat een ingesloten formulier er wel bij past, qua
// kleur, radius en lettertype - net zoals hij dat eerder handmatig met AI deed voor losse formulieren.
//
// Dit bestand doet ALLEEN de visuele herstyling via CSS. De daadwerkelijke velden/vragen van het
// formulier zelf (welke vragen, verplicht of niet, enzovoort) blijven beheerd in het formulierenplugin
// in WordPress zelf - dat is een apart, groter vraagstuk (eigen API per plugin, raakt het live
// formulier van de klant) en wordt hier bewust niet aangepakt.
//
// Hergebruikt de bestaande CSS-variabelen die renderStyle (style.js) al onder de rootClass zet
// (--lp-primary, --lp-radius, --lp-border, enz.) - dit bestand verzint geen eigen kleuren, het volgt
// gewoon de tokens die de rest van de pagina ook gebruikt.
//
// Scoping-regel, zelfde als style.js: ELKE selector hier valt onder de meegegeven rootClass, zodat
// deze CSS nooit buiten onze eigen content lekt naar de rest van de WordPress-pagina (het thema, de
// header/footer, of andere content op dezelfde pagina).

function genericFormCss(rootClass) {
  return `.${rootClass} input[type="text"],
.${rootClass} input[type="email"],
.${rootClass} input[type="tel"],
.${rootClass} input[type="url"],
.${rootClass} input[type="number"],
.${rootClass} input[type="date"],
.${rootClass} textarea,
.${rootClass} select {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  margin: 0 0 12px;
  border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius);
  background: var(--lp-bg);
  color: var(--lp-text);
  font-family: var(--lp-font-body);
  font-size: 1rem;
}
.${rootClass} label {
  display: block;
  margin: 0 0 6px;
  font-weight: 600;
  color: var(--lp-text);
  font-family: var(--lp-font-body);
}
.${rootClass} input[type="submit"],
.${rootClass} button[type="submit"],
.${rootClass} button {
  display: inline-block;
  padding: 12px 24px;
  border: none;
  border-radius: var(--lp-radius);
  background: var(--lp-cta-bg);
  color: var(--lp-cta-text);
  font-weight: 600;
  font-family: var(--lp-font-body);
  cursor: pointer;
}
.${rootClass} input[type="submit"]:hover,
.${rootClass} button[type="submit"]:hover,
.${rootClass} button:hover {
  opacity: 0.9;
}`;
}

// Plugin-specifieke overrides: targeten de eigen klassen van het plugin. Sommige plugins (met name
// Gravity Forms en WPForms) leveren hun eigen, vrij specifieke standaardstijlen mee - daar is
// !important nodig om die daadwerkelijk te overschrijven, de generieke regels hierboven zijn dan niet
// specifiek genoeg.
const PLUGIN_CSS_BUILDERS = {
  'Contact Form 7': (rootClass) => `.${rootClass} .wpcf7-form-control {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  margin: 0 0 12px;
  border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius);
  font-family: var(--lp-font-body);
}
.${rootClass} .wpcf7-submit {
  background: var(--lp-cta-bg);
  color: var(--lp-cta-text);
  border: none;
  border-radius: var(--lp-radius);
  padding: 12px 24px;
  font-weight: 600;
}`,

  'Gravity Forms': (rootClass) => `.${rootClass} .gform_wrapper .gfield_label {
  font-weight: 600;
  color: var(--lp-text);
}
.${rootClass} .gform_wrapper input[type="text"],
.${rootClass} .gform_wrapper input[type="email"],
.${rootClass} .gform_wrapper input[type="tel"],
.${rootClass} .gform_wrapper textarea,
.${rootClass} .gform_wrapper select {
  border: 1px solid var(--lp-border) !important;
  border-radius: var(--lp-radius) !important;
  padding: 12px 14px !important;
}
.${rootClass} .gform_wrapper .gform_button {
  background: var(--lp-cta-bg) !important;
  color: var(--lp-cta-text) !important;
  border: none !important;
  border-radius: var(--lp-radius) !important;
}`,

  WPForms: (rootClass) => `.${rootClass} .wpforms-field input,
.${rootClass} .wpforms-field textarea,
.${rootClass} .wpforms-field select {
  border: 1px solid var(--lp-border) !important;
  border-radius: var(--lp-radius) !important;
}
.${rootClass} .wpforms-submit {
  background: var(--lp-cta-bg) !important;
  color: var(--lp-cta-text) !important;
  border-radius: var(--lp-radius) !important;
  border: none !important;
}`,

  'Ninja Forms': (rootClass) => `.${rootClass} .nf-form-cont input,
.${rootClass} .nf-form-cont textarea,
.${rootClass} .nf-form-cont select {
  border: 1px solid var(--lp-border) !important;
  border-radius: var(--lp-radius) !important;
}
.${rootClass} .nf-form-cont .submit-wrap input[type="submit"] {
  background: var(--lp-cta-bg) !important;
  color: var(--lp-cta-text) !important;
  border-radius: var(--lp-radius) !important;
}`,

  'Formidable Forms': (rootClass) => `.${rootClass} .frm_forms input[type="text"],
.${rootClass} .frm_forms input[type="email"],
.${rootClass} .frm_forms textarea,
.${rootClass} .frm_forms select {
  border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius);
}
.${rootClass} .frm_forms .frm_button_submit {
  background: var(--lp-cta-bg);
  color: var(--lp-cta-text);
  border-radius: var(--lp-radius);
  border: none;
}`,

  'Elementor Forms': (rootClass) => `.${rootClass} .elementor-field-group .elementor-field {
  border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius);
}
.${rootClass} .elementor-button[type="submit"] {
  background: var(--lp-cta-bg) !important;
  color: var(--lp-cta-text) !important;
  border-radius: var(--lp-radius) !important;
}`,

  'Fluent Forms': (rootClass) => `.${rootClass} .fluentform input,
.${rootClass} .fluentform textarea,
.${rootClass} .fluentform select {
  border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius);
}
.${rootClass} .fluentform .ff-btn-submit {
  background: var(--lp-cta-bg) !important;
  color: var(--lp-cta-text) !important;
  border-radius: var(--lp-radius) !important;
  border: none !important;
}`
};

// Bouwt het volledige <style>-blok voor een ingesloten formulier: altijd de generieke basisregels
// (die ook een onherkend/custom formulier al netjes laten aansluiten bij de pagina), plus - als het
// plugin herkend is (zie detecteerFormulieren in siteAnalyse.js) - de plugin-specifieke overrides
// erbovenop voor een preciezere match.
function buildFormulierCss(rootClass, plugin) {
  if (!rootClass || !rootClass.trim()) {
    throw new Error('buildFormulierCss heeft een rootClass nodig om de CSS onder te scopen.');
  }
  const blokken = [genericFormCss(rootClass)];
  const pluginBuilder = plugin && PLUGIN_CSS_BUILDERS[plugin];
  if (pluginBuilder) {
    blokken.push(pluginBuilder(rootClass));
  }
  return `<style>\n${blokken.join('\n')}\n</style>`;
}

module.exports = { buildFormulierCss, PLUGIN_CSS_BUILDERS };
