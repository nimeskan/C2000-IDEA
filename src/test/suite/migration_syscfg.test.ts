import { suite, test } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import {
	MigrationSyscfgModulePair,
	MIGRATION_SYSCFG_MODULE_SUPPORT,
	migrationSyscfgLoadDatabase,
	migrationSyscfgGetAgentReport,
} from '../../migration/migration_syscfg';
import * as project from '../../utilities/project';

// Every supported source against the one MCPWM target, checking the loaded
// database is filtered to the device and that the rendered table matches it.
//
// Counts come from the shipped json rather than from numbers typed here, so the
// data and the report are compared against the same source. F29H85x is in the
// supported list but matches no entries, and lands on an empty table.
const PAIR = MigrationSyscfgModulePair.EPWM_MCPWM;
const TARGET = 'F28E12x';

// F2803x is not a device this migration applies to.
const SOURCES = MIGRATION_SYSCFG_MODULE_SUPPORT[PAIR].sourceDevices.filter(d => d !== 'F2803x');

const GUIDE_HEADING = '# EPWM to MCPWM SysConfig Migration';
const HEADER = '| Source config<br>(id) | Target config<br>(id) | Status | Value mapping | Guidance |';
const SEPARATOR = '| --- | --- | --- | --- | --- |';

function database(): Record<string, { devices: string[] }> {
	return require(path.join(project.extensionContext.extensionPath,
		'migration_data', 'syscfg_data', `${PAIR}_syscfg_migration.json`));
}

function expectedFor(device: string): number {
	return Object.values(database()).filter(e => e.devices.includes(device)).length;
}

// The companion guide carries no tables, so every remaining pipe line is a row.
function rows(md: string): string[] {
	return md.split('\n').filter(l => l.startsWith('|') && l !== HEADER && l !== SEPARATOR);
}

// Cells between the leading and trailing delimiter; an escaped pipe is content.
function cellCount(row: string): number {
	return row.split(/(?<!\\)\|/).length - 2;
}

suite('syscfg migration epwm to mcpwm', () => {
	for (const source of SOURCES) {
		test(`${source} to ${TARGET}`, async () => {
			const expected = expectedFor(source);

			const db = await migrationSyscfgLoadDatabase(project.extensionContext, PAIR, source, TARGET);
			assert.ok(db, `no database loaded for ${source}`);
			assert.strictEqual(Object.keys(db).length, expected,
				`${source}: database holds ${Object.keys(db).length} entries, the json yields ${expected}`);
			for (const [name, entry] of Object.entries(db)) {
				assert.ok(entry.devices.includes(source), `${name} was kept but does not apply to ${source}`);
			}

			const md = await migrationSyscfgGetAgentReport(project.extensionContext, PAIR, source, TARGET);
			assert.ok(md, `no report rendered for ${source}`);

			const dataRows = rows(md);
			console.log(`SYSCFG ${source} entries=${expected} rows=${dataRows.length}`);

			assert.ok(md.includes(GUIDE_HEADING), `${source}: companion guide not prepended`);
			assert.ok(md.includes(`## SysConfig Mapping Table ${PAIR} (${source} → ${TARGET})`),
				`${source}: mapping table heading missing or wrong devices`);
			assert.ok(md.includes(HEADER) && md.includes(SEPARATOR), `${source}: table header missing`);
			assert.strictEqual(dataRows.length, expected,
				`${source}: rendered ${dataRows.length} rows for ${expected} entries`);
			for (const row of dataRows) {
				assert.strictEqual(cellCount(row), 5,
					`${source}: row has ${cellCount(row)} cells -- ${row.slice(0, 90)}`);
			}
		});
	}

	test('an unsupported source is rejected', async () => {
		// F28E12x is the target of this pair, never a source.
		const db = await migrationSyscfgLoadDatabase(project.extensionContext, PAIR, TARGET, TARGET);
		const md = await migrationSyscfgGetAgentReport(project.extensionContext, PAIR, TARGET, TARGET);

		assert.strictEqual(db, undefined, 'a database came back for an unsupported source');
		assert.strictEqual(md, undefined, 'a report came back for an unsupported source');
	});

	test('configNames limits the table to those ids', async () => {
		const ids = ['$hardware', '$name'];
		const md = await migrationSyscfgGetAgentReport(
			project.extensionContext, PAIR, 'F28P65x', TARGET, ids);
		assert.ok(md, 'no report for the filtered request');

		console.log(`SYSCFG filtered ids=${ids.length} rows=${rows(md).length}`);

		assert.ok(md.includes(`Requested ids: [${ids.join(', ')}]`), 'requested ids line missing');
		assert.strictEqual(rows(md).length, ids.length, 'filtered table does not hold one row per id');

		const unknown = await migrationSyscfgGetAgentReport(
			project.extensionContext, PAIR, 'F28P65x', TARGET, ['no_such_config']);
		assert.ok(unknown, 'no report for the unknown id request');
		assert.strictEqual(rows(unknown).length, 0, 'an unknown id produced rows');
	});
});
