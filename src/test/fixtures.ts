// Declarative fixture manifest plus the code that realizes it into a workspace.
//
// Two kinds of fixture, both sourced from C2000Ware:
//   import - a real CCS project, imported headlessly via ccs-server-cli
//   copy   - a plain file placed outside any project, for projectless tests
//
// Every path here is relative to the c2000ware root resolved by env.ts, so the
// manifest holds nothing machine-specific.
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TestEnv } from './env';

export type ImportFixture = {
	kind: 'import';
	projectspec: string;
	// Only set when the projectspec declares "Generic C28xx Device", which yields
	// no usable GPN. Omitted everywhere else so the spec's own device is used and
	// the manifest does not silently disagree with C2000Ware.
	device?: string;
	build: boolean;
	// Folder name in the workspace, which is what getProjects reports. Applied by
	// renaming the directory after import -- see renameImportedProject.
	name: string;
	// Device family the extension is expected to resolve from the imported
	// .cproject. This records current behavior, not necessarily correct behavior
	// -- see the f28p551x entry.
	expectDevice: string;
};

export type CopyFixture = {
	kind: 'copy';
	from: string;
	to: string;
};

export type Fixture = ImportFixture | CopyFixture;

export const FIXTURES: Fixture[] = [
	// The same led_ex1_blinky example from every device folder in C2000Ware,
	// renamed on import to <device>_led_ex1_blinky. CCS imports every project
	// into one flat workspace, so the device prefix is what keeps them distinct.
	{
		kind: 'import', name: 'f280013x_led_ex1_blinky',
		projectspec: 'driverlib/f280013x/examples/led/CCS/led_ex1_blinky.projectspec',
		build: false, expectDevice: 'F280013x',
	},
	{
		kind: 'import', name: 'f280015x_led_ex1_blinky',
		projectspec: 'driverlib/f280015x/examples/led/CCS/led_ex1_blinky.projectspec',
		build: false, expectDevice: 'F280015x',
	},
	{
		kind: 'import', name: 'f28002x_led_ex1_blinky',
		projectspec: 'driverlib/f28002x/examples/led/CCS/led_ex1_blinky.projectspec',
		build: false, expectDevice: 'F28002x',
	},
	{
		kind: 'import', name: 'f28003x_led_ex1_blinky',
		projectspec: 'driverlib/f28003x/examples/led/CCS/led_ex1_blinky.projectspec',
		build: true, expectDevice: 'F28003x',
	},
	{
		kind: 'import', name: 'f28004x_led_ex1_blinky',
		projectspec: 'driverlib/f28004x/examples/led/CCS/led_ex1_blinky.projectspec',
		build: false, expectDevice: 'F28004x',
	},
	{
		kind: 'import', name: 'f2807x_led_ex1_blinky',
		projectspec: 'driverlib/f2807x/examples/cpu1/led/CCS/led_ex1_blinky.projectspec',
		build: false, expectDevice: 'F2807x',
	},
	{
		kind: 'import', name: 'f2837xd_led_ex1_blinky',
		projectspec: 'driverlib/f2837xd/examples/cpu1/led/CCS/led_ex1_blinky.projectspec',
		build: false, expectDevice: 'F2837xD',
	},
	{
		kind: 'import', name: 'f2837xs_led_ex1_blinky',
		projectspec: 'driverlib/f2837xs/examples/cpu1/led/CCS/led_ex1_blinky.projectspec',
		build: false, expectDevice: 'F2837xS',
	},
	{
		kind: 'import', name: 'f2838x_led_ex1_blinky',
		projectspec: 'driverlib/f2838x/examples/c28x/led/CCS/led_ex1_blinky.projectspec',
		build: false, expectDevice: 'F2838x',
	},
	{
		kind: 'import', name: 'f28e12x_led_ex1_blinky',
		projectspec: 'driverlib/f28e12x/examples/led/CCS/led_ex1_blinky.projectspec',
		build: false, expectDevice: 'F28E12x',
	},
	{
		// The only blinky whose projectspec says "Generic C28xx Device", so it is
		// the only entry that needs an explicit device.
		//
		// Expected to resolve as F28P55x, not F28P551x. In deviceData's
		// GPN_TO_DEVICE_REGEX_MAP the F28P55x pattern (/f28p55\S/i) precedes and
		// subsumes the F28P551x one (/f28p551\S/i) -- the trailing \S matches the
		// '1' -- so F28P551x is unreachable by detection. This pins current
		// behavior; fixing the ordering should flip this expectation.
		kind: 'import', name: 'f28p551x_led_ex1_blinky',
		projectspec: 'driverlib/f28p551x/examples/led/CCS/led_ex1_blinky.projectspec',
		device: 'TMS320F28P551SG5',
		build: false, expectDevice: 'F28P55x',
	},
	{
		kind: 'import', name: 'f28p55x_led_ex1_blinky',
		projectspec: 'driverlib/f28p55x/examples/led/CCS/led_ex1_blinky.projectspec',
		build: false, expectDevice: 'F28P55x',
	},
	{
		kind: 'import', name: 'f28p65x_led_ex1_blinky',
		projectspec: 'driverlib/f28p65x/examples/c28x/led/CCS/led_ex1_blinky.projectspec',
		build: true, expectDevice: 'F28P65x',
	},

	// Loose sources for projectless tests. These sit outside every imported
	// project, so projectGetUriProjectInfo returns undefined for them and the
	// extension falls back to the c2000-idea.project.defaultDevice setting.
	{ kind: 'copy', from: 'driverlib/f28p65x/driverlib/epwm.c', to: 'loose_sources/epwm.c' },
	{ kind: 'copy', from: 'driverlib/f28p65x/driverlib/epwm.h', to: 'loose_sources/epwm.h' },
	{ kind: 'copy', from: 'driverlib/f28003x/driverlib/adc.c', to: 'loose_sources/adc.c' },
];

