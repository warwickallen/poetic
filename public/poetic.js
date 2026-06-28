// Shared Audiomack lazy-loader — framework-owned, do not hand-edit.
// A single delegated click handler that works for any number of poems on any page.
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.load-audiomack-btn');
  if (!btn) return;
  const { slug, title, artist } = btn.dataset;
  const player = document.getElementById('audiomack-player--' + slug);
  if (!player) return;
  btn.style.display = 'none';
  const iframe = document.createElement('iframe');
  iframe.src = 'https://audiomack.com/embed/' + artist + '/song/' + slug;
  iframe.scrolling = 'no'; iframe.width = '100%'; iframe.height = '252';
  iframe.frameBorder = '0'; iframe.title = title || '';
  player.style.display = 'block'; player.appendChild(iframe);
});
