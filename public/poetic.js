// Shared lazy-loader for embedded song players — framework-owned, do not hand-edit.
// A single delegated click handler that works for any embed (Audiomack, YouTube,
// Spotify, …) on any page. The embed URL is resolved at build time into
// data-embed-src, so this stays provider-agnostic and no third-party iframe loads
// until the visitor clicks. Player dimensions come from CSS (.song-embed-player).
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.song-embed-btn');
  if (!btn) return;
  const src = btn.dataset.embedSrc;
  const container = btn.closest('.song-embed');
  const player = container && container.querySelector('.song-embed-player');
  if (!player || !src) return;
  btn.classList.add('hidden');
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('loading', 'lazy');
  iframe.title = btn.dataset.title || '';
  player.classList.remove('hidden'); player.appendChild(iframe);
});

// Postscript "See more" preview — the CSS checkbox hack handles expand/collapse
// without JS; this just suppresses the toggle when truncation would hide <= 1 line,
// which depends on rendered layout and so can only be decided at runtime.
function evaluatePostscriptPreview(el) {
  const previewLines = parseFloat(el.dataset.previewLines) || 5;
  const style = getComputedStyle(el);
  let lineHeightPx = parseFloat(style.lineHeight);
  if (isNaN(lineHeightPx)) lineHeightPx = 1.2 * parseFloat(style.fontSize);
  const budgetPx = previewLines * lineHeightPx;
  const toggle = el.parentElement && el.parentElement.querySelector('.postscript-toggle');

  // Measure the true bottom of rendered content, excluding the trailing margin of
  // the last child. scrollHeight includes that margin, which would count empty
  // space as "hidden" and show a pointless toggle. Layout positions are unaffected
  // by the collapsed overflow:hidden clamp, so the child rect is the full position.
  const last = el.lastElementChild;
  const contentPx = last
    ? last.getBoundingClientRect().bottom - el.getBoundingClientRect().top
    : el.scrollHeight;
  const hiddenPx = contentPx - budgetPx;

  // Only offer the toggle when it would reveal at least a full line of real text.
  if (hiddenPx <= lineHeightPx) {
    el.classList.add('postscript-no-preview');
    if (toggle) toggle.classList.add('hidden');
  } else {
    el.classList.remove('postscript-no-preview');
    if (toggle) toggle.classList.remove('hidden');
  }
}

function evaluateAllPostscriptPreviews() {
  document.querySelectorAll('.postscript-content').forEach(evaluatePostscriptPreview);
}

document.addEventListener('DOMContentLoaded', evaluateAllPostscriptPreviews);

let postscriptResizeTimer;
window.addEventListener('resize', function () {
  clearTimeout(postscriptResizeTimer);
  postscriptResizeTimer = setTimeout(evaluateAllPostscriptPreviews, 150);
});