export const IMPORT_FIXTURES = FIXTURES.filter((f): f is ImportFixture => f.kind === 'import');
export const COPY_FIXTURES = FIXTURES.filter((f): f is CopyFixture => f.kind === 'copy');

export type BuildReport = {
	workspace: string;
	imported: string[];
	built: string[];
	copied: string[];
	failures: { name: string; stage: 'import' | 'build'; detail: string }[];
};

function runCcs(env: TestEnv, args: string[]): { ok: boolean; output: string } {
	const r = cp.spawnSync(env.ccsCli!, args, {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
		// 20 minutes: a cold SysConfig + full build is minutes, not seconds.
		timeout: 20 * 60 * 1000,
	});
	const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
	return { ok: r.status === 0, output };
}

function lastLines(s: string, n: number): string {
	return s.trimEnd().split('\n').slice(-n).join('\n');
}

// The project name CCS will use on import, read from the projectspec itself so
// the manifest does not have to repeat it.
function projectspecName(spec: string): string | null {
	const m = fs.readFileSync(spec, 'utf8').match(/<project\s[^>]*?name="([^"]+)"/s);
	return m ? m[1] : null;
}

// Renames an imported project on disk, which is deliberately NOT done with
// -ccs.renameTo.
//
// That flag costs 298 seconds per import. ProjectImportApp.renameProject calls
// ProjectStateMonitor.ensureIsLoaded while holding the workspace scheduling
// rule, and the workspace refresh that would satisfy it is blocked in
// JobManager.beginRule waiting for that same rule. The two only come unstuck
// when ensureIsLoaded times out after five minutes. Measured on one import:
// 304s with the flag, 6s without.
//
// getProjects keys off the directory name and the .cproject device id, so
// moving the directory is all this needs to do. .project's <name> is updated
// too, so thirteen copies of the same example do not all claim one Eclipse
// project name; .cproject and .ccsproject keep the original name in their
// internal ids, which nothing here reads.
function renameImportedProject(workspace: string, from: string, to: string): void {
	if (from === to) { return; }
	fs.renameSync(path.join(workspace, from), path.join(workspace, to));
	const dotProject = path.join(workspace, to, '.project');
	if (fs.existsSync(dotProject)) {
		fs.writeFileSync(dotProject, fs.readFileSync(dotProject, 'utf8')
			.replace(`<name>${from}</name>`, `<name>${to}</name>`));
	}
}

