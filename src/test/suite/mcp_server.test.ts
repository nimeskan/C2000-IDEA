import { suite, test, suiteTeardown } from 'mocha';
import * as vscode from 'vscode';
import * as assert from 'assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { getMcpUrl, getMcpPort, getMcpHost, isRunning } from '../../mcp/idea-mcp';
import {
	IDEA_MCP_AUTH_TOKEN,
	IDEA_MCP_VSCODE_CONFIG,
	IDEA_MCP_SETTINGS_KEY,
	IDEA_MCP_DEFAULT_PORT,
} from '../../mcp/idea-mcp-config';

// The server and its transport rather than the tools. Nothing here stops or
// restarts the server, so these are safe in any order against mcp_tools.
const SETTINGS = `${IDEA_MCP_VSCODE_CONFIG}.${IDEA_MCP_SETTINGS_KEY}`;

const opened: Client[] = [];

async function connect(): Promise<Client> {
	const transport = new StreamableHTTPClientTransport(new URL(getMcpUrl()), {
		requestInit: { headers: { Authorization: `Bearer ${IDEA_MCP_AUTH_TOKEN}` } },
	});
	const client = new Client({ name: 'c2000-idea-tests', version: '1.0.0' });
	await client.connect(transport);
	opened.push(client);
	return client;
}

suite('idea mcp server', () => {
	suiteTeardown(async () => {
		for (const client of opened) {
			await client.close().catch(() => { /* already closed */ });
		}
		await vscode.workspace.getConfiguration(SETTINGS)
			.update('port', undefined, vscode.ConfigurationTarget.Workspace);
	});

	// isRunning only reports whether httpServer is assigned, which is a claim
	// rather than evidence -- on a port clash it stays true with nothing bound.
	// So this checks the flag and a live socket together.
	test('activation starts the server without being asked', async () => {
		assert.ok(isRunning(), 'isRunning() is false -- ideaMcpInit should have started the server');

		// Unauthenticated on purpose: a 401 from our own middleware proves a socket
		// is listening, that it is this express app, and that auth sits in front.
		const response = await fetch(getMcpUrl(), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
		});

		console.log(`MCPSRV url=${getMcpUrl()} status=${response.status}`);

		assert.strictEqual(response.status, 401,
			`expected the auth middleware to answer, got ${response.status}`);
	});

	test('the url is built from the settings', async () => {
		const config = vscode.workspace.getConfiguration(SETTINGS);
		assert.strictEqual(config.get('port', IDEA_MCP_DEFAULT_PORT), IDEA_MCP_DEFAULT_PORT,
			'the default port is not the documented one');
		assert.strictEqual(getMcpUrl(), `http://${getMcpHost()}:${getMcpPort()}/mcp`);

		// Changed and read back, so a hardcoded url cannot pass. The server keeps
		// listening on the port it bound at startup; only the reported url moves.
		await config.update('port', 55123, vscode.ConfigurationTarget.Workspace);
		const moved = getMcpUrl();
		await config.update('port', undefined, vscode.ConfigurationTarget.Workspace);

		console.log(`MCPSRV moved=${moved} restored=${getMcpUrl()}`);

		assert.ok(moved.endsWith(':55123/mcp'), `the url ignored the port setting: ${moved}`);
		assert.strictEqual(getMcpPort(), IDEA_MCP_DEFAULT_PORT, 'the port setting did not restore');
	});

	test('sessions are independent', async () => {
		const first = await connect();
		const second = await connect();

		const firstId = (first.transport as StreamableHTTPClientTransport).sessionId;
		const secondId = (second.transport as StreamableHTTPClientTransport).sessionId;

		console.log(`MCPSRV sessions first=${firstId ? 'set' : 'unset'} second=${secondId ? 'set' : 'unset'}`);

		assert.ok(firstId, 'the first client got no session id');
		assert.ok(secondId, 'the second client got no session id');
		assert.notStrictEqual(firstId, secondId, 'both clients share one session');

		// Both usable before, and the survivor still usable after one goes away --
		// TRANSPORTS is a shared map, so a close must not take the other down.
		assert.ok((await first.listTools()).tools.length > 0, 'the first client cannot list tools');
		assert.ok((await second.listTools()).tools.length > 0, 'the second client cannot list tools');

		await first.close();

		const survivors = await second.listTools();
		assert.ok(survivors.tools.length > 0, 'closing one session broke the other');

		await second.close();
	});
});
