import { suite, test, suiteSetup, suiteTeardown } from 'mocha';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as utils from '../../utilities/utils';

// These walk and resolve paths for the migration check. They were only covered
// through the diagnostic counts of migration_project, where a regression shows
// up as a wrong number rather than a clear failure -- and they are the functions
// the Uri.joinPath rewrite touched.
//
// A small tree of known shape, so the expected sets can be written out.
let root: string;
let rootUri: vscode.Uri;

function write(relative: string, contents = ''): void {
	const target = path.join(root, relative);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, contents);
}

// Sorted, project relative, forward slashed -- comparable on any platform.
function relative(uris: vscode.Uri[]): string[] {
	return uris
		.map(u => path.relative(root, u.fsPath).split(path.sep).join('/'))
		.sort();
}

suite('path utilities', () => {
	suiteSetup(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'c2000-idea-paths-'));
		rootUri = vscode.Uri.file(root);

		write('top.c');
		write('top.h');
		write('notes.txt');
		write('readme.md');
		write('sub/mid.c');
		write('sub/deep/leaf.h');
		write('skipme/ignored.c');
		write('skipme/nested/ignored.h');
	});

	suiteTeardown(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	test('normalizing an exception path', () => {
		assert.strictEqual(utils.normalizeMigrationExceptionPath('  sub/deep  '), 'sub/deep');
		assert.strictEqual(utils.normalizeMigrationExceptionPath('sub\\deep'), 'sub/deep');
		assert.strictEqual(utils.normalizeMigrationExceptionPath('./sub'), 'sub');
		assert.strictEqual(utils.normalizeMigrationExceptionPath('/sub/'), 'sub');
		assert.strictEqual(utils.normalizeMigrationExceptionPath(''), '');
	});

	test('finding sources walks the whole tree and skips other extensions', async () => {
		const found = await utils.getFileTypesInFolder(rootUri, ['.c', '.h']);

		console.log(`PATHS found=${found.length}`);

		assert.deepStrictEqual(relative(found), [
			'skipme/ignored.c',
			'skipme/nested/ignored.h',
			'sub/deep/leaf.h',
			'sub/mid.c',
			'top.c',
			'top.h',
		]);
	});

	test('a folder exception expands to every source beneath it', async () => {
		const ignored = await utils.getIgnoredProjectCCodeUris(rootUri, ['skipme']);

		assert.deepStrictEqual(relative(ignored), [
			'skipme/ignored.c',
			'skipme/nested/ignored.h',
		]);
	});

	test('a file exception names just that file, and a backslash path resolves the same', async () => {
		const byFile = await utils.getIgnoredProjectCCodeUris(rootUri, ['sub/mid.c']);
		assert.deepStrictEqual(relative(byFile), ['sub/mid.c']);

		// The separator a user typed should not decide whether the entry resolves.
		const byBackslash = await utils.getIgnoredProjectCCodeUris(rootUri, ['sub\\deep']);
		assert.deepStrictEqual(relative(byBackslash), ['sub/deep/leaf.h']);
	});

	test('an exception that does not exist is skipped rather than throwing', async () => {
		const ignored = await utils.getIgnoredProjectCCodeUris(rootUri, ['no_such_folder', 'top.c']);

		assert.deepStrictEqual(relative(ignored), ['top.c']);
	});
});
