import { suite, test, suiteSetup, suiteTeardown, setup } from 'mocha';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { registerMcp, getMcpUrl } from '../../mcp/idea-mcp';
import { IDEA_MCP_AUTH_TOKEN, IDEA_MCP_SERVER_NAME } from '../../mcp/idea-mcp-config';
import { IDEA_SKILLS_SRC } from '../../skills/idea-skills-config';
import * as project from '../../utilities/project';

// registerMcp takes an optional tool id that skips the quick pick, so the
// command can be driven here without a user.
//
// upsertJsonServer prompts when the idea-mcp key already exists, and nothing
// answers that prompt unattended -- it would hang. So every test starts from a
// removed config file rather than reusing one.
const TOOL = 'claude-code';
const CONFIG_FILE = '.mcp.json';
const SKILLS_DIR = path.join('.claude', 'skills');

let workspaceRoot: string;

function configPath(): string {
	return path.join(workspaceRoot, CONFIG_FILE);
}

function readConfig(): any {
	return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
}

// Relative paths of every file beneath a directory, sorted.
function fileList(root: string): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) { walk(full); }
			else { out.push(path.relative(root, full).split(path.sep).join('/')); }
		}
	};
	walk(root);
	return out.sort();
}

function cleanup(): void {
	fs.rmSync(configPath(), { force: true });
	fs.rmSync(path.join(workspaceRoot, SKILLS_DIR), { recursive: true, force: true });
}

suite('idea mcp register command', () => {
	suiteSetup(() => {
		const folders = vscode.workspace.workspaceFolders;
		assert.ok(folders && folders.length > 0, 'no workspace folder -- runTest must pass one via launchArgs');
		workspaceRoot = folders[0].uri.fsPath;
	});

	setup(() => cleanup());
	suiteTeardown(() => cleanup());

	test('writes the server entry for the chosen tool', async () => {
		await registerMcp(TOOL);

		assert.ok(fs.existsSync(configPath()), `${CONFIG_FILE} was not written`);
		const config = readConfig();

		console.log(`MCPREG servers=${Object.keys(config.mcpServers ?? {}).join(',')}`);

		assert.deepStrictEqual(config.mcpServers?.[IDEA_MCP_SERVER_NAME], {
			type: 'http',
			url: getMcpUrl(),
			headers: { Authorization: `Bearer ${IDEA_MCP_AUTH_TOKEN}` },
		});
	});

	test('merges into an existing config instead of replacing it', async () => {
		// A neighbouring server and an unrelated top-level key, both of which have
		// to survive. The overwrite prompt only fires on our own key, so seeding a
		// different one is safe.
		fs.writeFileSync(configPath(), JSON.stringify({
			mcpServers: { 'other-server': { type: 'http', url: 'http://example.test/mcp' } },
			unrelatedKey: { keep: true },
		}, null, 2));

		await registerMcp(TOOL);
		const config = readConfig();

		console.log(`MCPREG merged servers=${Object.keys(config.mcpServers).join(',')}`);

		assert.deepStrictEqual(config.mcpServers['other-server'],
			{ type: 'http', url: 'http://example.test/mcp' }, 'the neighbouring server was lost');
		assert.deepStrictEqual(config.unrelatedKey, { keep: true }, 'an unrelated key was lost');
		assert.ok(config.mcpServers[IDEA_MCP_SERVER_NAME], 'our entry was not added');
	});

	test('copies the skills tree exactly', async () => {
		await registerMcp(TOOL);

		const source = path.join(project.extensionContext.extensionPath, IDEA_SKILLS_SRC);
		const destination = path.join(workspaceRoot, SKILLS_DIR);
		assert.ok(fs.existsSync(destination), `${SKILLS_DIR} was not created`);

		const expected = fileList(source);
		const actual = fileList(destination);

		console.log(`MCPREG skills source=${expected.length} copied=${actual.length}`);

		assert.ok(expected.length > 0, 'no skills to copy');
		assert.deepStrictEqual(actual, expected, 'the copied skills tree does not match the source');

		for (const relative of expected) {
			const from = fs.readFileSync(path.join(source, relative)).toString('base64');
			const to = fs.readFileSync(path.join(destination, relative)).toString('base64');
			assert.ok(from === to, `${relative}: copied contents differ from the source`);
		}
	});

	test('an unknown tool writes nothing', async () => {
		await registerMcp('no-such-tool');

		assert.ok(!fs.existsSync(configPath()), 'a config was written for an unknown tool');
		assert.ok(!fs.existsSync(path.join(workspaceRoot, SKILLS_DIR)), 'skills were copied for an unknown tool');
	});
});
