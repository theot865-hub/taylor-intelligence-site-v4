import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('public HTML never links or embeds the private Big O preview', () => {
  const paths = readdirSync(root, { recursive: true }).filter(path => path.endsWith('.html'));
  assert.ok(paths.length >= 10, 'Scan the whole static site, including retained routes');
  for (const path of paths) {
    assert.doesNotMatch(read(path), /taylorintelligence-test\.ca\/big-o(?:[/?"']|$)/, path);
    assert.doesNotMatch(read(path), /\/assets\/work\/big-o(?:-720)?\.webp/, path);
  }
});

test('private screenshot files stay recoverable but are excluded from deployed assets', () => {
  const excluded = new Set(read('.assetsignore').split(/\r?\n/).map(line => line.trim()));
  for (const path of ['assets/work/big-o.webp', 'assets/work/big-o-720.webp']) {
    assert.ok(readFileSync(new URL(path, root)).length > 1000, 'Keep the original capture');
    assert.ok(excluded.has(path), `Do not upload ${path}`);
  }
});

test('privacy correction preserves the current offer, client logo and other portfolio work', () => {
  const home = read('index.html');
  assert.match(home, /Operational AI\.<\/span> <span>Built for formulators\./);
  assert.match(home, /<section[^>]+id="websites"[^>]+hidden>/);
  assert.match(home, /src="\/ai-intensive\/logos\/big-o-tires\.png" alt="Big O Tires"/);
  assert.match(read('websites/index.html'), /name="robots" content="noindex, nofollow"/);
  for (const path of ['index.html', 'websites/index.html']) {
    for (const url of ['https://www.tirexcanada.com/', 'https://sdconcrete.com/', 'https://szolyd.com/', 'https://knot-normal.com/']) {
      assert.ok(read(path).includes(`href="${url}"`), `${path}: preserve ${url}`);
    }
  }
});
