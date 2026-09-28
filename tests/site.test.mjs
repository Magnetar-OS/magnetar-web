/**
 * Checks the built page (dist/index.html) against the facts it must state
 * correctly: how to install Magnetar, and where its links lead. Run with
 * `pnpm test`, which builds first.
 */
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { apps, measured } from '../src/data/suite.ts';

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

test('the repository is added above [cachyos], not appended below the repos that would shadow it', () => {
  assert.ok(!/Append this to \/etc\/pacman\.conf/.test(html), 'tells the reader to append [magnetar] to the end');
  assert.ok(/above the \[cachyos\] section/.test(decode(html)), 'does not say where [magnetar] goes');
});

test('no link points at the package host root, which serves a 404', () => {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => decode(m[1]));
  assert.ok(!hrefs.some((h) => /^https:\/\/repo\.magnetaros\.com\/?$/.test(h)), 'links to https://repo.magnetaros.com');
  assert.ok(hrefs.includes('https://github.com/Magnetar-OS/arch-repo'), 'no link to the arch-repo instructions');
});

test('three.js loads in its own chunk, not in the script the page loads up front', () => {
  const entries = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(entries.length > 0, 'no module script on the page');
  for (const src of entries) {
    const file = new URL(`../dist${src}`, import.meta.url);
    const size = statSync(file).size;
    assert.ok(size < 100 * 1024, `${src} is ${size} bytes, so three.js is bundled into it`);
    assert.match(readFileSync(file, 'utf8'), /import\(/, `${src} does not load the field on demand`);
  }
});

test('crawlers find robots.txt, a sitemap listing the page, and og:url', () => {
  const dist = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
  assert.match(dist('robots.txt'), /^Sitemap: https:\/\/magnetaros\.com\/sitemap-index\.xml$/m);
  assert.match(dist('sitemap-index.xml'), /<loc>https:\/\/magnetaros\.com\/sitemap-0\.xml<\/loc>/);
  assert.match(dist('sitemap-0.xml'), /<loc>https:\/\/magnetaros\.com\/<\/loc>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/magnetaros\.com\/"/);
});

test('the measured figures are the ones recorded with scripts/measure-suite.sh', () => {
  const text = decode(html.replace(/<[^>]+>/g, ''));
  assert.ok(text.includes(`${measured.tests.toLocaleString('en')} tests`), 'the test count is not the recorded one');
  assert.ok(!text.includes('2,268 tests'), 'still shows the unreproducible 2,268');
  assert.ok(text.includes(`Measured in ${measured.date}`));
});

test('the licence line names the apps that are GPL-3.0-or-later rather than -only', () => {
  const text = decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ');
  assert.ok(text.includes('(Locket and Peek GPL‑3.0 or later)'), 'the footer implies every app is GPL-3.0-only');
});
