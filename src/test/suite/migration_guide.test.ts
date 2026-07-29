import { suite, test, suiteSetup, suiteTeardown } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	downloadMigrationGuideHtml,
	renderMigrationGuideMarkdown,
	renderMigrationGuideMarkdownFromHtml,
} from '../../migrationGuide';

// Device pairs covering the branches in the url builder. F28P65x -> F29H85x is
// the only one that crosses to the C29 SDK, which swaps both the version in the
// filename and the base url.
const PAIRS: [string, string][] = [
	['F28004x', 'F28003x'],
	['F28P65x', 'F28P55x'],
	['F2837xD', 'F28P65x'],
	['F28P65x', 'F29H85x'],
	['F28002x', 'F28P55x'],
	['F28E12x', 'F28P65x'],
];

// The smallest guide in the set, used for the rendering tests.
const RENDER_PAIR: [string, string] = ['F28004x', 'F28003x'];

// Guides measured 3.1 MB to 19.2 MB. The floor only needs to reject a stub or
// an error page served with a 200.
const MIN_BYTES = 100 * 1024;

const DOWNLOAD_TIMEOUT_MS = 180000;

const TITLE = /<title>Analysis of .+ vs .+<\/title>/;
const SECTION = /<h2 class="body-heading" id="([^"]+)"/;

function tempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'c2000-idea-guides-'));
}

suite('migration guide download', () => {
	let dir: string;

	suiteSetup(() => { dir = tempDir(); });
	suiteTeardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

	for (const [source, target] of PAIRS) {
		test(`${source} to ${target}`, async function () {
			this.timeout(DOWNLOAD_TIMEOUT_MS);
			const out = path.join(dir, `${source}_${target}.html`);

			const result = await downloadMigrationGuideHtml(source, target, out);

			assert.ok(result.success, `download failed: ${result.error}`);
			assert.strictEqual(result.filePath, out);
			assert.ok(fs.existsSync(out), `no file at ${out}`);
			assert.ok((result.fileSize ?? 0) >= MIN_BYTES,
				`${source}->${target}: ${result.fileSize} bytes, floor is ${MIN_BYTES}`);

			const html = fs.readFileSync(out, 'utf8');
			assert.ok(TITLE.test(html), `${source}->${target}: no "Analysis of X vs Y" title`);
			assert.ok(SECTION.test(html), `${source}->${target}: no body-heading sections`);

			// Deleted immediately: these run to 19 MB and there are six of them.
			fs.rmSync(out, { force: true });
		});
	}
});

suite('migration guide markdown', () => {
	let dir: string;
	let htmlPath: string;
	let html: string;
	let anchors: string[];

	suiteSetup(async function () {
		this.timeout(DOWNLOAD_TIMEOUT_MS);
		dir = tempDir();
		htmlPath = path.join(dir, 'render.html');

		const result = await downloadMigrationGuideHtml(RENDER_PAIR[0], RENDER_PAIR[1], htmlPath);
		assert.ok(result.success, `download failed: ${result.error}`);

		html = fs.readFileSync(htmlPath, 'utf8');
		anchors = [...html.matchAll(/<h2 class="body-heading" id="([^"]+)"/g)].map(m => m[1]);
		assert.ok(anchors.length > 0, 'downloaded guide has no sections');
	});

	suiteTeardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

	test('renders a section', () => {
		const md = renderMigrationGuideMarkdownFromHtml(html, anchors[0]);

		assert.ok(md.startsWith('##'), `expected a heading, got: ${md.slice(0, 60)}`);
		assert.ok(md.includes(anchors[0]), `section body does not mention ${anchors[0]}`);
		assert.ok(!md.includes('section not found'), 'known anchor reported as missing');
	});

	test('renders the same from a path as from a string', () => {
		assert.strictEqual(
			renderMigrationGuideMarkdown(htmlPath, anchors[0]),
			renderMigrationGuideMarkdownFromHtml(html, anchors[0]));
	});

	test('reports an unknown anchor rather than throwing', () => {
		const md = renderMigrationGuideMarkdownFromHtml(html, 'no_such_anchor_xyz');

		assert.ok(md.includes('section not found'), `expected a not-found marker, got: ${md.slice(0, 80)}`);
	});

	test('--all renders every section', function () {
		this.timeout(DOWNLOAD_TIMEOUT_MS);
		const md = renderMigrationGuideMarkdownFromHtml(html, '--all');

		assert.ok(md.startsWith('# Migration report'), `unexpected first line: ${md.split('\n')[0]}`);
		assert.ok(md.includes(`_${anchors.length} sections_`), `section count missing from header`);
		assert.ok(md.length > anchors.length * 20, 'output too short to contain every section');
	});
});

suite('migration guide validation', () => {
	const unused = path.join(os.tmpdir(), 'c2000-idea-unused-guide.html');

	test('rejects a pair with the same source and target', async () => {
		const result = await downloadMigrationGuideHtml('F28P65x', 'F28P65x', unused);

		assert.strictEqual(result.success, false);
		assert.ok(result.error?.includes('must be different'), `unexpected error: ${result.error}`);
		assert.ok(!fs.existsSync(unused), 'wrote a file for a rejected pair');
	});

	test('compares source and target case insensitively', async () => {
		const result = await downloadMigrationGuideHtml('F28P65x', 'f28p65x', unused);

		assert.strictEqual(result.success, false);
		assert.ok(!fs.existsSync(unused), 'wrote a file for a rejected pair');
	});
});
