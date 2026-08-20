import { suite, test, suiteSetup } from 'mocha';
import * as vscode from 'vscode';
import * as assert from 'assert';
import { featureTreeViewTreeDataProvider, FeatureTreeInfo } from '../../featureTreeView';

// The feature tree is built in code while its inline action buttons are declared
// in package.json, and the two are joined only by a hand-written string: the item
// sets contextValue, the manifest matches it with `viewItem == <contextValue>`.
// Nothing fails loudly when they drift -- the button just stops appearing -- so
// the checks below compare the tree against the manifest in both directions.

const VIEW = 'c2000-idea.featureTreeView';

interface MenuEntry { command: string; when?: string; }

function manifest(): any {
	const ext = vscode.extensions.getExtension('ti-asm.c2000-idea');
	assert.ok(ext, 'extension ti-asm.c2000-idea not found');
	return ext.packageJSON;
}

// The viewItem values the manifest declares inline buttons for, in this view only.
function menuViewItems(): Set<string> {
	const menus: MenuEntry[] = manifest().contributes.menus['view/item/context'] ?? [];
	const items = new Set<string>();
	for (const entry of menus) {
		const when = entry.when ?? '';
		if (!when.includes(`view == ${VIEW}`)) { continue; }
		const match = /viewItem\s*==\s*(\S+)/.exec(when);
		assert.ok(match, `${entry.command}: no viewItem in when clause "${when}"`);
		items.add(match[1]);
	}
	return items;
}

function sections(): FeatureTreeInfo[] {
	return featureTreeViewTreeDataProvider().getChildren() as FeatureTreeInfo[];
}

// The tree nests more than one level deep -- "Bitfield Support" is a child that
// carries children of its own -- so the walk has to recurse rather than assume
// a flat section/item shape.
function everyItem(): FeatureTreeInfo[] {
	const all: FeatureTreeInfo[] = [];
	const visit = (item: FeatureTreeInfo): void => {
		all.push(item);
		for (const child of item.featureSubTreeInfo ?? []) { visit(child); }
	};
	for (const section of sections()) { visit(section); }
	return all;
}

function labelOf(item: FeatureTreeInfo): string {
	const label = item.treeItem.label;
	return typeof label === 'string' ? label : (label?.label ?? '');
}

suite('feature tree view', () => {
	suiteSetup(async () => {
		// The tree is populated by the FeatureTreeView constructor during activation.
		const ext = vscode.extensions.getExtension('ti-asm.c2000-idea');
		assert.ok(ext, 'extension ti-asm.c2000-idea not found');
		await ext.activate();

		// Guards every check below: an empty tree would pass them vacuously.
		assert.ok(sections().length > 0, 'the feature tree is empty');
	});

	test('every contextValue has an inline action in the manifest', () => {
		const declared = menuViewItems();
		const orphans = everyItem()
			.filter(item => item.treeItem.contextValue)
			.filter(item => !declared.has(item.treeItem.contextValue!))
			.map(item => `${labelOf(item)} (${item.treeItem.contextValue})`);

		assert.deepStrictEqual(orphans, [],
			`tree items whose inline action is missing from package.json: ${orphans.join(', ')}`);
	});

	test('every manifest inline action points at a tree item', () => {
		const present = new Set(everyItem()
			.map(item => item.treeItem.contextValue)
			.filter((value): value is string => !!value));
		const stale = [...menuViewItems()].filter(viewItem => !present.has(viewItem));

		assert.deepStrictEqual(stale, [],
			`package.json declares inline actions for items that are not in the tree: ${stale.join(', ')}`);
	});

	test('every item command is registered', async () => {
		const registered = new Set(await vscode.commands.getCommands(true));
		const missing = everyItem()
			.filter(item => item.treeItem.command)
			.filter(item => !registered.has(item.treeItem.command!.command))
			.map(item => `${labelOf(item)} -> ${item.treeItem.command!.command}`);

		assert.deepStrictEqual(missing, [],
			`tree items wired to unregistered commands: ${missing.join(', ')}`);
	});

	test('every node has a label and every section has children', () => {
		const unlabelled = everyItem().filter(item => labelOf(item).length === 0);
		assert.strictEqual(unlabelled.length, 0, 'a tree node has no label');

		for (const section of sections()) {
			assert.ok((section.featureSubTreeInfo ?? []).length > 0,
				`section "${labelOf(section)}" has no children`);
		}
	});

});
