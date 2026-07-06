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
