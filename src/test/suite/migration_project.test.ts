import { suite, test, suiteSetup, setup } from 'mocha';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as migration from '../../migration';
import * as project from '../../utilities/project';

// The projectspecs copy the driverlib tree into device/ and the build produces
// CPU1_RAM/, so a project check covers far more than the example source. Both
// folders are what a user excludes to get back to their own code, and excluding
// them is also what keeps this suite affordable -- a full scan of the largest
// project takes over an hour, so each project gets exactly one and every other
// check runs against the reduced file set.
//
// excludeCodes are codes on the most lines of each project's own source, so they
// survive the folder exclusion and still move the count.
//
// Measured totals, in case order: 3631 9116 2473 1078.
type Case = {
	project: string;
	source: string;
	target: string;
	appSource: string;
	floor: number;
	excludeCodes: string[];
};

const SDK_FOLDER = 'device';
const BUILD_FOLDER = 'CPU1_RAM';
const EXCLUDED_FOLDERS = [SDK_FOLDER, BUILD_FOLDER];

const CASES: Case[] = [
	{
		project: 'f280013x_adc_ex14_ppb_pwm_trip', source: 'F280013x', target: 'F28E12x',
		appSource: 'adc_ex14_ppb_pwm_trip.c', floor: 2400,
		excludeCodes: ['EPWM_DC_MODULE_A', 'GPIO_setPadConfig', 'EPWM_DC_EVENT_1'],
	},
	{
		project: 'f28p65x_sdfm_ex6_FIFO_freeze_claread', source: 'F28P65x', target: 'F29H85x',
		appSource: 'sdfm_ex6_FIFO_freeze_claread.c', floor: 6000,
		excludeCodes: ['SDFM_FILTER_1', 'SDFM_FILTER_2', 'SDFM_FILTER_3'],
	},
	{
		project: 'f2837xd_ecap_ex2_capture_pwm', source: 'F2837xD', target: 'F28P65x',
		appSource: 'ecap_ex2_capture_pwm.c', floor: 1600,
		excludeCodes: ['ECAP_setEventPolarity', 'ECAP_enableCounterResetOnEvent'],
	},
	{
		project: 'f28003x_adc_ex15_open_shorts_detection', source: 'F28003x', target: 'F28P551x',
		appSource: 'adc_ex15_open_shorts_detection.c', floor: 700,
		excludeCodes: ['ADC_readResult', 'ADC_configOSDetectMode'],
	},
];

let workspaceRoot: string;

type Found = { total: number; perFile: Map<string, number> };

// Never call migrationRunMigrationCheckOnProject without a project name: the
// other branch is selectProject, which opens a quick pick and never returns
// unattended.
async function checkProject(c: Case, folders: string[] = []): Promise<Found> {
	project.setMigrationCheckFolderExceptions(folders, infoFor(c.project));
	await migration.migrationRunMigrationCheckOnProject(
		project.extensionContext, c.project, undefined, undefined, c.source, [c.target]);
	return collect();
}

function collect(): Found {
	const perFile = new Map<string, number>();
	let total = 0;
	migration.migrationDiagnosticsCollection.forEach((u, diags) => {
		if (diags.length > 0) { perFile.set(u.fsPath, diags.length); total += diags.length; }
	});
	return { total, perFile };
}

function infoFor(name: string): project.ProjectInfo {
	const info = project.allProjectInfos.find(p => p.name === name);
	assert.ok(info, `project ${name} was not detected`);
	return info;
}

// Both scans are reused across tests. The full one is the expensive scan of the
// case; the reduced one drops the SDK and build folders and costs almost nothing.
const fullScans = new Map<string, Found>();
const reducedScans = new Map<string, Found>();

async function full(c: Case): Promise<Found> {
	if (!fullScans.has(c.project)) { fullScans.set(c.project, await checkProject(c)); }
	return fullScans.get(c.project)!;
}

async function reduced(c: Case): Promise<Found> {
	if (!reducedScans.has(c.project)) {
		reducedScans.set(c.project, await checkProject(c, EXCLUDED_FOLDERS));
	}
	return reducedScans.get(c.project)!;
}

function underAny(fsPath: string, folders: string[]): boolean {
	return folders.some(f => fsPath.includes(path.sep + f + path.sep));
}

function countUnder(found: Found, folders: string[]): number {
	let n = 0;
	for (const [fsPath, count] of found.perFile) {
		if (underAny(fsPath, folders)) { n += count; }
	}
	return n;
}

function exists(...parts: string[]): boolean {
	return fs.existsSync(path.join(workspaceRoot, ...parts));
}

