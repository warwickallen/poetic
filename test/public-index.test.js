'use strict';

/**
 * Regression tests for the DOM-XSS fix in public/index.js's poem-card
 * rendering (commit 8e4d6ac, CodeQL code-scanning-alert-3/4): poem data read
 * from the page's JSON data island must never be handed to an HTML-parsing
 * sink (innerHTML) — it must only ever reach the DOM via createElement/
 * createTextNode/textContent/appendChild.
 *
 * public/index.js is a plain (non-module) browser script: it reads
 * `document`/`window` and has top-level side effects (it parses the poem
 * data island and calls `renderPoems()` immediately). It's run here with
 * `vm` in a sandbox carrying a minimal fake DOM (no jsdom dependency added)
 * that implements just enough of the Node/Element surface the script uses.
 * This runs the actual production source end-to-end rather than a
 * reimplementation of it — the file on disk is never modified. Top-level
 * function declarations (renderPoems, appendTitleHtml, ...) attach to the
 * sandbox's global object exactly as they would to `window` in a browser.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC_INDEX_PATH = path.join(__dirname, '..', 'public', 'index.js');
const SOURCE = fs.readFileSync(PUBLIC_INDEX_PATH, 'utf8');

function createFakeElement(tag, registry) {
  const el = {
    tagName: String(tag).toUpperCase(),
    childNodes: [],
    parentNode: null,
    dataset: {},
    _listeners: {},
    appendChild(child) {
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    },
    insertBefore(newNode, refNode) {
      const idx = this.childNodes.indexOf(refNode);
      this.childNodes.splice(idx < 0 ? 0 : idx, 0, newNode);
      newNode.parentNode = this;
      return newNode;
    },
    addEventListener(type, handler) {
      (this._listeners[type] = this._listeners[type] || []).push(handler);
    },
  };
  Object.defineProperty(el, 'id', {
    get() { return this._id; },
    set(v) { this._id = v; if (registry) registry[v] = this; },
  });
  Object.defineProperty(el, 'className', {
    get() { return this._className || ''; },
    set(v) { this._className = v; },
  });
  Object.defineProperty(el, 'href', {
    get() { return this._href; },
    set(v) { this._href = v; },
  });
  Object.defineProperty(el, 'innerHTML', {
    // Not parsed as markup — just recorded, and clears any DOM children, the
    // same observable effect innerHTML='' has in a real browser.
    get() { return this._innerHTML || ''; },
    set(v) { this._innerHTML = v; this.childNodes = []; },
  });
  Object.defineProperty(el, 'textContent', {
    get() {
      return this.childNodes.map((c) => c.textContent).join('');
    },
    // Real textContent assignment replaces all children with a single text
    // node (or removes them entirely for '') — mirror that so a plain
    // `el.textContent = str` still shows up to collect() as a text node.
    set(v) {
      this.childNodes = [];
      if (v !== '') {
        const textNode = createFakeTextNode(v);
        textNode.parentNode = this;
        this.childNodes.push(textNode);
      }
    },
  });
  return el;
}

function createFakeTextNode(data) {
  return { nodeType: 3, data, textContent: data, parentNode: null };
}

// Walks a fake-DOM subtree, collecting every text node's data and every
// descendant element's tagName (not the root's own tag) — used to assert
// hostile content never became a tag.
function collect(node, acc = { texts: [], tags: [] }) {
  (node.childNodes || []).forEach((child) => {
    if (child.nodeType === 3) {
      acc.texts.push(child.data);
    } else {
      acc.tags.push(child.tagName);
      collect(child, acc);
    }
  });
  return acc;
}

function loadPublicIndex(poems) {
  const registry = {};

  const poemDataEl = createFakeElement('script', registry);
  poemDataEl.id = 'poem-data';
  poemDataEl.textContent = JSON.stringify(poems);

  const gridEl = createFakeElement('div', registry);
  gridEl.id = 'poemGrid';
  const gridParent = createFakeElement('div', registry);
  gridParent.appendChild(gridEl);

  const fakeDocument = {
    getElementById(id) { return Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : null; },
    createElement(tag) { return createFakeElement(tag, registry); },
    createTextNode(data) { return createFakeTextNode(data); },
  };

  const sandbox = {
    document: fakeDocument,
    window: { location: {} },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: PUBLIC_INDEX_PATH });

  return { sandbox, gridEl };
}

test('appendTitleHtml renders a raw, un-escaped <script> string as inert text, never as an element', () => {
  const { sandbox } = loadPublicIndex([]);
  const parent = createFakeElement('a');

  // Defense in depth: even if upstream escaping were bypassed, appendTitleHtml
  // itself must never turn arbitrary tag names into real elements — it only
  // ever creates em/strong/s from its own fixed regex.
  sandbox.appendTitleHtml(parent, '<script>alert(1)</script>');

  const { texts, tags } = collect(parent);
  assert.deepStrictEqual(tags, []);
  assert.ok(
    texts.join('').includes('<script>alert(1)</script>'),
    'hostile string must still be present, but only as inert text'
  );
});

test('appendTitleHtml decodes escape-first titleHtml back to literal text, not markup', () => {
  const { sandbox } = loadPublicIndex([]);
  const parent = createFakeElement('a');

  // What render-core.js's renderTitleMarkup actually produces for a raw
  // title of "<script>alert(1)</script>": HTML-escaped first, so this is the
  // realistic shape appendTitleHtml receives in production.
  sandbox.appendTitleHtml(parent, '&lt;script&gt;alert(1)&lt;/script&gt;');

  const { texts, tags } = collect(parent);
  assert.deepStrictEqual(tags, []);
  assert.strictEqual(texts.join(''), '<script>alert(1)</script>');
});

test('appendTitleHtml still creates real em/strong/s elements for legitimate markup', () => {
  const { sandbox } = loadPublicIndex([]);
  const parent = createFakeElement('a');

  sandbox.appendTitleHtml(parent, 'A <em>Title</em> with <strong>emphasis</strong>');

  const { texts, tags } = collect(parent);
  assert.deepStrictEqual(tags, ['EM', 'STRONG']);
  assert.strictEqual(texts.join(''), 'A Title with emphasis');
});

test('renderPoems renders a hostile poem title as inert text with no injected tag', () => {
  const hostilePoem = {
    file: 'hostile-poem',
    title: '<script>alert(1)</script>',
    titleHtml: '&lt;script&gt;alert(1)&lt;/script&gt;',
    date: '2026-01-01',
    hasAudio: false,
    labels: ['<img src=x onerror=alert(1)>'],
  };

  const { gridEl } = loadPublicIndex([hostilePoem]);

  const { texts, tags } = collect(gridEl);
  const SAFE_TAGS = new Set(['DIV', 'A', 'SPAN', 'P']);
  tags.forEach((tag) => {
    assert.ok(SAFE_TAGS.has(tag), `unexpected element created: ${tag}`);
  });
  assert.ok(!tags.includes('SCRIPT'));
  assert.ok(!tags.includes('IMG'));

  const allText = texts.join('');
  assert.ok(
    allText.includes('<script>alert(1)</script>'),
    'hostile title must appear, but only as inert text'
  );
  assert.ok(
    allText.includes('<img src=x onerror=alert(1)>'),
    'hostile label must appear, but only as inert text'
  );
});
