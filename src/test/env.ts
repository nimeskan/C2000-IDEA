// Resolves the machine-specific locations the test fixtures depend on.
//
// Everything comes from test-env.json at the repo root, optionally overridden
// key-by-key by test-env.local.json (gitignored). No environment variables are
// consulted -- not for paths, not for toggles -- and there is no '~' expansion,
// since that would read $HOME.
//
// This is the only module that knows an absolute path. Every other path in the
// test suite is expressed relative to one of the roots resolved here.
import * as fs from 'fs';
import * as path from 'path';

// env.js compiles to out/src/test/, three levels below the repo root.
export const REPO_ROOT = path.resolve(__dirname, '../../../');

const CCS_CLI_RELATIVE = process.platform === 'win32'
	? path.join('eclipse', 'ccs-server-cli.bat')
	: path.join('eclipse', 'ccs-server-cli.sh');

// A directory only counts as a root if it contains the marker; a plausible name
// is not enough, and a wrong path should fail here rather than inside the CLI.
const C2000WARE_MARKER = path.join('.metadata', 'sdk.json');

type RawConfig = {
	ccs?: string;
	c2000ware?: string;
	workspace?: { path?: string | null; keepAfterRun?: boolean };
};

export type TestEnv = {
	ccs: string | null;
	ccsCli: string | null;
	c2000ware: string | null;
	workspacePath: string | null;
	keepWorkspaceAfterRun: boolean;
	diagnostics: string[];
};

function readConfig(name: string): RawConfig {
	const file = path.join(REPO_ROOT, name);
	if (!fs.existsSync(file)) { return {}; }
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8')) as RawConfig;
	} catch (e) {
		throw new Error(`${name} is not valid JSON: ${e}`);
	}
}

export function resolveTestEnv(): TestEnv {
	const base = readConfig('test-env.json');
	const local = readConfig('test-env.local.json');
	const cfg: RawConfig = {
		...base,
		...local,
		workspace: { ...base.workspace, ...local.workspace },
	};

	const diagnostics: string[] = [];

	let ccs: string | null = null;
	let ccsCli: string | null = null;
	if (!cfg.ccs) {
		diagnostics.push('ccs: not set in test-env.json / test-env.local.json');
	} else if (!fs.existsSync(path.join(cfg.ccs, CCS_CLI_RELATIVE))) {
		diagnostics.push(`ccs: "${cfg.ccs}" has no ${CCS_CLI_RELATIVE} -- set "ccs" in test-env.local.json`);
	} else {
		ccs = cfg.ccs;
		ccsCli = path.join(cfg.ccs, CCS_CLI_RELATIVE);
		diagnostics.push(`ccs: ${ccs}`);
	}

	let c2000ware: string | null = null;
	if (!cfg.c2000ware) {
		diagnostics.push('c2000ware: not set in test-env.json / test-env.local.json');
	} else if (!fs.existsSync(path.join(cfg.c2000ware, C2000WARE_MARKER))) {
		diagnostics.push(`c2000ware: "${cfg.c2000ware}" has no ${C2000WARE_MARKER} -- set "c2000ware" in test-env.local.json`);
	} else {
		c2000ware = cfg.c2000ware;
		diagnostics.push(`c2000ware: ${c2000ware}`);
	}

	return {
		ccs,
		ccsCli,
		c2000ware,
		workspacePath: cfg.workspace?.path ?? null,
		keepWorkspaceAfterRun: cfg.workspace?.keepAfterRun ?? false,
		diagnostics,
	};
}
