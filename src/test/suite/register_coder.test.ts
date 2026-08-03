import { suite, test, suiteSetup, suiteTeardown } from 'mocha';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as register from '../../register';
import * as project from '../../utilities/project';
import * as info from '../../utilities/info';
import { DEVICE_LIST } from '../../deviceData';

// registerCompletions is module private, so the tests go through the registered
// provider the way the editor does. That covers the enable/disable gate too.
//
// What the coder offers is derivable from the same register data it reads, so
// these assert the exact label set rather than a floor.

type RegisterBit = { name: string; size: string };
type Register = { name: string; size: string; count?: string; bits: RegisterBit[] };
type Module = { module: string; registers: Register[] };

// A device with indexed registers, wide registers and many modules -- the
// deep snippet checks run against this one rather than all fourteen.
const DEEP_DEVICE = 'F28P65x';

let scratchUri: vscode.Uri;
let scratchPath: string;

function dataRoot(): string {
	return path.join(project.extensionContext.extensionPath, 'register_data', 'driverlib');
}

function modulesFor(device: string): Module[] {
	const d = device.toLowerCase();
	const summary = require(path.join(dataRoot(), `${d}_summary`))[d];
	const modules: Module[] = [];
	for (const module of summary.modules) {
		const registers = require(path.join(dataRoot(), `${d}_${module}_registers`))[`${module}Registers`];
		if (!registers) { continue; }
		modules.push({ module, registers });
	}
	return modules;
}

// Mirrors what registerSetupAutoCompletes pushes: a read and a write per
// register, and a read and a write per bit.
function expected(device: string): { labels: Set<string>; count: number } {
	const labels = new Set<string>();
	let count = 0;
	for (const { module, registers } of modulesFor(device)) {
		const upper = module.toUpperCase();
		for (const reg of registers) {
			labels.add(`${upper} Write ${reg.name}`);
			labels.add(`${upper} Read ${reg.name}`);
			count += 2;
			for (const bit of reg.bits) {
				labels.add(`${upper} Write ${reg.name} bit ${bit.name}`);
				labels.add(`${upper} Read ${reg.name} bit ${bit.name}`);
				count += 2;
			}
		}
	}
	return { labels, count };
}

function labelOf(item: vscode.CompletionItem): string {
	return typeof item.label === 'string' ? item.label : item.label.label;
}

function snippetOf(item: vscode.CompletionItem): string {
	const insert = item.insertText;
	assert.ok(insert instanceof vscode.SnippetString,
		`${labelOf(item)}: insertText is not a SnippetString`);
	return (insert as vscode.SnippetString).value;
}

const REGISTER_LABEL = /^[A-Z0-9_]+ (Write|Read) /;

async function registerItems(): Promise<vscode.CompletionItem[]> {
	const list = await vscode.commands.executeCommand<vscode.CompletionList>(
		'vscode.executeCompletionItemProvider', scratchUri, new vscode.Position(1, 0));
	return (list?.items ?? []).filter(i => REGISTER_LABEL.test(labelOf(i)));
}

// Every ${ opens a placeholder that has to close. The literal braces in C code
// only decrement a depth that a placeholder opened, so a stray } reads as code.
function placeholdersBalanced(snippet: string): boolean {
	let depth = 0;
	for (let i = 0; i < snippet.length; i++) {
		if (snippet[i] === '$' && snippet[i + 1] === '{') { depth++; i++; }
		else if (snippet[i] === '}' && depth > 0) { depth--; }
	}
	return depth === 0;
}

