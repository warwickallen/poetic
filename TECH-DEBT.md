# Tech debt

Deferred work and known gaps in the Poetic framework. Record an entry here
whenever you defer something, rather than leaving it only in a commit message or
in chat. Keep entries short and dated; remove one when it is resolved.

Format: a dated `## <short title>` describing what, why it matters, where, and a
suggested fix.

## 2026-07-07 — `serve-static.js`'s live `/all-poems` route has no footer

`src/tools/serve-static.js` reimplements `all-poems.html` generation in its own
`concatenateAllHtmlFiles()` for the dev-server `/all-poems` endpoint, instead of
reusing `src/tools/build-all-poems.js`. That pre-existing duplicate already
diverges from the real build (no favicon/subtitle sync), and now also omits the
footer added by `src/tools/footer.js`. Low priority: the actual built
`all-poems.html` (served as a static file, and what GitHub Pages publishes)
does get the footer; only the special live in-memory route does not. Fix by
having the dev server reuse `build-all-poems.js`'s `concatenateAllHtmlFiles`
directly instead of its own copy.
