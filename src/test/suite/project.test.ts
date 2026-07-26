import { suite, test } from 'mocha';

// Placeholder suite. Deliberately asserts nothing: it exists so the harness
// (runTest -> VS Code download -> extension dev host -> mocha) can be verified
// end to end without depending on the external c2000-idea-test-source fixtures
// that the other suites in this folder need.
suite('Project Test Suite', () => {
	test('placeholder', () => {
		// no assertions yet
	});
});
