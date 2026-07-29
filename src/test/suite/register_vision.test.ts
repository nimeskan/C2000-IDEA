import { suite, test, suiteSetup } from 'mocha';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { DEVICE_LIST } from '../../deviceData';
import * as register from '../../register';
import * as info from '../../utilities/info';
import { COPY_FIXTURES } from '../fixtures';

// Floors, not exact counts: the driverlib headers are generated and move with
// every C2000Ware release. Set below the measured range so SDK churn does not
// fail the suite, high enough that a real regression does.
//
// Measured across all thirteen devices:
//   driverlib  238-343 detections, 62-96 unique, 96.2-100% linked
//   bitfield    25-29  detections, 14-18 unique, 40.0-93.1% linked
const FLOORS = {
	driverlib: { found: 100, unique: 40, linkCoverage: 0.90 },
	bitfield: { found: 10, unique: 8, linkCoverage: 0.85 },
};

// Known link-data gaps, skipped until the data is fixed. Skipped rather than
// accommodated by a lower floor: a pending test stays visible in the output,
// whereas a softer floor would quietly cover the next regression too.
const KNOWN_LINK_GAPS = new Map<string, string>([
	['bitfield:f2807x', 'f2807x_trm_reg.json has no links for the core ADC registers -- 10/25 at last measure'],
]);

// A staged source file plus the device family it belongs to, taken from the
// <device>_ prefix the copy fixtures use.
export type RegisterSource = {
	device: string;
	path: string;
	uri: vscode.Uri;
};

let workspaceRoot: string;
let trmBase: Record<string, string>;

function collect(folder: string): RegisterSource[] {
	return COPY_FIXTURES
		.filter(f => f.to.startsWith(`${folder}/`))
		.map(f => {
			const prefix = path.basename(f.to).split('_')[0];
			const device = DEVICE_LIST.find(d => d.toLowerCase() === prefix.toLowerCase());
			assert.ok(device, `no DEVICE_LIST entry for fixture prefix "${prefix}" (${f.to})`);
			const abs = path.join(workspaceRoot, f.to);
			return { device, path: abs, uri: vscode.Uri.file(abs) };
		});
}

export function driverlibSources(): RegisterSource[] {
	return collect('driverlib_sources');
}

export function bitfieldSources(): RegisterSource[] {
	return collect('bitfield_sources');
}

function resolveWorkspace(): void {
	const folders = vscode.workspace.workspaceFolders;
	assert.ok(folders && folders.length > 0, 'no workspace folder -- runTest must pass one via launchArgs');
	workspaceRoot = folders[0].uri.fsPath;

	const ext = vscode.extensions.getExtension('ti-asm.c2000-idea');
	assert.ok(ext, 'extension ti-asm.c2000-idea not found');
	trmBase = JSON.parse(fs.readFileSync(
		path.join(ext.extensionPath, 'register_links', 'device_register_external.json'), 'utf8'));
}

type Scan = { regName: string; link: string }[];

// One scan per file, reused by every assertion about it.
const scans = new Map<string, Scan>();

async function scan(src: RegisterSource, command: string): Promise<Scan> {
	const key = `${command}:${src.path}`;
	const cached = scans.get(key);
	if (cached) { return cached; }

	const doc = await vscode.workspace.openTextDocument(src.uri);
	await vscode.window.showTextDocument(doc);
	await vscode.commands.executeCommand(command, src.device);
	const result = register.lastRegisterVisionResults.map(r => ({ regName: r.regName, link: r.link }));
	scans.set(key, result);
	return result;
}

