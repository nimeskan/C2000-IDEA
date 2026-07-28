import { suite, suiteSetup } from 'mocha';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as path from 'path';
import { DEVICE_LIST } from '../../deviceData';
import { COPY_FIXTURES } from '../fixtures';

// A staged source file plus the device family it belongs to, taken from the
// <device>_ prefix the copy fixtures use.
export type RegisterSource = {
	device: string;
	path: string;
	uri: vscode.Uri;
};

let workspaceRoot: string;

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
}

suite('driverlib register vision', () => {
	suiteSetup(resolveWorkspace);

	// Tests to be added.
});

suite('bitfield register vision', () => {
	suiteSetup(resolveWorkspace);

	// Tests to be added.
});