suite('migration check on project', () => {
	suiteSetup(async () => {
		const folders = vscode.workspace.workspaceFolders;
		assert.ok(folders && folders.length > 0, 'no workspace folder -- runTest must pass one via launchArgs');
		workspaceRoot = folders[0].uri.fsPath;
		await project.getProjects(project.extensionContext);
	});

	// Exceptions live on the project and persist, so clear them before each test.
	setup(() => {
		for (const c of CASES) {
			const info = project.allProjectInfos.find(p => p.name === c.project);
			if (info) {
				project.setMigrationCheckFolderExceptions([], info);
				info.migrationState.migrationCheckExceptions = [];
			}
		}
	});

	for (const c of CASES) {
		test(`${c.project}: ${c.source} to ${c.target}`, async function () {
			if (!exists(c.project)) { this.skip(); }

			const found = await full(c);
			console.log(`PROJMIG ${c.project} total=${found.total} files=${found.perFile.size}`);

			assert.ok(found.total >= c.floor,
				`${c.project}: ${found.total} diagnostics, floor is ${c.floor}`);
			assert.ok(found.perFile.size >= 2,
				`${c.project}: diagnostics on ${found.perFile.size} file(s); a project check should span more than one`);
			assert.ok(found.perFile.has(path.join(workspaceRoot, c.project, c.appSource)),
				`${c.project}: nothing reported on ${c.appSource}`);
		});

		test(`${c.project}: excluding the ${SDK_FOLDER} and ${BUILD_FOLDER} folders removes exactly their findings`, async function () {
			if (!exists(c.project, SDK_FOLDER)) { this.skip(); }

			const before = await full(c);
			const after = await reduced(c);
			const excluded = countUnder(before, EXCLUDED_FOLDERS);

			console.log(`PROJMIG ${c.project} folder-excluded before=${before.total} after=${after.total} removed=${excluded}`);

			assert.ok(excluded > 0,
				`${c.project}: baseline reported nothing under ${EXCLUDED_FOLDERS.join(' or ')}, so the exclusion proves nothing`);
			for (const fsPath of after.perFile.keys()) {
				assert.ok(!underAny(fsPath, EXCLUDED_FOLDERS),
					`${c.project}: ${fsPath} is under an excluded folder`);
			}
			assert.strictEqual(after.total, before.total - excluded,
				`${c.project}: excluding the folders should drop exactly the ${excluded} diagnostics they held`);
		});

		test(`${c.project}: excluding codes drops findings`, async function () {
			if (!exists(c.project)) { this.skip(); }

			const before = await reduced(c);
			const info = infoFor(c.project);
			for (const code of c.excludeCodes) { project.addMigrationCheckException(code, info); }
			const after = await checkProject(c, EXCLUDED_FOLDERS);

			console.log(`PROJMIG ${c.project} codes-excluded before=${before.total} after=${after.total} codes=${c.excludeCodes.join(',')}`);

			assert.ok(after.total < before.total,
				`${c.project}: excluding ${c.excludeCodes.join(', ')} did not reduce ${before.total} diagnostics`);
		});
	}

	test('excluding a single file by name drops only that file', async function () {
		const c = CASES[0];
		if (!exists(c.project, c.appSource)) { this.skip(); }

		const before = await reduced(c);
		const held = before.perFile.get(path.join(workspaceRoot, c.project, c.appSource)) ?? 0;
		const after = await checkProject(c, [...EXCLUDED_FOLDERS, c.appSource]);

		console.log(`PROJMIG single-file-excluded before=${before.total} after=${after.total} held=${held}`);

		assert.ok(held > 0, `${c.appSource} held no diagnostics to drop`);
		assert.ok(![...after.perFile.keys()].some(u => u.endsWith(c.appSource)),
			`${c.appSource} still reported after exclusion`);
		assert.strictEqual(after.total, before.total - held);
	});

	test('the migration devices on the project drive the check', async function () {
		const c = CASES[0];
		if (!exists(c.project)) { this.skip(); }

		const overridden = await reduced(c);

		const info = infoFor(c.project);
		project.setMigrationCheckFolderExceptions(EXCLUDED_FOLDERS, info);
		project.updateProjectMigrationDevices(info, [c.target]);
		await migration.migrationRunMigrationCheckOnProject(project.extensionContext, c.project);
		const fromState = collect();

		console.log(`PROJMIG state-path override=${overridden.total} fromState=${fromState.total}`);

		assert.strictEqual(fromState.total, overridden.total);
	});

	test('a cancelled token stops the check early', async function () {
		const c = CASES[0];
		if (!exists(c.project)) { this.skip(); }

		const baseline = await reduced(c);

		const source = new vscode.CancellationTokenSource();
		source.cancel();
		project.setMigrationCheckFolderExceptions(EXCLUDED_FOLDERS, infoFor(c.project));
		await migration.migrationRunMigrationCheckOnProject(
			project.extensionContext, c.project, undefined, source.token, c.source, [c.target]);

		const cancelled = collect();
		console.log(`PROJMIG cancelled total=${cancelled.total}`);

		assert.ok(cancelled.total < baseline.total,
			`cancelled run produced ${cancelled.total}, full run ${baseline.total}`);
	});

	test('an unknown project name rejects', async () => {
		// allProjectInfos.filter(...)[0] is undefined for a name that was never
		// detected, and migrationState is read straight off it.
		await assert.rejects(
			() => migration.migrationRunMigrationCheckOnProject(
				project.extensionContext, 'no_such_project', undefined, undefined, 'F280013x', ['F28E12x']),
			'expected an unknown project name to reject');
	});
});