function defineVisionTests(
	kind: 'driverlib' | 'bitfield',
	command: string,
	sourcesFor: () => RegisterSource[],
	folder: string,
): void {
	const floors = FLOORS[kind];

	// Built from the manifest, not the workspace: this runs at collection time,
	// before suiteSetup has resolved anything.
	const prefixes = COPY_FIXTURES
		.filter(f => f.to.startsWith(`${folder}/`))
		.map(f => path.basename(f.to).split('_')[0]);

	for (const prefix of prefixes) {
		const find = (): RegisterSource => {
			const src = sourcesFor().find(s => s.device.toLowerCase() === prefix.toLowerCase());
			assert.ok(src, `no ${kind} fixture for ${prefix}`);
			return src;
		};

		test(`${prefix} detects registers`, async function () {
			const src = find();
			if (!fs.existsSync(src.path)) { this.skip(); }
			const found = await scan(src, command);
			const unique = new Set(found.map(r => r.regName)).size;

			assert.ok(found.length >= floors.found,
				`${src.device}: ${found.length} detections, floor is ${floors.found}`);
			assert.ok(unique >= floors.unique,
				`${src.device}: ${unique} unique registers, floor is ${floors.unique}`);
		});

		test(`${prefix} links are well formed`, async function () {
			const src = find();
			if (!fs.existsSync(src.path)) { this.skip(); }
			const found = await scan(src, command);

			const base = trmBase[src.device];
			assert.ok(base, `${src.device} has no TRM base url in device_register_external.json`);

			for (const r of found.filter(x => x.link !== '')) {
				assert.ok(r.link.startsWith(base),
					`${src.device} ${r.regName}: link does not start with ${base} -- ${r.link}`);
				const section = r.link.slice(base.length);
				assert.ok(section.length > 0 && !section.includes(' '),
					`${src.device} ${r.regName}: bad section "${section}"`);
			}
		});

		const coverageTest = KNOWN_LINK_GAPS.has(`${kind}:${prefix}`) ? test.skip : test;
		coverageTest(`${prefix} link coverage`, async function () {
			const src = find();
			if (!fs.existsSync(src.path)) { this.skip(); }
			const found = await scan(src, command);
			const linked = found.filter(r => r.link !== '').length;
			const coverage = found.length === 0 ? 0 : linked / found.length;

			assert.ok(coverage >= floors.linkCoverage,
				`${src.device}: ${linked}/${found.length} linked (${(coverage * 100).toFixed(1)}%), ` +
				`floor is ${(floors.linkCoverage * 100).toFixed(0)}%`);
		});
	}

	test(`${kind} vision is deterministic`, async function () {
		const src = sourcesFor()[0];
		if (!src || !fs.existsSync(src.path)) { this.skip(); }

		const doc = await vscode.workspace.openTextDocument(src.uri);
		await vscode.window.showTextDocument(doc);
		await vscode.commands.executeCommand(command, src.device);
		const first = JSON.stringify(register.lastRegisterVisionResults);
		await vscode.commands.executeCommand(command, src.device);
		const second = JSON.stringify(register.lastRegisterVisionResults);

		assert.strictEqual(second, first, `${src.device}: repeat scan differed`);
	});
}

suite('driverlib register vision', () => {
	suiteSetup(resolveWorkspace);
	defineVisionTests('driverlib', info.C2000_IDEA_CMD_RUN_REGISTER_VISION,
		driverlibSources, 'driverlib_sources');
});

suite('bitfield register vision', () => {
	suiteSetup(resolveWorkspace);
	defineVisionTests('bitfield', info.C2000_IDEA_CMD_RUN_BITFIELD_REGISTER_VISION,
		bitfieldSources, 'bitfield_sources');

	// The device argument must drive the lookup rather than being ignored. The
	// f28e12x fixture is an MCPWM part; F28P65x is not.
	test('the device argument changes the result', async function () {
		const src = bitfieldSources().find(s => s.device === 'F28E12x');
		if (!src || !fs.existsSync(src.path)) { this.skip(); }

		const doc = await vscode.workspace.openTextDocument(src.uri);
		await vscode.window.showTextDocument(doc);

		await vscode.commands.executeCommand(info.C2000_IDEA_CMD_RUN_BITFIELD_REGISTER_VISION, 'F28E12x');
		const own = JSON.stringify(register.lastRegisterVisionResults);
		await vscode.commands.executeCommand(info.C2000_IDEA_CMD_RUN_BITFIELD_REGISTER_VISION, 'F28P65x');
		const other = JSON.stringify(register.lastRegisterVisionResults);

		assert.notStrictEqual(other, own, 'scanning as a different device produced identical results');
	});
});
