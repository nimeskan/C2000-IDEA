import * as vscode from 'vscode';
import { isRunning as isIdeaMcpRunning } from './idea-mcp';
import { isRunning as isTiAsmMcpRunning } from './ti-asm-mcp';
import { IDEA_MCP_VSCODE_CONFIG } from './idea-mcp-config';
import { MCP_VSCODE_CONFIG } from './ti-asm-mcp-config';
import { SKILL_VSCODE_CONFIG } from '../skills/ti-asm-skills-config';
import * as info from '../utilities/info';

const IDEA_MCP_LABEL = 'IDEA MCP';
const ASM_MCP_LABEL  = 'TI-ASM MCP';

const IDEA_MCP_ENABLE_CMD  = `${IDEA_MCP_VSCODE_CONFIG}.enableIdeaMcp`;
const IDEA_MCP_DISABLE_CMD = `${IDEA_MCP_VSCODE_CONFIG}.disableIdeaMcp`;
const ASM_MCP_ENABLE_CMD   = `${MCP_VSCODE_CONFIG}.enableTiAsmMcp`;
const ASM_MCP_DISABLE_CMD  = `${MCP_VSCODE_CONFIG}.disableTiAsmMcp`;

/** QuickPick row — toggle items carry a server discriminator; register items carry a cmd string. */
interface McpServerPick extends vscode.QuickPickItem {
	server?: 'idea' | 'asm';
	cmd?:    string;
}

function dot(running: boolean): string {
	return running ? '$(circle-filled)' : '$(circle-outline)';
}

function recentTag(key: string, lastKey: string | undefined): string {
	return key === lastKey ? '  $(history) recently used' : '';
}

let lastPickedKey: string | undefined;

/** QuickPick listing both MCP servers — select one to toggle it, or choose a registration action. */
async function showTogglePick(): Promise<void> {
	const ideaRunning = isIdeaMcpRunning();
	const asmRunning  = isTiAsmMcpRunning();

	const items: McpServerPick[] = [
		{
			server:      'idea',
			label:       `${dot(ideaRunning)} ${IDEA_MCP_LABEL}`,
			description: ideaRunning ? 'Running — click to disable' : 'Stopped — click to enable',
		},
		{
			server:      'asm',
			label:       `${dot(asmRunning)} ${ASM_MCP_LABEL}`,
			description: asmRunning ? 'Running — click to disable' : 'Stopped — click to enable',
		},
		{ kind: vscode.QuickPickItemKind.Separator, label: 'Register' },
		{
			cmd:         `${IDEA_MCP_VSCODE_CONFIG}.registerIdeaMcp`,
			label:       '$(plug) Register IDEA MCP',
			description: 'Register IDEA MCP with your agent tool' + recentTag('registerIdeaMcp', lastPickedKey),
		},
		{
			cmd:         `${MCP_VSCODE_CONFIG}.registerTiAsmMcp`,
			label:       '$(plug) Register TI ASM MCP',
			description: 'Register TI ASM MCP with your agent tool' + recentTag('registerTiAsmMcp', lastPickedKey),
		},
		{
			cmd:         `${SKILL_VSCODE_CONFIG}.registerSkills`,
			label:       '$(plug) Register Skills',
			description: 'Register C2000-IDEA skills with your agent tool' + recentTag('registerSkills', lastPickedKey),
		},
	];

	const picked = await vscode.window.showQuickPick(items, {
		title:       'C2000 MCP Servers and Skills',
		placeHolder: 'Select a server to enable or disable it',
	});

	if (!picked) { return; }

	if (picked.cmd) {
		lastPickedKey = picked.cmd.split('.').pop();
		await vscode.commands.executeCommand(picked.cmd);
	} else if (picked.server === 'idea') {
		await vscode.commands.executeCommand(ideaRunning ? IDEA_MCP_DISABLE_CMD : IDEA_MCP_ENABLE_CMD);
	} else {
		await vscode.commands.executeCommand(asmRunning ? ASM_MCP_DISABLE_CMD : ASM_MCP_ENABLE_CMD);
	}
}

/**
 * Registers the "Setup AI Agent Support" command backing the AI section of the feature
 * tree view. Invoking it opens a QuickPick that enables/disables either MCP server and
 * registers the MCP servers and skills with the user's agent tool.
 *
 * Server state is read on demand when the QuickPick opens, so there is nothing to poll.
 */
export function mcpAgentSetupInit(context: vscode.ExtensionContext): void {

	const setupCmd = vscode.commands.registerCommand(
		info.C2000_IDEA_CMD_SETUP_AI_AGENT_SUPPORT,
		showTogglePick,
	);

	context.subscriptions.push(setupCmd);
}
