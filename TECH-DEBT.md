# Tech debt

Deferred work and known gaps in the Poetic framework. Record an entry here
whenever you defer something, rather than leaving it only in a commit message or
in chat. Keep entries short and dated; remove one when it is resolved.

Format: a dated `## <short title>` describing what, why it matters, where, and a
suggested fix.

## 2026-07-08 — `npm test` is not run in CI

`.github/workflows/build-poems.yml` runs `npm run check`, `npm run build`,
and `npm run check:build`, but never `npm test`. All tests under `test/`
(including `test/vim-syntax.test.js`) only run locally/on request — a
regression can land on `main` without any test failing in CI. Fix: add an
`npm test` step to `build-poems.yml`; if `test/vim-syntax.test.js` should
actually run there rather than skip, also install `vim` on the runner (e.g.
`apt-get install -y vim`) rather than relying on it being preinstalled on the
`ubuntu-latest` image.

## 2026-07-08 — `poem.vim` title/end-marker highlighting quirks

Discovered while building `test/vim-syntax.test.js`'s golden fixture from
`src/poems/poem/_example.poem`:

- `poemTitle` is defined as `\%1l.*$` (`editors/vim/syntax/poem.vim:134`) —
  "whatever is on line 1" — so a poem with a preamble comment block or
  variable definitions (both supported `.poem` features) gets its title
  highlighting on the wrong line.
- The final `====` line in the analysis section is highlighted as one
  `poemEndMarkerMark` span including its trailing `# comment`, while every
  other `====  # comment` line splits into separate `poemEndMarkerMark` /
  `poemEndMarkerLineTrailing` spans.

Both are editor-cosmetic only (no effect on build output). Not fixed here —
out of scope for the test task that surfaced them.
