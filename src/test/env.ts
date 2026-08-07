// Resolves the machine-specific locations the fixtures need, from
// test-env.json at the repo root, overridden key-by-key by test-env.local.json
// (gitignored). No environment variables and no '~' expansion, which would read
// $HOME. The only module that holds an absolute path.
import * as fs from 'fs';
import * as path from 'path';

// Compiles to out/src/test/, three levels below the repo root.
export const REPO_ROOT = path.resolve(__dirname, '../../../');

const CCS_CLI_RELATIVE = process.platform === 'win32'
	? path.join('eclipse', 'ccs-server-cli.bat')
	: path.join('eclipse', 'ccs-server-cli.sh');

// Roots are validated by marker file, so a wrong path fails here rather than
// inside the CLI.
const C2000WARE_MARKER = path.join('.metadata', 'sdk.json');

type RawConfig = {
	ccs?: string;
	c2000ware?: string;
	workspace?: { path?: string | null; keepAfterRun?: boolean; alreadyExists?: boolean };
};

export type TestEnv = {
	ccs: string | null;
	ccsCli: string | null;
	c2000ware: string | null;
	workspacePath: string | null;
	keepWorkspaceAfterRun: boolean;
	workspaceAlreadyExists: boolean;
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
		workspaceAlreadyExists: cfg.workspace?.alreadyExists ?? false,
		diagnostics,
	};
}
