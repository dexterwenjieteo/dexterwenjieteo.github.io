import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { getPublications } from '../src/lib/publications.mjs';
import { runtimeConfig } from './lib/scholar-sync.mjs';

const html = await readFile('dist/index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
assert.equal((html.match(/<h1\b/g) || []).length, 1, 'Exactly one h1 is required');
for (const id of ['main', 'about', 'research', 'publications', 'experience', 'education', 'awards', 'cv', 'contact', 'theme-toggle']) {
  assert(ids.includes(id), `Missing section/control: ${id}`);
}
for (const [, href] of html.matchAll(/\bhref="([^"]+)"/g)) {
  if (href.startsWith('#')) assert(ids.includes(href.slice(1)), `Broken anchor: ${href}`);
  else if (href.startsWith('/')) await access(path.join('dist', decodeURIComponent(href.slice(1)).split('?')[0]));
  else assert(/^(https:|mailto:)/.test(href), `Unexpected link protocol: ${href}`);
}
assert(html.includes('rel="canonical"'), 'Missing canonical URL');
assert(html.includes('application/ld+json'), 'Missing structured data');
assert(html.includes('og:description'), 'Missing Open Graph metadata');
const curated = JSON.parse(await readFile('src/data/publications-curated.json', 'utf8'));
const scholar = JSON.parse(await readFile('src/data/publications-scholar.json', 'utf8'));
const overrides = JSON.parse(await readFile('src/data/publications-overrides.json', 'utf8'));
assert.equal((html.match(/class="publication"/g) || []).length, getPublications(curated, scholar, overrides).length, 'Expected merged publications in the build');
assert(!/Ranked 4th|SERPAPI_KEY|\/admin|Refresh Publications/.test(html), 'Private/admin content must not enter the static page');
const publicPdf = await readFile('dist/cv/Dexter_Wen_Jie_Teo_CV.pdf');
try {
  const sourcePdf = await readFile('Dexter Wen Jie Teo CV.pdf');
  assert(!sourcePdf.equals(publicPdf), 'The public CV must be the reviewed derivative');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
assert(publicPdf.subarray(0, 5).toString() === '%PDF-', 'Invalid CV response');
for (const file of ['robots.txt', 'sitemap-index.xml', 'sitemap-0.xml', '.nojekyll']) await access(path.join('dist', file));
const { key } = await runtimeConfig(process.cwd());
async function inspectOutput(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assert(!['.env', 'admin', 'scripts', '.local'].includes(entry.name), `Private file in build: ${file}`);
    if (entry.isDirectory()) await inspectOutput(file);
    else if (/\.(html|js|json|css|xml|txt)$/.test(file)) {
      const text = await readFile(file, 'utf8');
      assert(!text.includes('publication-admin-token') && !text.includes('/api/refresh'), `Administration code entered build: ${file}`);
      assert(!key || !text.includes(key), `Credential material entered build: ${file}`);
    }
  }
}
await inspectOutput('dist');

// Real theme-token pairs must meet AA's ordinary-text threshold.
const css = await readFile('src/styles/global.css', 'utf8');
const blocks = [css.match(/:root \{([\s\S]*?)\}/)?.[1], css.match(/:root\[data-theme='dark'\] \{([\s\S]*?)\}/)?.[1]];
function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
for (const [index, block] of blocks.entries()) {
  const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map(match => [match[1], match[2]]));
  for (const [fg, bg] of [['text', 'bg'], ['muted', 'bg'], ['accent', 'bg'], ['accent', 'soft-accent'], ['muted', 'soft-accent'], ['review-text', 'review-bg'], ['button-text', 'accent']]) {
    const a = luminance(tokens[fg]), b = luminance(tokens[bg]);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    assert(ratio >= 4.5, `${index ? 'Dark' : 'Light'} ${fg}/${bg} contrast ${ratio.toFixed(2)} is below AA`);
  }
}
console.log('PASS: built page structure, local links, publication labels, CV derivative, SEO files, and light/dark text contrast.');
console.log('Browser layout, keyboard interactions, theme persistence, and external links require separate browser review.');
