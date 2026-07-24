'use strict';

/**
 * Round-trip tests for yaml-to-poem.js: poem-data object -> .poem text ->
 * poem-data object, asserting the two objects match (TD26072109). Mirrors
 * test/browser-render.test.js's parity approach, but drives it from
 * hand-built poem-data objects (poem-parser.js's own output shape) rather
 * than a `.poem` corpus, so each shape yaml-to-poem.js must not drop --
 * object-form audio params, `segment.parts`, labels, directives, and
 * version/segment/postscript label params -- is exercised directly and in
 * combination.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { YamlToPoemConverter } = require('../src/tools/yaml-to-poem');
const { PoemParser } = require('../src/tools/poem-parser');

// Round-trip a poem-data object through YamlToPoemConverter -> PoemParser and
// return the reparsed object.
function roundTrip(data) {
  const text = new YamlToPoemConverter(data).convert();
  return new PoemParser(text).parse();
}

// Minimal valid poem-data, so each focused test below only needs to specify
// the field it's exercising.
function baseData(overrides = {}) {
  return {
    title: 'Round Trip Poem',
    author: 'Test Author',
    date: '1970-01-01',
    versions: [{ segments: [{ lines: 'a plain line\n' }] }],
    ...overrides,
  };
}

// ── The whole shape, combined (mirrors the corpus-wide parity check) ────────

test('a poem exercising every gap at once (audio object-form, segment.parts, label params, labels, directives) round-trips exactly', () => {
  const data = {
    title: 'Round Trip Poem',
    author: 'Test Author',
    date: '1970-01-01',
    versions: [
      {
        label: 'Version 1',
        params: { color: 'blue', icon: 'star' },
        segments: [
          {
            label: 'Plain Verse',
            params: { 'preview-lines': '8' },
            lines: 'a plain line\nanother plain line\n',
          },
          {
            label: 'Mixed Verse',
            parts: [
              { type: 'lines', lines: 'before the block\n' },
              { type: 'html', html: '<table>\n<tr><td>x</td></tr>\n</table>\n' },
              { type: 'lines', lines: 'after the block\n' },
              { type: 'html', html: '<button type="button">Press me</button>' },
            ],
          },
        ],
      },
      { segments: [{ lines: 'second version line\n' }] },
    ],
    audio: {
      audiomack: true,
      suno: 's/SongLink12345678',
      mega: {
        value: 'ExampleFileId1#ExampleDecryptionKey1234567890',
        media: 'video',
        ratio: '21:9',
        height: '400',
      },
      example: { value: 'raw-id', ratio: '16/9' },
    },
    postscript: [
      { label: 'Note One', params: { preview: 'false' }, content: '<p>Some text.</p>\n' },
      { $ref: '_shared.yaml#/disclaimer' },
    ],
    labels: ['reflection', 'nature'],
    directives: [
      { name: 'example.preamble', attributes: { key: 'value' } },
      { name: 'bare.directive' },
      { name: 'multi.directive', attributes: { a: '1', b: '2' } },
    ],
  };

  assert.deepStrictEqual(roundTrip(data), data);
});

// ── Audio object-form params ─────────────────────────────────────────────────

test('audio object-form params (media, ratio, height) round-trip', () => {
  const data = baseData({
    audio: {
      mega: { value: 'AbC1dEfG#h1Jk', media: 'video', ratio: '21:9', height: '400' },
    },
  });
  assert.deepStrictEqual(roundTrip(data).audio, data.audio);
});

test('audio object-form with only a ratio param round-trips', () => {
  const data = baseData({ audio: { mega: { value: 'id0#key0', ratio: '16/9' } } });
  assert.deepStrictEqual(roundTrip(data).audio, data.audio);
});

test('audio object-form on a bare (true) value round-trips', () => {
  const data = baseData({ audio: { audiomack: { value: true, media: 'video' } } });
  assert.deepStrictEqual(roundTrip(data).audio, data.audio);
});

test('audio object-form with no recognised param (bare "value" only) round-trips', () => {
  // Produced when the source line carried a trailing "(...)" whose contents
  // parseAudioParams() didn't recognise (see poem-to-yaml-audio.test.js's
  // "unknown parameter key" case) -- still an object, just with no
  // media/ratio/height key.
  const data = baseData({ audio: { mega: { value: 'id0#key0' } } });
  assert.deepStrictEqual(roundTrip(data).audio, data.audio);
});

test('plain bare and string-valued audio entries still round-trip alongside object-form ones', () => {
  const data = baseData({
    audio: { audiomack: true, suno: 's/SongLink12345678', mega: { value: 'id0#key0', media: 'audio' } },
  });
  assert.deepStrictEqual(roundTrip(data).audio, data.audio);
});

// ── segment.parts (mixed WYSIWYG runs + embedded blocks) ────────────────────

test('segment.parts alternating lines/html round-trips, including a part with no trailing newline', () => {
  const data = baseData({
    versions: [
      {
        segments: [
          {
            parts: [
              { type: 'lines', lines: 'before\n' },
              { type: 'html', html: '<table>\n<tr><td>1</td></tr>\n</table>\n' },
              { type: 'lines', lines: 'after\n' },
              { type: 'html', html: '<button type="button">Press</button>' },
            ],
          },
        ],
      },
    ],
  });
  assert.deepStrictEqual(roundTrip(data).versions, data.versions);
});

test('a segment.parts html block whose content is not a valid literal block errors clearly', () => {
  const data = baseData({
    versions: [{ segments: [{ parts: [{ type: 'html', html: '<<<\nnested\n>>>' }] }] }],
  });
  assert.throws(() => new YamlToPoemConverter(data).convert(), /block marker/);
});

test('an unrecognised segment.parts part type errors clearly rather than being silently dropped', () => {
  const data = baseData({
    versions: [{ segments: [{ parts: [{ type: 'weird', payload: 1 }] }] }],
  });
  assert.throws(() => new YamlToPoemConverter(data).convert(), /Unsupported segment part type/);
});

// ── Labels ────────────────────────────────────────────────────────────────

test('labels round-trip in order', () => {
  const data = baseData({ labels: ['reflection', 'nature', 'solitude'] });
  assert.deepStrictEqual(roundTrip(data).labels, data.labels);
});

test('a label containing a syntax-reserved character errors clearly rather than corrupting on reparse', () => {
  const data = baseData({ labels: ['has space'] });
  assert.throws(() => new YamlToPoemConverter(data).convert(), /Unsupported Metadata label/);
});

// ── Directives ────────────────────────────────────────────────────────────

test('directives round-trip in order, with and without attributes, duplicates allowed', () => {
  const data = baseData({
    directives: [
      { name: 'example.preamble', attributes: { key: 'value' } },
      { name: 'bare.directive' },
      { name: 'd', attributes: { k: '1' } },
      { name: 'd', attributes: { k: '2' } },
    ],
  });
  assert.deepStrictEqual(roundTrip(data).directives, data.directives);
});

test('a directive attribute value outside the unquoted character class errors clearly', () => {
  const data = baseData({ directives: [{ name: 'd', attributes: { key: 'has space' } }] });
  assert.throws(() => new YamlToPoemConverter(data).convert(), /Unsupported Metadata directive attribute value/);
});

// ── Version/segment/postscript label params ──────────────────────────────────

test('version, segment, and postscript label params round-trip, including values needing quoting', () => {
  const data = baseData({
    versions: [
      {
        label: 'Version 1',
        params: { color: 'blue' },
        segments: [{ label: 'Verse', params: { note: 'a "quoted" $value' }, lines: 'a line\n' }],
      },
    ],
    postscript: [{ label: 'Note', params: { preview: 'false' }, content: '<p>Text.</p>\n' }],
  });
  const reparsed = roundTrip(data);
  assert.deepStrictEqual(reparsed.versions, data.versions);
  assert.deepStrictEqual(reparsed.postscript, data.postscript);
});

// ── Absence: nothing is written when a poem has no Metadata content ─────────

test('no Metadata section is written when labels and directives are both absent', () => {
  const data = baseData();
  const text = new YamlToPoemConverter(data).convert();
  assert.ok(!/^[#%]/m.test(text), 'expected no label/directive lines in the output');
  const reparsed = roundTrip(data);
  assert.ok(!('labels' in reparsed));
  assert.ok(!('directives' in reparsed));
});
