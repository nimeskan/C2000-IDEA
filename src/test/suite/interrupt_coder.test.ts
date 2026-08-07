import { suite, test, suiteSetup, suiteTeardown } from 'mocha';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as interrupt from '../../interrupt';
import * as project from '../../utilities/project';
import * as info from '../../utilities/info';
import { DEVICE_LIST } from '../../deviceData';

// interruptCompletions is module private, so the tests go through the registered
// provider the way the editor does. That covers the enable/disable gate too.
//
// What the coder offers is derivable from the same interrupt data it reads, so
// these assert the exact label set rather than a floor.
//
// The template splits on the device family: f28 devices get a C28x ISR and an
// ACK group clear, everything else gets the C29 attribute form, and C29 devices
// additionally get a real time variant.

type Interrupt = {
	intDefineName: string;
	intGroupNumber: string;
	intDescription: string;
};

const C28X_DEVICE = 'F28P65x';
const C29_DEVICE = 'F29H85x';

let scratchUri: vscode.Uri;
let scratchPath: string;

function interruptsFor(device: string): Interrupt[] {
	const file = path.join(project.extensionContext.extensionPath,
		'interrupt_data', `${device.toLowerCase()}_interrupt`);
	return require(file).interrupts;
}

function shortName(int: Interrupt): string {
	return int.intDefineName.replace('INT_', '');
}

function isC29(device: string): boolean {
	return !device.toLowerCase().startsWith('f28');
}

