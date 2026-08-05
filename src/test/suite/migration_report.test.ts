import { suite, test, suiteSetup } from 'mocha';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as migration from '../../migration';
import * as project from '../../utilities/project';

// The agent report is a markdown string built by hand, and it states counts
// about itself. These check it against itself: the summary against the rendered
// issues, the issue index against its own denominator, and the code fences
// against each other.
//
// Both reports read the global diagnostics collection, so each is generated
// straight after the check that fills it. openAfter stays false -- the true
// path opens an untitled editor.

// F29H85x is one of the targets that loads resolutions_data_v1, so issues carry
// a fix and a compatible flag. Without that the suggested-fix blocks never
// render and the fence check only sees the static instructions.
const SOURCE = 'F28P65x';
const TARGET = 'F29H85x';
const URI_FIXTURE = 'f28p65x_sdfm_ex6_FIFO_freeze_claread.c';
const PROJECT_FIXTURE = 'f28p65x_sdfm_ex6_FIFO_freeze_claread';

// The driverlib tree the projectspec copies in, and the generated sources. The
// project report only needs enough findings to render.
const EXCLUDED_FOLDERS = ['device/driverlib', 'device', 'CPU1_RAM/syscfg'];

let workspaceRoot: string;

function summaryCount(md: string, metric: string): number {
	const row = md.match(new RegExp(`^\\| ${metric} \\| (\\d+) \\|`, 'm'));
	assert.ok(row, `no "${metric}" row in the summary table`);
	return Number(row[1]);
}

function issueHeadings(md: string): { index: number; total: number }[] {
	return [...md.matchAll(/^#### Issue (\d+) of (\d+)\b/gm)]
		.map(m => ({ index: Number(m[1]), total: Number(m[2]) }));
}

// Fences are indented under the suggested fix bullet, so the match allows
// leading whitespace. Openers carry a language, closers do not.
function fences(md: string): string[] {
	return md.split('\n').filter(line => /^\s*```/.test(line));
}

async function uriReport(): Promise<string> {
	const uri = vscode.Uri.file(path.join(workspaceRoot, 'migration_sources', URI_FIXTURE));
	await migration.migrationRunMigrationCheckOnUri(project.extensionContext, uri, SOURCE, [TARGET]);
	// Scoped to this file: the collection carries whatever an earlier suite left.
	return migration.exportMigrationAgentReport(false, uri);
}

async function projectReport(): Promise<string> {
	const info = project.allProjectInfos.find(p => p.name === PROJECT_FIXTURE);
	assert.ok(info, `project ${PROJECT_FIXTURE} was not detected`);
	project.setMigrationCheckFolderExceptions(EXCLUDED_FOLDERS, info);
	await migration.migrationRunMigrationCheckOnProject(
		project.extensionContext, PROJECT_FIXTURE, undefined, undefined, SOURCE, [TARGET]);
	return migration.exportProjectMigrationAgentReport(info, false, SOURCE, [TARGET]);
}

// Generated once each: every test reads the same string.
const reports = new Map<string, string>();

async function report(kind: 'uri' | 'project'): Promise<string> {
	if (!reports.has(kind)) {
		const md = kind === 'uri' ? await uriReport() : await projectReport();
		assert.ok(md.length > 0, `${kind} report came back empty -- the check found nothing`);
		reports.set(kind, md);
	}
	return reports.get(kind)!;
}

const KINDS: ('uri' | 'project')[] = ['uri', 'project'];

suite('migration agent report', () => {
	suiteSetup(async () => {
		const folders = vscode.workspace.workspaceFolders;
		assert.ok(folders && folders.length > 0, 'no workspace folder -- runTest must pass one via launchArgs');
		workspaceRoot = folders[0].uri.fsPath;
		await project.getProjects(project.extensionContext);
	});

	for (const kind of KINDS) {
		test(`${kind}: the summary totals match the rendered issues`, async function () {
			if (!fs.existsSync(path.join(workspaceRoot, PROJECT_FIXTURE))) { this.skip(); }

			const md = await report(kind);
			const rendered = issueHeadings(md).length;
			const total = summaryCount(md, 'Total issues');
			const auto = summaryCount(md, 'Auto-fixable ✓');
			const manual = summaryCount(md, 'Needs manual review ⚠');

			console.log(`REPORT ${kind} rendered=${rendered} total=${total} auto=${auto} manual=${manual}`);

			assert.strictEqual(total, rendered,
				`summary claims ${total} issues, ${rendered} are rendered`);
			assert.strictEqual(auto + manual, total,
				`auto-fixable ${auto} plus manual ${manual} does not equal ${total}`);

			// The project report also prints the pre-pass count above the table.
			const preRender = md.match(/^- \*\*Total Issues:\*\* (\d+)$/m);
			if (preRender) {
				assert.strictEqual(Number(preRender[1]), rendered,
					`the pre-pass count ${preRender[1]} does not match the ${rendered} rendered`);
			}
		});

		test(`${kind}: the issue index runs 1 to the stated total`, async function () {
			if (!fs.existsSync(path.join(workspaceRoot, PROJECT_FIXTURE))) { this.skip(); }

			const md = await report(kind);
			const headings = issueHeadings(md);
			assert.ok(headings.length > 0, 'no issue headings to check');

			const denominators = new Set(headings.map(h => h.total));
			assert.strictEqual(denominators.size, 1,
				`issue headings disagree on the total: ${[...denominators].join(', ')}`);
			assert.strictEqual([...denominators][0], headings.length,
				`headings say "of ${[...denominators][0]}" but ${headings.length} are rendered`);

			assert.deepStrictEqual(
				headings.map(h => h.index),
				headings.map((_h, i) => i + 1),
				'issue numbering is not a gapless run from 1');
		});

		test(`${kind}: every code fence is opened and closed`, async function () {
			if (!fs.existsSync(path.join(workspaceRoot, PROJECT_FIXTURE))) { this.skip(); }

			const md = await report(kind);
			const lines = fences(md);

			console.log(`REPORT ${kind} fence-lines=${lines.length}`);

			assert.ok(lines.length > 0, 'no fenced code blocks in the report');
			assert.strictEqual(lines.length % 2, 0, `${lines.length} fence markers, expected an even count`);

			let open = false;
			for (const line of lines) {
				const language = line.trim().slice(3);
				if (!open) {
					assert.ok(language.length > 0, `opening fence without a language: "${line.trim()}"`);
				} else {
					assert.strictEqual(language, '', `closing fence carries a language: "${line.trim()}"`);
				}
				open = !open;
			}
			assert.ok(!open, 'the report ends inside an open code fence');
		});
	}
});
