import { suite, test } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as project from '../../utilities/project';
import {
	DEVICE_LIST,
	C28_DEVICE_VARIANT,
	C29_DEVICE_VARIANT,
	getDeviceFamilyFromGPN,
	getDeviceGPNFromDeviceVariant,
	isDeviceF29x,
} from '../../deviceData';

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

	// Real part numbers, taken from the product pages in each device's collateral
	// file rather than written here. The regex table is what an F28P559 apart from
	// an F28P558 comes down to, and it has been wrong before.
	test('every shipped part number resolves to its own family', () => {
		const dir = path.join(project.extensionContext.extensionPath, 'collateral_data');
		let checked = 0;
		const wrong: string[] = [];

		for (const file of fs.readdirSync(dir).filter(f => f.endsWith('_collateral.json'))) {
			const family = file.replace('_collateral.json', '');
			const data = require(path.join(dir, file)) as { productPages: { gpn: string }[] };

			for (const { gpn } of data.productPages) {
				checked++;
				const resolved = getDeviceFamilyFromGPN(gpn);
				if (resolved.toLowerCase() !== family) {
					wrong.push(`${gpn} resolved to "${resolved}", expected ${family}`);
				}
			}
		}

		console.log(`DEVICES gpns=${checked}`);

		assert.ok(checked > 0, 'no part numbers to check');
		assert.deepStrictEqual(wrong, [], 'part numbers resolved to the wrong family');
	});

	test('an unknown part number resolves to nothing', () => {
		assert.strictEqual(getDeviceFamilyFromGPN('TMS320F99999'), '');
		assert.strictEqual(getDeviceFamilyFromGPN(''), '');
	});

	test('the variant prefix is stripped from a gpn', () => {
		assert.strictEqual(
			getDeviceGPNFromDeviceVariant(`${C28_DEVICE_VARIANT}.TMS320F28P650DK`), 'TMS320F28P650DK');
		assert.strictEqual(
			getDeviceGPNFromDeviceVariant(`${C29_DEVICE_VARIANT}.TMS320F29H850TU9`), 'TMS320F29H850TU9');
		// Already bare, so it passes through untouched.
		assert.strictEqual(getDeviceGPNFromDeviceVariant('TMS320F280033'), 'TMS320F280033');
	});

	test('only the C29 family is reported as F29x', () => {
		const f29 = DEVICE_LIST.filter(d => isDeviceF29x(d));
		assert.deepStrictEqual(f29, ['F29H85x']);
	});
});
