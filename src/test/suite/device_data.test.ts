import { suite, test } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import * as project from '../../utilities/project';
import { DEVICE_LIST } from '../../deviceData';

// The manifest carries its own copy of the device list for the settings
// dropdown. Nothing keeps the two in step, and F28P551x was missing from it
// while every other subsystem supported the device, so a user on that family
// could not pick it.
//
// Order is not asserted: the dropdown order is a presentation choice, and the
// two lists already differ in where F29H85x and F28E12x sit.

type ConfigProperty = { enum?: string[] };

function defaultDeviceEnum(): string[] {
	const manifest = require(path.join(project.extensionContext.extensionPath, 'package.json'));
	const groups = Array.isArray(manifest.contributes.configuration)
		? manifest.contributes.configuration
		: [manifest.contributes.configuration];

	for (const group of groups) {
		const property: ConfigProperty | undefined =
			(group.properties ?? {})['c2000-idea.project.defaultDevice'];
		if (property?.enum) { return property.enum; }
	}
	assert.fail('c2000-idea.project.defaultDevice has no enum in package.json');
}

suite('device data', () => {
	test('the defaultDevice setting offers every supported device', () => {
		const offered = defaultDeviceEnum();

		console.log(`DEVICES enum=${offered.length} list=${DEVICE_LIST.length}`);

		assert.ok(offered.includes('None'), 'the setting cannot be cleared -- no None entry');

		const devices = offered.filter(d => d !== 'None');
		assert.deepStrictEqual([...devices].sort(), [...DEVICE_LIST].sort(),
			'the settings dropdown and DEVICE_LIST do not offer the same devices');
	});
});
