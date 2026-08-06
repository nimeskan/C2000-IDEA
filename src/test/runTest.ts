import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { runTests } from '@vscode/test-electron';
import { resolveTestEnv } from './env';
import { buildFixtureWorkspace, createWorkspaceDir } from './fixtures';

async function main() {
	// tsconfig sets rootDir to the repo root, so this compiles to
	// out/src/test/, three levels below package.json.
	const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

	const extensionTestsPath = path.resolve(__dirname, './suite/index');

	const env = resolveTestEnv();
	console.log('Test environment:');
	env.diagnostics.forEach(d => console.log(`  ${d}`));

	const workspace = createWorkspaceDir(env);
	console.log(`  workspace: ${workspace}`);
	console.log('Staging fixtures:');
	const report = buildFixtureWorkspace(env, workspace);

	// Handed to the tests via the workspace. A top-level file is invisible to
	// getProjects, which only descends into directories.
	fs.writeFileSync(
		path.join(workspace, '.fixture-report.json'),
		JSON.stringify({ ...report, ccsAvailable: !!env.ccsCli && !!env.c2000ware }, null, 2));

	console.log(`  imported ${report.imported.length}, built ${report.built.length}, ` +
		`copied ${report.copied.length}, failures ${report.failures.length}`);
	for (const f of report.failures) {
		console.log(`\n  !! ${f.stage} failed: ${f.name}\n${f.detail}\n`);
	}

	// Fresh per run: otherwise VS Code reuses .vscode-test/user-data, restores
	// the previous window, and silently tests a stale workspace. Also keeps
	// globalState from leaking between runs.
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c2000-idea-userdata-'));

	let failed = false;
	try {
		const vscodeTestDir = path.resolve(__dirname, '../../../.vscode-test');
		const installedBuilds = fs.existsSync(vscodeTestDir)
			? fs.readdirSync(vscodeTestDir).filter(d => d.startsWith('vscode-'))
			: [];
		const vscodeExecutablePath = installedBuilds.length > 0
			? path.join(vscodeTestDir, installedBuilds[0], 'Code.exe')
			: undefined;

		await runTests({
			extensionDevelopmentPath, extensionTestsPath,
			vscodeExecutablePath,
			launchArgs: [workspace, '--disable-extensions', `--user-data-dir=${userDataDir}`],
		});
	} catch (err) {
		console.error('Failed to run tests', err);
		failed = true;
	} finally {
		// Not in the catch: process.exit() there would skip this and leak the
		// workspace on exactly the runs you repeat most.
		fs.rmSync(userDataDir, { recursive: true, force: true });
		if (!env.keepWorkspaceAfterRun && !env.workspacePath) {
			fs.rmSync(workspace, { recursive: true, force: true });
		} else {
			console.log(`Workspace kept at ${workspace}`);
		}
	}

	if (report.failures.length > 0) {
		console.error(`${report.failures.length} fixture(s) failed to stage.`);
		failed = true;
	}
	if (failed) { process.exit(1); }
}

main();
