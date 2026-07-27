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
	// Passed as -ccs.device. Several projectspecs declare "Generic C28xx Device",
	// which yields no usable GPN, so the concrete variant is named here.
	device: string;
	build: boolean;
	// Project name, which is also the folder name getProjects reports. Unique
	// across the manifest: CCS imports every project into one flat workspace.
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

// One driverlib example per device folder in C2000Ware. Names were chosen to be
// globally unique among all 2914 projectspecs, so no two imports collide.
export const FIXTURES: Fixture[] = [
	{
		kind: 'import', name: 'sysctl_ex3_intosc_to_xrosc_config',
		projectspec: 'driverlib/f280013x/examples/sysctl/CCS/sysctl_ex3_intosc_to_xrosc_config.projectspec',
		device: 'TMS320F2800137', build: false, expectDevice: 'F280013x',
	},
	{
		kind: 'import', name: 'empty_sysconfig_48php',
		projectspec: 'driverlib/f280015x/examples/pinmux/CCS/empty_sysconfig_48php.projectspec',
		device: 'TMS320F2800157', build: false, expectDevice: 'F280015x',
	},
	{
		kind: 'import', name: 'empty_sysconfig_80qfp',
		projectspec: 'driverlib/f28002x/examples/pinmux/CCS/empty_sysconfig_80qfp.projectspec',
		device: 'TMS320F280025C', build: true, expectDevice: 'F28002x',
	},
	{
		kind: 'import', name: 'fpufastrts_f32',
		projectspec: 'driverlib/f28003x/examples/fpufastrts/CCS/fpufastrts_f32.projectspec',
		device: 'TMS320F280039C', build: false, expectDevice: 'F28003x',
	},
	{
		kind: 'import', name: 'sci_ex4_echoback',
		projectspec: 'driverlib/f28004x/examples/sci/CCS/sci_ex4_echoback.projectspec',
		device: 'TMS320F280049C', build: false, expectDevice: 'F28004x',
	},
	{
		kind: 'import', name: 'f2807x_driverlib',
		projectspec: 'driverlib/f2807x/driverlib/ccs/driverlib.projectspec',
		device: 'TMS320F28075', build: false, expectDevice: 'F2807x',
	},
	{
		kind: 'import', name: 'ipc_ex1_setup_cpu02',
		projectspec: 'driverlib/f2837xd/examples/cpu1/ipc/CCS/ipc_ex1_setup_cpu02.projectspec',
		device: 'TMS320F28377D', build: false, expectDevice: 'F2837xD',
	},
	{
		kind: 'import', name: 'f2837xs_driverlib',
		projectspec: 'driverlib/f2837xs/driverlib/ccs/driverlib.projectspec',
		device: 'TMS320F28377S', build: false, expectDevice: 'F2837xS',
	},
	{
		kind: 'import', name: 'can_config_c28x',
		projectspec: 'driverlib/f2838x/examples/cm/can/CCS/can_config_c28x.projectspec',
		device: 'TMS320F28388D', build: false, expectDevice: 'F2838x',
	},
	{
		kind: 'import', name: 'mcpwm_ex1_basic_pwm',
		projectspec: 'driverlib/f28e12x/examples/mcpwm/CCS/mcpwm_ex1_basic_pwm.projectspec',
		device: 'TMS320F28E120SCS', build: false, expectDevice: 'F28E12x',
	},
	{
		// Expected to resolve as F28P55x, not F28P551x. In deviceData's
		// GPN_TO_DEVICE_REGEX_MAP, F28P55x (/f28p55\S/i) precedes and subsumes
		// F28P551x (/f28p551\S/i) -- the trailing \S matches the '1'. F28P551x is
		// therefore unreachable by detection. This pins current behavior; fixing
		// the ordering should flip this expectation.
		kind: 'import', name: 'i2c_ex8_alt_clock_stretching_controller_tx',
		projectspec: 'driverlib/f28p551x/examples/i2c/CCS/i2c_ex8_alt_clock_stretching_controller_tx.projectspec',
		device: 'TMS320F28P551SG5', build: false, expectDevice: 'F28P55x',
	},
	{
		kind: 'import', name: 'F28P55x_RefGen',
		// File name and project name differ here: control_dcl_refgen_f28p55x.projectspec
		// declares <project name="F28P55x_RefGen">.
		projectspec: 'driverlib/f28p55x/examples/controls/CCS/control_dcl_refgen_f28p55x.projectspec',
		device: 'TMS320F28P550SJ9', build: false, expectDevice: 'F28P55x',
	},
	{
		kind: 'import', name: 'epwm_ex17_diode_emulation',
		projectspec: 'driverlib/f28p65x/examples/c28x/epwm/CCS/epwm_ex17_diode_emulation.projectspec',
		device: 'TMS320F28P650DK9', build: true, expectDevice: 'F28P65x',
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
		const imp = runCcs(env, [
			'-workspace', workspace,
			'-application', 'projectImport',
			'-ccs.location', spec,
			'-ccs.device', f.device,
			'-ccs.copyIntoWorkspace',
			'-ccs.overwrite',
		]);
		if (!imp.ok || !fs.existsSync(path.join(workspace, f.name, '.cproject'))) {
			console.log('FAILED');
			report.failures.push({ name: f.name, stage: 'import', detail: lastLines(imp.output, 12) });
			continue;
		}
		console.log('ok');
		report.imported.push(f.name);

		if (!f.build) { continue; }
		process.stdout.write(`  build  ${f.name} ... `);
		// No -ccs.configuration: the CLI uses the project's active configuration.
		const bld = runCcs(env, [
			'-workspace', workspace,
			'-application', 'projectBuild',
			'-ccs.projects', f.name,
			'-ccs.buildType', 'full',
			'-ccs.listProblems',
		]);
		// The postBuild step emits "/bin/sh: Syntax error" lines that make ignores
		// ("Error 2 (ignored)"), so the output is not a reliable signal. Key off
		// the exit status and CCS's own problem summary instead.
		const clean = bld.ok && /have errors/.test(bld.output) && !/[1-9]\d* out of \d+ projects have errors/.test(bld.output);
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
