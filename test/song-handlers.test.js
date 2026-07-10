'use strict';

/**
 * Unit tests for the song-handler resolver: player-size precedence, aspect-ratio
 * normalisation/validation, and the deep-merge semantics of loadSongHandlers.
 * See src/tools/song-handlers.js.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { resolveSongs, loadSongHandlers } = require('../src/tools/song-handlers');

const CTX = { title: 'T', slug: 's' };

// A self-contained handler registry so these tests do not depend on the builtin
// YAML (though they exercise the same code paths the builtins use).
const HANDLERS = {
  mega: {
    embed_url: 'https://mega.nz/embed/{value}',
    button_label: 'Load MEGA',
    default_media: 'audio',
    media_sizes: {
      audio: { height: '232px' },
      video: { aspect_ratio: '16 / 9' },
    },
  },
  fixed: {
    embed_url: 'https://x/{value}',
    embed_height: '300px',
  },
  ratioed: {
    embed_url: 'https://x/{value}',
    embed_aspect_ratio: '4 / 3',
  },
  plain: {
    embed_url: 'https://x/{value}',
  },
};

// Resolve a single audio entry against HANDLERS and return its embed model.
function embed(service, value) {
  const songs = resolveSongs({ [service]: value }, { ctx: CTX, handlers: HANDLERS });
  return songs[0] && songs[0].embed;
}

function captureWarnings(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = original;
  }
}

// ── media-type size profiles ────────────────────────────────────────────────

test('media_sizes: default_media selects the audio height profile', () => {
  const e = embed('mega', 'ID#KEY');
  assert.strictEqual(e.media, 'audio');
  assert.strictEqual(e.sizeVar, '--song-embed-height');
  assert.strictEqual(e.sizeValue, '232px');
  assert.strictEqual(e.sizeIsAspect, false);
});

test('media_sizes: an explicit video token selects the aspect-ratio profile', () => {
  const e = embed('mega', { value: 'ID#KEY', media: 'video' });
  assert.strictEqual(e.media, 'video');
  assert.strictEqual(e.sizeVar, '--song-embed-aspect-ratio');
  assert.strictEqual(e.sizeValue, '16 / 9');
  assert.strictEqual(e.sizeIsAspect, true);
});

// ── precedence ──────────────────────────────────────────────────────────────

test('precedence: per-song ratio= wins over the media-type size, media still recorded', () => {
  const e = embed('mega', { value: 'ID#KEY', media: 'video', ratio: '21:9' });
  assert.strictEqual(e.sizeVar, '--song-embed-aspect-ratio');
  assert.strictEqual(e.sizeValue, '21 / 9');
  assert.strictEqual(e.media, 'video', 'media type is recorded even when ratio overrides the size');
});

test('precedence: per-song height= wins over the media-type size', () => {
  const e = embed('mega', { value: 'ID#KEY', media: 'video', height: '480' });
  assert.strictEqual(e.sizeVar, '--song-embed-height');
  assert.strictEqual(e.sizeValue, '480px');
  assert.strictEqual(e.media, 'video');
});

test('precedence: handler base embed_height applies when there is no media profile', () => {
  const e = embed('fixed', 'X');
  assert.strictEqual(e.sizeVar, '--song-embed-height');
  assert.strictEqual(e.sizeValue, '300px');
  assert.strictEqual(e.media, undefined);
});

test('precedence: handler base embed_aspect_ratio applies (normalised)', () => {
  const e = embed('ratioed', 'X');
  assert.strictEqual(e.sizeVar, '--song-embed-aspect-ratio');
  assert.strictEqual(e.sizeValue, '4 / 3');
  assert.strictEqual(e.sizeIsAspect, true);
});

test('precedence: no size anywhere → CSS fallback (no size emitted)', () => {
  const e = embed('plain', 'X');
  assert.strictEqual(e.sizeVar, undefined);
  assert.strictEqual(e.sizeValue, undefined);
});

// ── ratio / height normalisation & validation ───────────────────────────────

test('ratio normalisation: "16/9" and "16:9" both become "16 / 9"', () => {
  assert.strictEqual(embed('mega', { value: 'X', ratio: '16/9' }).sizeValue, '16 / 9');
  assert.strictEqual(embed('mega', { value: 'X', ratio: '16:9' }).sizeValue, '16 / 9');
});

test('height normalisation: a bare number becomes px, a CSS length passes through', () => {
  assert.strictEqual(embed('mega', { value: 'X', height: '360' }).sizeValue, '360px');
  assert.strictEqual(embed('mega', { value: 'X', height: '30vh' }).sizeValue, '30vh');
});

test('validation: malformed ratio warns and falls back to the media-type default', () => {
  const { result, warnings } = captureWarnings(() =>
    embed('mega', { value: 'X', media: 'audio', ratio: 'nonsense' }));
  assert.strictEqual(result.sizeVar, '--song-embed-height');
  assert.strictEqual(result.sizeValue, '232px');
  assert.ok(warnings.some((w) => /malformed ratio/.test(w)));
});

test('validation: malformed height warns and falls back to the media-type default', () => {
  const { result, warnings } = captureWarnings(() =>
    embed('mega', { value: 'X', media: 'video', height: 'tall' }));
  assert.strictEqual(result.sizeVar, '--song-embed-aspect-ratio');
  assert.strictEqual(result.sizeValue, '16 / 9');
  assert.ok(warnings.some((w) => /malformed height/.test(w)));
});

// ── loadSongHandlers deep-merge ──────────────────────────────────────────────

test('deep-merge: a consumer override merges a nested media_sizes profile key-by-key', () => {
  const handlers = loadSongHandlers({
    song_handlers: {
      mega: { media_sizes: { audio: { aspect_ratio: '4 / 3' } } },
    },
  });
  // Overridden audio ratio…
  assert.strictEqual(handlers.mega.media_sizes.audio.aspect_ratio, '4 / 3');
  // …while the untouched video profile and the embed_url survive.
  assert.deepStrictEqual(handlers.mega.media_sizes.video, { aspect_ratio: '16 / 9' });
  assert.strictEqual(handlers.mega.embed_url, 'https://mega.nz/embed/{value}');
});

test('deep-merge: a null value deletes a nested key', () => {
  const handlers = loadSongHandlers({
    song_handlers: {
      mega: { media_sizes: { video: null } },
    },
  });
  assert.strictEqual(handlers.mega.media_sizes.video, undefined);
  assert.ok(handlers.mega.media_sizes.audio, 'sibling profile is untouched');
});

test('deep-merge: a null handler deletes the whole builtin', () => {
  const handlers = loadSongHandlers({ song_handlers: { mega: null } });
  assert.strictEqual(handlers.mega, undefined);
  assert.ok(handlers.audiomack, 'other builtins are untouched');
});

test('deep-merge: overriding a builtin does not mutate it for the next load', () => {
  loadSongHandlers({ song_handlers: { mega: { media_sizes: { audio: { height: '999px' } } } } });
  const fresh = loadSongHandlers({});
  assert.strictEqual(fresh.mega.media_sizes.audio.aspect_ratio, '1 / 1');
  assert.strictEqual(fresh.mega.media_sizes.audio.height, undefined);
});

test('a consumer can add a brand-new handler alongside the builtins', () => {
  const handlers = loadSongHandlers({
    song_handlers: { youtube: { embed_url: 'https://youtube/{value}', button_label: 'Y' } },
  });
  assert.ok(handlers.youtube);
  assert.ok(handlers.mega, 'builtins remain');
});
