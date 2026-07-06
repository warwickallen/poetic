# Tech debt

Deferred work and known gaps in the Poetic framework. Record an entry here
whenever you defer something, rather than leaving it only in a commit message or
in chat. Keep entries short and dated; remove one when it is resolved.

Format: a dated `## <short title>` describing what, why it matters, where, and a
suggested fix.

## Raw converter does not implement the full variable spec

_Logged 2026-07-06._

`scripts/poem-to-raw.sh` re-implements variable handling in Perl, independently
of the canonical engine in `src/tools/poem-to-yaml.js`, and only covers a thin
subset — so the `raw/` plain-text output diverges from both the HTML pipeline and
`docs/POEM-SYNTAX.md`:

- multi-line variables (`={name}<<= … =>>`) are not stripped or expanded;
- `${name}` references are resolved inconsistently (a single, non-recursive
  pass; nested references are left literal);
- no support for `${name:-default}` fallbacks, `\${…}` escaping, or `%{…}`
  context variables.

**Suggested fix:** derive the raw text from the generated YAML (or drive it
through the shared engine) instead of re-parsing the `.poem` in Perl, so one
implementation backs both outputs. This is a framework change that would sync to
consumers.

## Framework self-tests are not hermetic — they read ambient consumer files

_Logged 2026-07-06._

Four tests pass in this repo but fail once synced into a consumer, because they
read on-disk state that a real consumer has but the framework's clean checkout
does not. They are not regressions — they are portability gaps in the tests. The
tests and golden fixtures are synced to consumers, but the ambient files they
depend on (`.shared.poem`, `.blogger-credentials.json`) are user-owned and are
not, so the tests can only pass where those files happen to match the framework.

- `test/golden.test.js` — `_minimal.poem` and `_params-example.poem` "matches the
  golden fixture": `convertPoemToYaml()` prepends the poem directory's
  `.shared.poem`, which differs per repo. Both fixtures omit their author line, so
  `author` defaults to `${author}` — "A Poet" here (baked into the golden YAML)
  but e.g. "Warwick Allen" in a consumer. Only the `author` line differs.
- `test/sync-blogger.test.js` — `resolveConfig: defaults when config is empty` and
  `resolveConfig: hasCredentials false when any var missing`: `resolveConfig()`
  falls back to reading `.blogger-credentials.json` from the CWD when an env var
  is absent. A consumer that syncs to Blogger has that file, so `hasCredentials`
  comes out `true` where the tests (which pass an empty/partial `env`) expect
  `false`.

**Suggested fix:** make these tests hermetic. For the golden tests, convert
fixtures from a temp directory with a controlled (or absent) `.shared.poem`, or
add an option to `convertPoemToYaml()` to skip the shared-prepend for fixtures.
For `resolveConfig`, take the credentials file path (or its contents) as an
argument so a real `.blogger-credentials.json` in the CWD cannot leak into the
test.