// Realizes the manifest into `workspace`. Copies always run; imports and builds
// are skipped when CCS is unavailable, so a machine without it still gets the
// projectless fixtures rather than an error.
export function buildFixtureWorkspace(env: TestEnv, workspace: string): BuildReport {
	const report: BuildReport = {
		workspace, imported: [], built: [], copied: [], failures: [],
	};

	if (env.c2000ware) {
		for (const f of COPY_FIXTURES) {
			const src = path.join(env.c2000ware, f.from);
			const dest = path.join(workspace, f.to);
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			fs.copyFileSync(src, dest);
			report.copied.push(f.to);
		}
	}

	if (!env.ccsCli || !env.c2000ware) { return report; }

	for (const f of IMPORT_FIXTURES) {
		const spec = path.join(env.c2000ware, f.projectspec);
		process.stdout.write(`  import ${f.name} ... `);
		if (!fs.existsSync(spec)) {
			// Printed, not skipped silently: a wrong path in the manifest otherwise
			// looks identical to a fixture that was never listed at all.
			console.log('NO SUCH PROJECTSPEC');
			report.failures.push({ name: f.name, stage: 'import', detail: `projectspec not found: ${f.projectspec}` });
			continue;
		}
		// All thirteen fixtures are the same example, so they all import under the
		// same name and are renamed afterwards to keep them apart.
		const importedAs = projectspecName(spec);
		if (!importedAs) {
			console.log('UNREADABLE PROJECTSPEC');
			report.failures.push({ name: f.name, stage: 'import', detail: `no <project name> in ${f.projectspec}` });
			continue;
		}

		const imp = runCcs(env, [
			'-workspace', workspace,
			'-application', 'projectImport',
			'-ccs.location', spec,
			// Only overridden for specs that declare "Generic C28xx Device"; the
			// rest carry a real part number and are left to speak for themselves.
			...(f.device ? ['-ccs.device', f.device] : []),
			'-ccs.copyIntoWorkspace',
			'-ccs.overwrite',
		]);

		if (!imp.ok || !fs.existsSync(path.join(workspace, importedAs, '.cproject'))) {
			console.log('FAILED');
			report.failures.push({ name: f.name, stage: 'import', detail: lastLines(imp.output, 12) });
			continue;
		}
		console.log('ok');
		report.imported.push(f.name);

		// Build before renaming: -ccs.projects matches the Eclipse project name,
		// which is still the one the projectspec declared.
		if (!f.build) { renameImportedProject(workspace, importedAs, f.name); continue; }
		process.stdout.write(`  build  ${f.name} ... `);
		// No -ccs.configuration: the CLI uses the project's active configuration.
		const bld = runCcs(env, [
			'-workspace', workspace,
			'-application', 'projectBuild',
			'-ccs.projects', importedAs,
			'-ccs.buildType', 'full',
			'-ccs.listProblems',
		]);
		// The postBuild step emits "/bin/sh: Syntax error" lines that make ignores
		// ("Error 2 (ignored)"), so the output is not a reliable signal. Key off
		// the exit status and CCS's own problem summary instead.
		const clean = bld.ok && /have errors/.test(bld.output) && !/[1-9]\d* out of \d+ projects have errors/.test(bld.output);
		renameImportedProject(workspace, importedAs, f.name);
		if (!clean) {
			console.log('FAILED');
			report.failures.push({ name: f.name, stage: 'build', detail: lastLines(bld.output, 15) });
			continue;
		}
		console.log('ok');
		report.built.push(f.name);
	}

	return report;
}

export function createWorkspaceDir(env: TestEnv): string {
	if (env.workspacePath) {
		fs.mkdirSync(env.workspacePath, { recursive: true });
		return env.workspacePath;
	}
	return fs.mkdtempSync(path.join(os.tmpdir(), 'c2000-idea-ws-'));
}
