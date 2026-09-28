/**
 * Checks the built page (dist/index.html) against the facts it must state
 * correctly: how to install Magnetar, and where its links lead. Run with
 * `pnpm test`, which builds first.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { apps } from '../src/data/suite.ts';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** The text of every install step's code block, in order. */
const codeBlocks = [...html.matchAll(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g)].map((m) => decode(m[1]));

test('the install steps install every app, since magnetar-desktop only optdepends on them', () => {
  const commands = codeBlocks.join('\n').split('\n').filter((line) => /^sudo pacman -S\s/.test(line));
  const installed = new Set(commands.flatMap((line) => line.replace(/^sudo pacman -S\s+/, '').split(/\s+/)));
  for (const app of apps) {
    assert.ok(installed.has(app.package), `no pacman -S installs ${app.name} (${app.package})`);
  }
  assert.ok(installed.has('magnetar-peek'), 'Peek is published as magnetar-peek');
  assert.ok(!/brings in[^<]*the apps/.test(html), 'the page still claims the meta package brings in the apps');
});
