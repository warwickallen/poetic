/**
 * Song-handler registry and resolver.
 *
 * Handlers describe how a music service named in a poem's `audio:` section
 * becomes markup. They are declarative — URL templates + labels only; styling
 * lives in poetic.css / custom.css. Builtins ship in ../song-handlers.yaml;
 * consumers add or override them under `song_handlers:` in .poetic-config.yaml.
 *
 * A handler may define:
 *   link_url  (+ link_label)   - a plain anchor
 *   embed_url (+ button_label) - a lazy-loaded iframe (built on click by poetic.js)
 * At least one of link_url / embed_url is required.
 *
 * Templates use {token} placeholders resolved server-side against:
 *   {value}                        - the text the author wrote after the service
 *                                    name (empty for a bare line, e.g. "Audiomack")
 *   {slug} {title} {author} {date} - poem context
 *   {<config-key>}                 - any scalar in .poetic-config.yaml, e.g.
 *                                    {audiomack_artist}
 * A fallback chain {a|b|c} resolves to the first token that is non-empty.
 *
 * Exports:
 *   loadSongHandlers(config)                 - merged builtin + user handler map
 *   resolveSongs(audio, { ctx, config, handlers })
 *                                            - ordered render model for a poem
 *   hasResolvableSongs(audio, config, handlers)
 *                                            - true if any entry has a handler
 *   substituteTemplate(template, scope)      - low-level {token} expansion
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BUILTIN_HANDLERS_PATH = path.join(__dirname, '..', 'song-handlers.yaml');

/** Read the framework's builtin handler definitions. */
function loadBuiltinHandlers() {
  try {
    const parsed = yaml.load(fs.readFileSync(BUILTIN_HANDLERS_PATH, 'utf8'));
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (err) {
    console.error(`Error reading builtin song handlers (${BUILTIN_HANDLERS_PATH}): ${err.message}`);
    return {};
  }
}

/**
 * Merge builtin handlers with a consumer's `song_handlers` config. Keys are
 * lower-cased; a user handler replaces a builtin of the same name.
 *
 * @param {object} [config] - parsed .poetic-config.yaml
 * @returns {Object<string, object>} handler map keyed by lower-case service name
 */
function loadSongHandlers(config = {}) {
  const handlers = {};
  const add = (source) => {
    if (!source || typeof source !== 'object') return;
    for (const [name, def] of Object.entries(source)) {
      if (def && typeof def === 'object') handlers[String(name).toLowerCase()] = def;
    }
  };
  add(loadBuiltinHandlers());
  add(config.song_handlers);
  return handlers;
}

/** Build the {token} scope: scalar config values + poem context + author value. */
function buildScope(value, ctx = {}, config = {}) {
  const scope = {};
  for (const [k, v] of Object.entries(config)) {
    if (v == null) continue;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') scope[k] = String(v);
  }
  for (const name of ['slug', 'title', 'author', 'date']) {
    if (ctx[name] != null) scope[name] = String(ctx[name]);
  }
  scope.value = (typeof value === 'string') ? value : '';
  return scope;
}

/**
 * Expand {token} and {a|b|c} placeholders in a template string. A single token
 * resolves to its scope value (or '' when unknown/empty); a pipe chain resolves
 * to the first non-empty candidate.
 */
function substituteTemplate(template, scope) {
  return String(template).replace(/\{([^}]+)\}/g, (_match, inner) => {
    const names = inner.split('|').map((s) => s.trim());
    for (const name of names) {
      const v = scope[name];
      if (v != null && v !== '') return v;
    }
    return '';
  });
}

/** True when a raw audio entry has a value worth rendering. */
function hasValue(value) {
  return value === true || (typeof value === 'string' && value.trim() !== '');
}

/**
 * Resolve a poem's `audio` object into an ordered render model:
 *   [{ service, embed?: { src, buttonLabel, title }, link?: { href, label } }]
 * Preserves author order. Unknown services and handlers that produce no output
 * are warned about and skipped.
 *
 * @param {object} audio - the poem's `audio` map ({ service: value|true })
 * @param {{ ctx?: object, config?: object, handlers?: object }} [opts]
 * @returns {Array<object>}
 */
function resolveSongs(audio, opts = {}) {
  if (!audio || typeof audio !== 'object') return [];
  const { ctx = {}, config = {} } = opts;
  const registry = opts.handlers || loadSongHandlers(config);
  const songs = [];
  for (const [rawName, value] of Object.entries(audio)) {
    const service = String(rawName).toLowerCase();
    const handler = registry[service];
    if (!handler) {
      console.warn(
        `Warning: no song handler defined for "${rawName}" — skipping. ` +
        `Add it under song_handlers: in .poetic-config.yaml.`
      );
      continue;
    }
    const scope = buildScope(value, ctx, config);
    const song = { service };
    if (handler.embed_url) {
      song.embed = {
        src: substituteTemplate(handler.embed_url, scope),
        buttonLabel: handler.button_label || `Load ${service} player`,
        title: ctx.title != null ? String(ctx.title) : '',
      };
    }
    if (handler.link_url) {
      song.link = {
        href: substituteTemplate(handler.link_url, scope),
        label: handler.link_label || service,
      };
    }
    if (!song.embed && !song.link) {
      console.warn(
        `Warning: song handler "${service}" defines neither embed_url nor link_url — skipping.`
      );
      continue;
    }
    songs.push(song);
  }
  return songs;
}

/**
 * True if `audio` has at least one entry with a defined handler and a value.
 * Used to flag poems on the all-poems index without building full markup.
 */
function hasResolvableSongs(audio, config = {}, handlers) {
  if (!audio || typeof audio !== 'object') return false;
  const registry = handlers || loadSongHandlers(config);
  return Object.entries(audio).some(([name, value]) => {
    const h = registry[String(name).toLowerCase()];
    return !!h && hasValue(value) && !!(h.embed_url || h.link_url);
  });
}

module.exports = {
  loadSongHandlers,
  resolveSongs,
  hasResolvableSongs,
  substituteTemplate,
};
