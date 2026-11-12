// Vangnet voor het Advertisr logo. Het logo wordt van advertisr.nl geladen. Lukt dat niet,
// dan staat er een kapot plaatje in het menu. Dan tonen we de naam als tekst.
(function () {
  function vervang(img) {
    if (!img || img.tagName !== 'IMG' || !img.matches('.p-logo, .brand-logo') || img.dataset.vangnet) return;
    img.dataset.vangnet = '1';
    const t = document.createElement('span');
    t.className = 'logo-tekst';
    t.textContent = 'Advertisr.';
    img.replaceWith(t);
  }
  document.addEventListener('error', function (e) { vervang(e.target); }, true);
  // Plaatjes die al mislukt waren voordat dit script klaar was.
  window.addEventListener('load', function () {
    document.querySelectorAll('img.p-logo, img.brand-logo').forEach(function (img) {
      if (img.complete && img.naturalWidth === 0) vervang(img);
    });
  });
})();
