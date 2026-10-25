import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { discoveryPlan, automationProblems, autoAccept, hasAutomaticApproval } from './automation.mjs';
import { publishLiveBatch, livePhoto } from './live-publish.mjs';
import { parseTsv, ocrFlags } from './screen.mjs';
const bytes = Buffer.from('test fixture; actual decoding is exercised by image policy tests');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const candidate = {
  id: 'commons-123', adapter: 'commons', title: 'Street photograph, 1967', description: 'A street scene in India.',
  captureDate: '1967', expectedYear: 1967, year: 1967, sourceWidth: 1600, sourceHeight: 1000,
  width: 1600, height: 1000, imageUrl: 'https://upload.wikimedia.org/photo.jpg',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:photo.jpg', sourceName: 'Wikimedia Commons',
  creator: 'Photographer', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  rawEvidence: {date: {value: '1967'}}, dateEvidence: 'DateTimeOriginal: 1967', yearConfidence: 'verified',
  categories: ['Street photography'], category: 'Street life', region: 'India', difficulty: 'medium', quality: 0.9,
  status: 'review', reasons: ['visual-review-required', 'ocr-unavailable'], sha256, perceptualHash: 'abcdef0123456789',
  derivatives: {main: `${sha256}.webp`, mobile: `${sha256}-800.webp`, thumb: `${sha256}-320.webp`},
  modifications: 'Resized and converted to WebP.', fact: 'A street scene in India.',
};
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'time-traveler-auto-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, '.photo-library/assets'), {recursive: true});
  for (const file of Object.values(candidate.derivatives)) await writeFile(join(root, '.photo-library/assets', file), bytes);
  return root;
}
const clean = async () => ({engine: 'test-ocr', ocr: [], flags: []});
test('discovery covers every year and prioritizes sparse years with rotating topics and places', () => {
  const plan = discoveryPlan([{year: 1975}, {year: 1975}]);
  assert.equal(plan.length, 121);
  assert.equal(new Set(plan.map(p => p.year)).size, 121);
  assert.equal(plan.at(-1).year, 1975);
  for (const p of plan) assert.ok(p.search.includes(`intitle:${p.year}`));
  assert.notDeepEqual(plan, discoveryPlan([], 1));
  assert.ok(discoveryPlan([], 1).some(p => p.search.includes('India')));
});
test('automatic approval requires original capture evidence, compatible rights, trusted photos and no exceptions', () => {
  assert.deepEqual(automationProblems(candidate), []);
  for (const patch of [
    {captureDate: 'circa 1967'}, {rawEvidence: {date: {value: '2000'}}}, {year: 1968},
    {license: 'CC BY-NC 4.0'}, {status: 'rejected'}, {status: 'approved'}, {restrictions: 'Restricted'},
    {imageUrl: 'https://untrusted.example/photo.jpg'}, {sourceUrl: 'https://evil.example/photo'},
    {description: 'AI-generated photograph'}, {categories: [], title: 'Street, 1967'},
    {reasons: ['duplicate-candidate']}, {derivatives: {...candidate.derivatives, main: '../evil.webp'}},
  ]) assert.ok(automationProblems({...candidate, ...patch}).length, JSON.stringify(patch));
});
test('acceptance records a separate automatic audit and fails closed on OCR errors, date clues and changed pixels', async t => {
  const root = await fixture(t);
  const accepted = await autoAccept(candidate, clean, {root});
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.record.status, 'live');
  assert.equal(accepted.record.review, undefined);
  assert.equal(hasAutomaticApproval(accepted.record), true);
  assert.equal(hasAutomaticApproval({...accepted.record, sha256: 'a'.repeat(64)}), false);
  for (const scan of [
    {engine: null, ocr: [], flags: ['ocr-unavailable']},
    {engine: 'test', ocr: [], flags: ['ocr-visible-year']},
    {engine: 'test', ocr: [], flags: ['ocr-watermark-or-copyright']},
    {engine: 'test', ocr: []}, null,
  ]) assert.equal((await autoAccept(candidate, async () => scan, {root})).accepted, false);
  assert.equal((await autoAccept(candidate, async () => {throw Error('offline');}, {root})).accepted, false);
  await writeFile(join(root, '.photo-library/assets', candidate.derivatives.main), 'changed pixels');
  assert.deepEqual((await autoAccept(candidate, clean, {root})).reasons, ['asset-checksum-mismatch']);
});
test('OCR parsing requires a processed page and detects historic years, watermarks and excessive text', () => {
  const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n';
  const page = '1\t1\t0\t0\t0\t0\t0\t0\t1000\t800\t-1\t\n';
  assert.deepEqual(parseTsv(header + page), []);
  const word = '5\t1\t1\t1\t1\t1\t0\t0\t80\t20\t90\t1967\n';
  assert.deepEqual(ocrFlags(parseTsv(header + page + word)), ['ocr-visible-year']);
  assert.throws(() => parseTsv(''), /Invalid/);
  assert.throws(() => parseTsv(header), /process/);
  assert.ok(ocrFlags([{text: '1899 © Getty', area: 0.2}]).length === 3);
});
test('publication verifies uploads before making the index visible, keeps attribution and stores an immutable release', async t => {
  const root = await fixture(t);
  const {record} = await autoAccept(candidate, clean, {root});
  let uploads = 0;
  const result = await publishLiveBatch([record], [record], {root, upload: async ({tag, files, notes}) => {
    uploads++;
    assert.match(tag, /^photo-live-[a-f0-9]{16}$/);
    assert.equal(files.length, 3);
    assert.ok(notes.includes(candidate.sourceUrl) && notes.includes(candidate.licenseUrl));
    await assert.rejects(access(join(root, 'public/library/live/manifest.json')));
  }});
  assert.equal(result.added, 1);
  const manifest = JSON.parse(await readFile(join(root, 'public/library/live/manifest.json')));
  assert.equal(manifest.total, 1);
  const chunk = JSON.parse(await readFile(join(root, 'public', manifest.entries[0][6])));
  assert.equal(chunk[0].year, 1967);
  assert.match(chunk[0].src, /^https:\/\/github.com\/khushalx\/time-traveler\/releases\/download\/photo-live-/);
  assert.equal(chunk[0].licenseUrl, candidate.licenseUrl);
  const saved = JSON.parse(await readFile(join(root, 'data/photo-library/records.json')));
  assert.equal(livePhoto(saved[0]).src, chunk[0].src);
  assert.deepEqual(await publishLiveBatch(saved, [], {root, upload: () => {throw Error('must not upload');}}), {added: 0});
  assert.equal(uploads, 1);
});
test('failed uploads leave the last published catalog and audit untouched', async t => {
  const root = await fixture(t);
  const {record} = await autoAccept(candidate, clean, {root});
  await assert.rejects(publishLiveBatch([record], [record], {root, upload: async () => {throw Error('upload failed');}}), /upload failed/);
  await assert.rejects(access(join(root, 'public/library/live/manifest.json')));
  await assert.rejects(access(join(root, 'data/photo-library/records.json')));
});
test('the committed live index matches its complete audited records and immutable chunks', async () => {
  const manifest = JSON.parse(await readFile('public/library/live/manifest.json'));
  const records = JSON.parse(await readFile('data/photo-library/records.json'));
  const live = records.filter(p => p.status === 'live');
  assert.equal(manifest.total, live.length);
  assert.equal(manifest.entries.length, live.length);
  assert.equal(new Set(manifest.entries.map(p => p[0])).size, live.length);
  const chunks = new Map();
  for (const row of manifest.entries) {
    const record = live.find(p => p.id === row[0]);
    assert.ok(hasAutomaticApproval(record), row[0]);
    assert.match(row[6], /^\/library\/live\/releases\/[a-f0-9]{16}\/\d+\.json$/);
    if (!chunks.has(row[6])) chunks.set(row[6], JSON.parse(await readFile(join('public', row[6]))));
    const photo = chunks.get(row[6]).find(p => p.id === row[0]);
    assert.deepEqual(photo, livePhoto(record));
    assert.equal(photo.year, row[1]);
  }
});
