'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { REPO_ROOT } = require('../src/tools/repo-root');

const FIXTURE = path.join(REPO_ROOT, 'src', 'poems', 'poem', '_example.poem');
const DUMP_SCRIPT = path.join(__dirname, 'fixtures', 'dump-syntax.vim');
const GOLDEN_PATH = path.join(__dirname, 'golden', '_example.vim-syntax.txt');
const VIM_SYNTAX_DIR = path.join(REPO_ROOT, 'editors', 'vim');

function vimSkipReason() {
  let versionOutput;
  try {
    versionOutput = execFileSync('vim', ['--version'], { encoding: 'utf8' });
  } catch {
    return 'vim is not installed';
  }
  if (!versionOutput.includes('+syntax')) {
    return 'vim is built without +syntax support';
  }
  return undefined;
}

function dumpSyntax() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poem-vim-syntax-'));
  const outPath = path.join(tmpDir, 'dump.txt');
  try {
    execFileSync(
      'vim',
      [
        '-Es', '-u', 'NONE', '-N', '-i', 'NONE', '-n',
        '-c', 'let &runtimepath = $POEM_VIM_DIR . "," . &runtimepath',
        '-c', 'syntax enable',
        '-c', 'set filetype=poem',
        '-S', DUMP_SCRIPT,
        '-c', 'qa!',
        FIXTURE,
      ],
      { env: { ...process.env, POEM_VIM_DIR: VIM_SYNTAX_DIR, DUMP_OUT: outPath } }
    );
    return fs.readFileSync(outPath, 'utf8');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test(
  '_example.poem syntax highlighting matches the golden fixture',
  { skip: vimSkipReason() },
  () => {
    const actual = dumpSyntax();
    const golden = fs.readFileSync(GOLDEN_PATH, 'utf8');
    assert.strictEqual(
      actual,
      golden,
      'Output drifted from test/golden/_example.vim-syntax.txt. If intentional, regenerate it ' +
        '(from the repo root):\n' +
        '  DUMP_OUT=test/golden/_example.vim-syntax.txt POEM_VIM_DIR=editors/vim vim -Es -u NONE -N -i NONE -n ' +
        '-c \'let &runtimepath = $POEM_VIM_DIR . "," . &runtimepath\' -c \'syntax enable\' -c \'set filetype=poem\' ' +
        '-S test/fixtures/dump-syntax.vim -c \'qa!\' src/poems/poem/_example.poem'
    );
  }
);
