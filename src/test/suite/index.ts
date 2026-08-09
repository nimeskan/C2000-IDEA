import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
		timeout:20000000000
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((c, e) => {
		// Named explicitly: migration_diagnostics and register_links read fixtures
		// from an external c2000-idea-test-source tree that is not available, and
		// would fail at import time.
		glob(
			'**/{project,device_data,register_vision,register_coder,interrupt_coder,register_report,collateral_tree,migration_guide,migration_device,migration_project,migration_report,migration_syscfg}.test.js',
			{ cwd: testsRoot }, (err: Error | null, files: string[]) => {
			if (err) {
				return e(err);
			}

			// Add files to the test suite
			files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

			try {
				// Run the mocha test
				mocha.run((failures: number) => {
					if (failures > 0) {
						e(new Error(`${failures} tests failed.`));
					} else {
						c();
					}
				});
			} catch (err) {
				console.error(err);
				e(err);
			}
		});
	});
}