function tabStopZeroCount(snippet: string): number {
	return (snippet.match(/\$0|\$\{0/g) ?? []).length;
}

suite('register coder', () => {
	suiteSetup(async () => {
		const folders = vscode.workspace.workspaceFolders;
		assert.ok(folders && folders.length > 0, 'no workspace folder -- runTest must pass one via launchArgs');

		// A blank line: with no word prefix the editor filters nothing out.
		scratchPath = path.join(folders[0].uri.fsPath, 'register_coder_scratch.c');
		fs.writeFileSync(scratchPath, '\n\n');
		scratchUri = vscode.Uri.file(scratchPath);
		await vscode.workspace.openTextDocument(scratchUri);

		await vscode.commands.executeCommand(info.C2000_IDEA_CMD_ENABLE_REGISTER_CODER);
		// Isolated from the interrupt coder so the filter is not load bearing.
		await vscode.commands.executeCommand(info.C2000_IDEA_CMD_DISABLE_INTERRUPT_CODER);
	});

	// The completions are global to the extension and stay set to whichever device
	// ran last. No other suite reads them.
	suiteTeardown(async () => {
		await vscode.commands.executeCommand(info.C2000_IDEA_CMD_DISABLE_REGISTER_CODER);
		fs.rmSync(scratchPath, { force: true });
	});

	for (const device of DEVICE_LIST) {
		test(`${device}: offers a read and a write for every register and bit`, async () => {
			register.registerSetupAutoCompletes(device, project.extensionContext);
			const items = await registerItems();
			const want = expected(device);

			console.log(`RCODER ${device} items=${items.length} expected=${want.count} labels=${want.labels.size}`);

			assert.strictEqual(items.length, want.count,
				`${device}: provider offered ${items.length} items, the data yields ${want.count}`);

			const actualLabels = new Set(items.map(labelOf));
			const missing = [...want.labels].filter(l => !actualLabels.has(l));
			const extra = [...actualLabels].filter(l => !want.labels.has(l));
			assert.deepStrictEqual([missing.slice(0, 5), extra.slice(0, 5)], [[], []],
				`${device}: ${missing.length} missing, ${extra.length} unexpected`);
		});
	}

	test('every snippet is well formed', async () => {
		register.registerSetupAutoCompletes(DEEP_DEVICE, project.extensionContext);
		const items = await registerItems();
		assert.ok(items.length > 0, 'no items to check');

		for (const item of items) {
			const snippet = snippetOf(item);
			const label = labelOf(item);
			assert.ok(placeholdersBalanced(snippet), `${label}: unclosed placeholder in ${snippet}`);
			assert.ok(!/\$\{\D/.test(snippet), `${label}: placeholder without a tab stop number in ${snippet}`);
			assert.ok(tabStopZeroCount(snippet) <= 1, `${label}: more than one final tab stop in ${snippet}`);
			assert.ok(snippet.includes('${1:'), `${label}: no base address placeholder in ${snippet}`);
		}
	});

	test('every snippet names an offset that exists on the device', async () => {
		register.registerSetupAutoCompletes(DEEP_DEVICE, project.extensionContext);
		const items = await registerItems();

		const offsets = new Set<string>();
		for (const { module, registers } of modulesFor(DEEP_DEVICE)) {
			for (const reg of registers) { offsets.add(`${module.toUpperCase()}_O_${reg.name}`); }
		}

		for (const item of items) {
			const used = snippetOf(item).match(/[A-Z0-9_]+_O_[A-Z0-9_]+/g) ?? [];
			assert.ok(used.length > 0, `${labelOf(item)}: no register offset in the snippet`);
			for (const symbol of used) {
				assert.ok(offsets.has(symbol),
					`${labelOf(item)}: ${symbol} is not a register on ${DEEP_DEVICE}`);
			}
		}
	});

	// Some registers appear twice under one module at the same offset with
	// different widths -- IPC FLASHCTLSEM on F28P65x is both 16 and 32 bit. The
	// coder emits an item per entry, so the check counts accessors per register
	// rather than assuming one width per name.
	test('accessor width follows the register size', async () => {
		register.registerSetupAutoCompletes(DEEP_DEVICE, project.extensionContext);
		const items = await registerItems();

		const want = new Map<string, { HWREG: number; HWREGH: number }>();
		for (const { module, registers } of modulesFor(DEEP_DEVICE)) {
			for (const reg of registers) {
				const symbol = `${module.toUpperCase()}_O_${reg.name}`;
				const tally = want.get(symbol) ?? { HWREG: 0, HWREGH: 0 };
				const accessor = Number(reg.size) > 16 ? 'HWREG' : 'HWREGH';
				tally[accessor] += 2 + 2 * reg.bits.length;
				want.set(symbol, tally);
			}
		}

		const got = new Map<string, { HWREG: number; HWREGH: number }>();
		for (const item of items) {
			const snippet = snippetOf(item);
			const symbol = (snippet.match(/[A-Z0-9_]+_O_[A-Z0-9_]+/) ?? [])[0];
			assert.ok(symbol && want.has(symbol), `${labelOf(item)}: ${symbol} is not a register offset`);
			const tally = got.get(symbol) ?? { HWREG: 0, HWREGH: 0 };
			tally[snippet.includes('HWREGH(') ? 'HWREGH' : 'HWREG']++;
			got.set(symbol, tally);
		}

		let wide = 0;
		let narrow = 0;
		for (const [symbol, tally] of want) {
			assert.deepStrictEqual(got.get(symbol), tally,
				`${symbol}: accessor widths do not match the register data`);
			wide += tally.HWREG;
			narrow += tally.HWREGH;
		}

		console.log(`RCODER ${DEEP_DEVICE} wide=${wide} narrow=${narrow}`);
		assert.ok(wide > 0 && narrow > 0, 'expected both register widths on this device');
	});

	test('indexed registers offer the index as a choice', async () => {
		register.registerSetupAutoCompletes(DEEP_DEVICE, project.extensionContext);
		const items = await registerItems();

		const indexed = new Set<string>();
		for (const { module, registers } of modulesFor(DEEP_DEVICE)) {
			for (const reg of registers) {
				if (reg.count) { indexed.add(`${module.toUpperCase()}_O_${reg.name}`); }
			}
		}
		assert.ok(indexed.size > 0, `${DEEP_DEVICE} has no indexed registers to check`);

		let checked = 0;
		for (const item of items) {
			const snippet = snippetOf(item);
			const symbol = (snippet.match(/[A-Z0-9_]+_O_[A-Z0-9_]+/) ?? [])[0];
			if (!indexed.has(symbol!)) { continue; }
			checked++;
			assert.ok(/\$\{2\|[\d,]+\|\}/.test(snippet),
				`${labelOf(item)}: indexed register without an index choice in ${snippet}`);
		}

		console.log(`RCODER ${DEEP_DEVICE} indexed-items=${checked}`);
		assert.ok(checked > 0, 'no indexed register items were offered');
	});

	test('single bit and multi bit writes use different forms', async () => {
		register.registerSetupAutoCompletes(DEEP_DEVICE, project.extensionContext);
		const items = await registerItems();
		const byLabel = new Map(items.map(i => [labelOf(i), i]));

		let single = 0;
		let multi = 0;
		for (const { module, registers } of modulesFor(DEEP_DEVICE)) {
			const upper = module.toUpperCase();
			for (const reg of registers) {
				for (const bit of reg.bits) {
					const item = byLabel.get(`${upper} Write ${reg.name} bit ${bit.name}`);
					assert.ok(item, `no write item for ${upper} ${reg.name} ${bit.name}`);
					const snippet = snippetOf(item);
					const field = `${upper}_${reg.name}_${bit.name}`;
					if (bit.size === '1') {
						single++;
						assert.ok(snippet.includes(`\${3|${field},0|}`),
							`${field}: single bit write without a set/clear choice in ${snippet}`);
					} else {
						multi++;
						assert.ok(snippet.includes(`${field}_M`) && snippet.includes(`${field}_S`),
							`${field}: multi bit write without mask and shift in ${snippet}`);
					}
				}
			}
		}

		console.log(`RCODER ${DEEP_DEVICE} single-bit=${single} multi-bit=${multi}`);
		assert.ok(single > 0 && multi > 0, 'expected both bit widths on this device');
	});

	test('a second setup does not accumulate', async () => {
		register.registerSetupAutoCompletes(DEEP_DEVICE, project.extensionContext);
		const first = (await registerItems()).length;
		register.registerSetupAutoCompletes(DEEP_DEVICE, project.extensionContext);
		const second = (await registerItems()).length;

		assert.strictEqual(second, first, 'setting up twice changed the offered count');
	});

	test('switching devices replaces the set', async () => {
		register.registerSetupAutoCompletes('F28P65x', project.extensionContext);
		const before = new Set((await registerItems()).map(labelOf));

		register.registerSetupAutoCompletes('F280013x', project.extensionContext);
		const after = await registerItems();

		console.log(`RCODER switch f28p65x=${before.size} f280013x=${after.length}`);

		assert.strictEqual(after.length, expected('F280013x').count,
			'after switching, the count does not match the new device');
		const leaked = after.map(labelOf).filter(l => !expected('F280013x').labels.has(l));
		assert.deepStrictEqual(leaked.slice(0, 5), [], 'labels from the previous device survived');
	});

	test('offers nothing while disabled', async () => {
		register.registerSetupAutoCompletes(DEEP_DEVICE, project.extensionContext);
		await vscode.commands.executeCommand(info.C2000_IDEA_CMD_DISABLE_REGISTER_CODER);
		const disabled = await registerItems();

		await vscode.commands.executeCommand(info.C2000_IDEA_CMD_ENABLE_REGISTER_CODER);
		const enabled = await registerItems();

		console.log(`RCODER gating disabled=${disabled.length} enabled=${enabled.length}`);

		assert.strictEqual(disabled.length, 0, 'the disabled coder still offered completions');
		assert.ok(enabled.length > 0, 'the enabled coder offered nothing');
	});
});
