import { suite, test, suiteSetup, suiteTeardown } from 'mocha';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as path from 'path';
import { collateralTreeViewTreeDataProvider, CollateralTreeItem } from '../../collateralTreeView';
import * as project from '../../utilities/project';
import * as info from '../../utilities/info';
import { DEVICE_LIST } from '../../deviceData';

// The tree is driven by projectGetCurrentDevice, which falls back to the
// defaultDevice setting when no editor inside a project is active. Setting that
// per device is what selects which collateral file the tree reads.
//
// Each node's link is checked against the json it came from, so the view and the
// data are compared rather than the view alone.
const NODES = ['TRM', 'Datasheet', 'Datasheet HTML', 'Block Diagram'];

type Collateral = {
	trm: string;
	productPages: { gpn: string; link: string }[];
	datasheet: { pdf: string; html: string; blockDiagram: string; pinout: string };
};

function collateralFor(device: string): Collateral {
	return require(path.join(project.extensionContext.extensionPath,
		'collateral_data', `${device.toLowerCase()}_collateral.json`));
}

async function setDefaultDevice(device: string): Promise<void> {
	await vscode.workspace.getConfiguration('c2000-idea.project')
		.update('defaultDevice', device, vscode.ConfigurationTarget.Workspace);
}

async function children(): Promise<CollateralTreeItem[]> {
	const provider = collateralTreeViewTreeDataProvider();
	return (await provider.getChildren()) ?? [];
}

function labelOf(item: CollateralTreeItem): string {
	const label = item.treeItem.label;
	return typeof label === 'string' ? label : (label?.label ?? '');
}

// Every node opens the collateral command; the link is its first argument.
function linkOf(item: CollateralTreeItem): string {
	const command = item.treeItem.command;
	assert.ok(command, `${labelOf(item)}: no command on the node`);
	assert.strictEqual(command.command, info.C2000_IDEA_CMD_OPEN_COLLATERAL,
		`${labelOf(item)}: wrong command`);
	const arg = (command.arguments ?? [])[0] as { link?: string } | undefined;
	assert.ok(arg, `${labelOf(item)}: no command argument`);
	return arg.link ?? '';
}

function assertUrl(url: string, what: string): void {
	assert.ok(url.startsWith('https://'), `${what} is not an https url: ${url}`);
	assert.doesNotThrow(() => new URL(url), `${what} is not a parseable url: ${url}`);
}

suite('collateral tree view', () => {
	suiteSetup(async () => {
		// An open editor inside a project would take priority over defaultDevice.
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	suiteTeardown(async () => {
		await setDefaultDevice('None');
	});

	for (const device of DEVICE_LIST) {
		test(`${device}: four collateral nodes wired to its data`, async () => {
			await setDefaultDevice(device);
			assert.strictEqual(project.projectGetCurrentDevice(), device,
				`defaultDevice did not take effect for ${device}`);

			const items = await children();
			const data = collateralFor(device);

			console.log(`COLLATERAL ${device} nodes=${items.length} pages=${data.productPages.length}`);

			assert.deepStrictEqual(items.map(labelOf), NODES,
				`${device}: unexpected node set`);

			const links = items.map(linkOf);
			assert.deepStrictEqual(links, [
				data.trm,
				data.datasheet.pdf,
				data.datasheet.html,
				data.datasheet.blockDiagram,
			], `${device}: node links do not match the collateral data`);

			for (let i = 0; i < links.length; i++) {
				assertUrl(links[i], `${device} ${NODES[i]}`);
			}

			// Rendered elsewhere, but a missing entry here is the same broken link.
			assertUrl(data.datasheet.pinout, `${device} pinout`);
			assert.ok(data.productPages.length > 0, `${device}: no product pages`);
			for (const page of data.productPages) {
				assert.ok(page.gpn.length > 0, `${device}: a product page has no gpn`);
				assertUrl(page.link, `${device} product page ${page.gpn}`);
			}
		});
	}

	test('with no device it offers the overview page', async () => {
		await setDefaultDevice('None');
		assert.strictEqual(project.projectGetCurrentDevice(), '', 'a device was still resolved');

		const items = await children();

		console.log(`COLLATERAL none nodes=${items.length}`);

		assert.deepStrictEqual(items.map(labelOf), ['C2000 Real-Time Controllers']);
		assertUrl(linkOf(items[0]), 'overview page');
	});

	test('a leaf has no children', async () => {
		await setDefaultDevice(DEVICE_LIST[0]);
		const provider = collateralTreeViewTreeDataProvider();
		const items = await provider.getChildren();
		assert.ok(items && items.length > 0, 'no nodes to descend from');

		assert.deepStrictEqual(await provider.getChildren(items[0]), []);
	});

	test('every node carries a label and an icon', async () => {
		await setDefaultDevice(DEVICE_LIST[0]);
		const provider = collateralTreeViewTreeDataProvider();
		const items = await children();

		for (const item of items) {
			const treeItem = provider.getTreeItem(item) as vscode.TreeItem;
			assert.ok(labelOf(item).length > 0, 'a node has no label');
			assert.ok(treeItem.iconPath, `${labelOf(item)}: no icon`);
			assert.ok(treeItem.tooltip, `${labelOf(item)}: no tooltip`);
		}
	});
});
