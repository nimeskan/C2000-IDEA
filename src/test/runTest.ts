import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		// tsconfig sets rootDir to the repo root, so this file compiles to
		// out/src/test/runTest.js -- three levels below the manifest, not two.
		const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		// Download VS Code, unzip it and run the integration test
		await runTests({
			 extensionDevelopmentPath, extensionTestsPath,
			 launchArgs: ["--disable-extensions"]
			});
	} catch (err) {
		console.error('Failed to run tests', err);
		process.exit(1);
	}
}

main();
