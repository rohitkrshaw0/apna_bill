import { icon } from './icons.js';

const STORAGE_KEY = 'apnabill-theme';

// Explicit user choice (if any) wins; otherwise fall back to OS preference.
export function currentEffectiveTheme () {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Wires a click handler on the given button (default #theme-toggle) that flips the
// theme and remembers the choice, and renders its sun/moon icons. Which one is
// visible is pure CSS, driven off the data-theme attribute this sets — see
// shared.css's .theme-toggle rules.
export function initThemeToggle (selector = '#theme-toggle') {
  const btn = document.querySelector(selector);
  if (!btn) return;
  btn.innerHTML = icon('sun', { size: 18, className: 'icon-sun' }) + icon('moon', { size: 18, className: 'icon-moon' });
  btn.addEventListener('click', () => {
    const next = currentEffectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
  });
}
