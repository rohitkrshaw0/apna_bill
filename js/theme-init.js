// Plain (non-module) script, loaded synchronously and early in <head> so the saved
// theme is applied to <html> before first paint — avoids a flash of the wrong theme.
// Keep the storage key in sync with js/ui/theme.js.
(function () {
  try {
    var t = localStorage.getItem('apnabill-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
