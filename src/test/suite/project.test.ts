import { suite, test, suiteSetup, setup } from 'mocha';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as project from '../../utilities/project';
import { IMPORT_FIXTURES, COPY_FIXTURES } from '../fixtures';

type FixtureReport = {
	ccsAvailable: boolean;
	imported: string[];
	built: string[];
	copied: string[];
	failures: { name: string; stage: string; detail: string }[];
};

let workspaceRoot: string;
let report: FixtureReport;

suiteSetup(() => {
	const folders = vscode.workspace.workspaceFolders;
	assert.ok(folders && folders.length > 0, 'no workspace folder -- runTest must pass one via launchArgs');
	workspaceRoot = folders[0].uri.fsPath;
	report = JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.fixture-report.json'), 'utf8'));
});

suite('project detection', () => {
	// allProjectInfos persists across tests in a run.
	setup(() => project.clearProjects(project.extensionContext));

	test('detects every imported fixture with the expected device', async function () {
		if (!report.ccsAvailable) { this.skip(); }

		await project.getProjects(project.extensionContext);

		const actual = project.allProjectInfos
			.map(p => `${p.name}=${p.migrationState.currentDevice}`)
			.sort();
		const expected = IMPORT_FIXTURES
			.map(f => `${f.name}=${f.expectDevice}`)
			.sort();

		assert.deepStrictEqual(actual, expected);
	});

	test('is idempotent -- a second scan adds no duplicates', async function () {
		if (!report.ccsAvailable) { this.skip(); }

		await project.getProjects(project.extensionContext);
		const first = project.allProjectInfos.length;
		await project.getProjects(project.extensionContext);

		assert.strictEqual(project.allProjectInfos.length, first);
	});

	test('clearProjects empties the list', async function () {
		if (!report.ccsAvailable) { this.skip(); }

		await project.getProjects(project.extensionContext);
		assert.ok(project.allProjectInfos.length > 0, 'nothing detected to clear');

		project.clearProjects(project.extensionContext);
		assert.strictEqual(project.allProjectInfos.length, 0);
	});

	test('ignores a directory without a .cproject', async () => {
		fs.mkdirSync(path.join(workspaceRoot, 'not_a_project'), { recursive: true });
		fs.writeFileSync(path.join(workspaceRoot, 'not_a_project', 'readme.txt'), 'no cproject here');

		await project.getProjects(project.extensionContext);

		assert.ok(!project.allProjectInfos.some(p => p.name === 'not_a_project'));
	});

	test('rejects a .cproject whose device is not C28xx or C29xx', async () => {
		const dir = path.join(workspaceRoot, 'msp_project');
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, '.cproject'),
			'<cproject><option value="DEVICE_CONFIGURATION_ID=MSP430.MSP430F5529"/></cproject>');

		await project.getProjects(project.extensionContext);

		assert.ok(!project.allProjectInfos.some(p => p.name === 'msp_project'));
	});
});

suite('projectless files', () => {
	setup(() => project.clearProjects(project.extensionContext));

	test('copied driverlib sources are present in the workspace', function () {
		if (!report.ccsAvailable) { this.skip(); }

		for (const f of COPY_FIXTURES) {
			assert.ok(fs.existsSync(path.join(workspaceRoot, f.to)), `missing copied fixture ${f.to}`);
		}
	});

	test('copied sources belong to no detected project', async function () {
		if (!report.ccsAvailable) { this.skip(); }

		await project.getProjects(project.extensionContext);

		for (const f of COPY_FIXTURES) {
			const uri = vscode.Uri.file(path.join(workspaceRoot, f.to));
			assert.strictEqual(project.projectGetUriProjectInfo(uri), undefined,
				`${f.to} should not resolve to a project`);
		}
	});
});

suite('contributed commands', () => {
	test('every command in package.json is registered', async () => {
		const ext = vscode.extensions.getExtension('ti-asm.c2000-idea');
		assert.ok(ext, 'extension ti-asm.c2000-idea not found');
		await ext.activate();

		const declared: string[] = ext.packageJSON.contributes.commands.map((c: any) => c.command);
		const registered = new Set(await vscode.commands.getCommands(true));
		const missing = declared.filter(c => !registered.has(c));

		assert.deepStrictEqual(missing, [], `declared but not registered: ${missing.join(', ')}`);
	});
});