// Mirrors what interruptSetupAutoCompletes pushes: a handler per interrupt, and
// on C29 a real time handler as well.
function expected(device: string): { labels: Set<string>; count: number } {
	const labels = new Set<string>();
	let count = 0;
	for (const int of interruptsFor(device)) {
		labels.add(`interrupt handler ${shortName(int)}`);
		count++;
		if (device.toLowerCase().startsWith('f29')) {
			labels.add(`interrupt real time handler ${shortName(int)}`);
			count++;
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

const INTERRUPT_LABEL = /^interrupt (real time )?handler /;

async function interruptItems(): Promise<vscode.CompletionItem[]> {
	const list = await vscode.commands.executeCommand<vscode.CompletionList>(
		'vscode.executeCompletionItemProvider', scratchUri, new vscode.Position(1, 0));
	return (list?.items ?? []).filter(i => INTERRUPT_LABEL.test(labelOf(i)));
}

function placeholdersBalanced(snippet: string): boolean {
	let depth = 0;
	for (let i = 0; i < snippet.length; i++) {
		if (snippet[i] === '$' && snippet[i + 1] === '{') { depth++; i++; }
		else if (snippet[i] === '}' && depth > 0) { depth--; }
	}
	return depth === 0;
}

suite('interrupt coder', () => {
	suiteSetup(async () => {
		const folders = vscode.workspace.workspaceFolders;
		assert.ok(folders && folders.length > 0, 'no workspace folder -- runTest must pass one via launchArgs');

		// A blank line: with no word prefix the editor filters nothing out.
		scratchPath = path.join(folders[0].uri.fsPath, 'interrupt_coder_scratch.c');
		fs.writeFileSync(scratchPath, '\n\n');
		scratchUri = vscode.Uri.file(scratchPath);
		await vscode.workspace.openTextDocument(scratchUri);

		await vscode.commands.executeCommand(info.C2000_IDEA_CMD_ENABLE_INTERRUPT_CODER);
		// Isolated from the register coder so the filter is not load bearing.
		await vscode.commands.executeCommand(info.C2000_IDEA_CMD_DISABLE_REGISTER_CODER);
	});

	// The completions are global to the extension and stay set to whichever device
	// ran last. No other suite reads them.
	suiteTeardown(async () => {
		await vscode.commands.executeCommand(info.C2000_IDEA_CMD_DISABLE_INTERRUPT_CODER);
		fs.rmSync(scratchPath, { force: true });
	});

	for (const device of DEVICE_LIST) {
		test(`${device}: offers a handler for every interrupt`, async () => {
			interrupt.interruptSetupAutoCompletes(device, project.extensionContext);
			const items = await interruptItems();
			const want = expected(device);

			console.log(`ICODER ${device} items=${items.length} expected=${want.count}`);

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
		interrupt.interruptSetupAutoCompletes(C28X_DEVICE, project.extensionContext);
		const items = await interruptItems();
		assert.ok(items.length > 0, 'no items to check');

		for (const item of items) {
			const snippet = snippetOf(item);
			const label = labelOf(item);
			assert.ok(placeholdersBalanced(snippet), `${label}: unclosed placeholder in ${snippet}`);
			assert.ok(!/\$\{\D/.test(snippet), `${label}: placeholder without a tab stop number in ${snippet}`);
			assert.ok(snippet.includes('${0}'), `${label}: no body tab stop in ${snippet}`);
			assert.ok(snippet.trimEnd().endsWith('}'), `${label}: body is not closed in ${snippet}`);
		}
	});

	test('a C28x device uses the C28x ISR form', async () => {
		interrupt.interruptSetupAutoCompletes(C28X_DEVICE, project.extensionContext);
		const items = await interruptItems();

		for (const item of items) {
			const snippet = snippetOf(item);
			const name = labelOf(item).replace('interrupt handler ', '');
			assert.ok(snippet.includes(`interrupt void INT_\${1:${name}}_ISR(void)`),
				`${name}: not a C28x ISR declaration in ${snippet}`);
			assert.ok(!snippet.includes('__attribute__'),
				`${name}: C28x snippet carries a C29 attribute`);
		}
	});

	test('a C29 device uses the attribute ISR form and adds a real time variant', async () => {
		interrupt.interruptSetupAutoCompletes(C29_DEVICE, project.extensionContext);
		const items = await interruptItems();

		let plain = 0;
		let realtime = 0;
		for (const item of items) {
			const snippet = snippetOf(item);
			const label = labelOf(item);
			if (label.startsWith('interrupt real time handler ')) {
				realtime++;
				assert.ok(snippet.includes('__attribute__((interrupt("RTINT")))'),
					`${label}: real time handler without the RTINT attribute in ${snippet}`);
			} else {
				plain++;
				assert.ok(snippet.includes('__attribute__((interrupt("INT")))'),
					`${label}: handler without the INT attribute in ${snippet}`);
			}
			assert.ok(!snippet.includes('Interrupt_clearACKGroup'),
				`${label}: C29 snippet clears an ACK group`);
		}

		console.log(`ICODER ${C29_DEVICE} plain=${plain} realtime=${realtime}`);
		assert.strictEqual(plain, realtime, 'every C29 interrupt should have both forms');
	});

	test('a C29 device is the only one with real time handlers', async () => {
		interrupt.interruptSetupAutoCompletes(C28X_DEVICE, project.extensionContext);
		const items = await interruptItems();

		const realtime = items.filter(i => labelOf(i).startsWith('interrupt real time handler '));
		assert.deepStrictEqual(realtime.map(labelOf), [],
			`${C28X_DEVICE} offered real time handlers`);
	});

	test('the ACK group clear follows the interrupt group', async () => {
		interrupt.interruptSetupAutoCompletes(C28X_DEVICE, project.extensionContext);
		const items = await interruptItems();
		const byLabel = new Map(items.map(i => [labelOf(i), i]));

		let grouped = 0;
		let ungrouped = 0;
		for (const int of interruptsFor(C28X_DEVICE)) {
			const item = byLabel.get(`interrupt handler ${shortName(int)}`);
			assert.ok(item, `no handler offered for ${int.intDefineName}`);
			const snippet = snippetOf(item);

			if (int.intGroupNumber) {
				grouped++;
				assert.ok(snippet.includes(`Interrupt_clearACKGroup(INTERRUPT_ACK_GROUP${int.intGroupNumber});`),
					`${int.intDefineName}: group ${int.intGroupNumber} without a matching ACK clear in ${snippet}`);
			} else {
				ungrouped++;
				assert.ok(snippet.includes('does not have an ACK group'),
					`${int.intDefineName}: no group, but no explanatory comment in ${snippet}`);
				assert.ok(!snippet.includes('Interrupt_clearACKGroup'),
					`${int.intDefineName}: no group, but an ACK clear was emitted`);
			}
		}

		console.log(`ICODER ${C28X_DEVICE} grouped=${grouped} ungrouped=${ungrouped}`);
		assert.ok(grouped > 0 && ungrouped > 0, 'expected both grouped and ungrouped interrupts');
	});

	test('the description reaches the snippet', async () => {
		interrupt.interruptSetupAutoCompletes(C28X_DEVICE, project.extensionContext);
		const items = await interruptItems();
		const byLabel = new Map(items.map(i => [labelOf(i), i]));

		for (const int of interruptsFor(C28X_DEVICE)) {
			if (!int.intDescription) { continue; }
			const item = byLabel.get(`interrupt handler ${shortName(int)}`);
			assert.ok(item, `no handler offered for ${int.intDefineName}`);
			assert.ok(snippetOf(item).includes(int.intDescription),
				`${int.intDefineName}: description missing from the snippet`);
		}
	});

	test('a second setup does not accumulate', async () => {
		interrupt.interruptSetupAutoCompletes(C28X_DEVICE, project.extensionContext);
		const first = (await interruptItems()).length;
		interrupt.interruptSetupAutoCompletes(C28X_DEVICE, project.extensionContext);
		const second = (await interruptItems()).length;

		assert.strictEqual(second, first, 'setting up twice changed the offered count');
	});

	test('switching devices replaces the set', async () => {
		interrupt.interruptSetupAutoCompletes(C29_DEVICE, project.extensionContext);
		const before = (await interruptItems()).length;

		interrupt.interruptSetupAutoCompletes(C28X_DEVICE, project.extensionContext);
		const after = await interruptItems();

		console.log(`ICODER switch ${C29_DEVICE}=${before} ${C28X_DEVICE}=${after.length}`);

		assert.strictEqual(after.length, expected(C28X_DEVICE).count,
			'after switching, the count does not match the new device');
		const leaked = after.map(labelOf).filter(l => !expected(C28X_DEVICE).labels.has(l));
		assert.deepStrictEqual(leaked.slice(0, 5), [], 'labels from the previous device survived');
	});

	test('offers nothing while disabled', async () => {
		interrupt.interruptSetupAutoCompletes(C28X_DEVICE, project.extensionContext);
		await vscode.commands.executeCommand(info.C2000_IDEA_CMD_DISABLE_INTERRUPT_CODER);
		const disabled = await interruptItems();

		await vscode.commands.executeCommand(info.C2000_IDEA_CMD_ENABLE_INTERRUPT_CODER);
		const enabled = await interruptItems();

		console.log(`ICODER gating disabled=${disabled.length} enabled=${enabled.length}`);

		assert.strictEqual(disabled.length, 0, 'the disabled coder still offered completions');
		assert.ok(enabled.length > 0, 'the enabled coder offered nothing');
	});
});
