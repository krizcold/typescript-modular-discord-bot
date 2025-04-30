import {
  Client,
  CommandInteraction,
  GatewayIntentBits,
  PermissionsBitField, // To define command permissions
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  MessageFlags,
  PermissionResolvable // Import PermissionResolvable
} from 'discord.js';
import { registerButtonHandler } from '../../../internalSetup/events/interactionCreate/buttonHandler'; // Adjust path if needed
import { CommandOptions } from '../../../types/commandTypes'; // Adjust path if needed

// Define unique custom IDs for the admin buttons
const KICK_BUTTON_ID = 'admin_panel_kick';
const BAN_BUTTON_ID = 'admin_panel_ban';
const LOGS_BUTTON_ID = 'admin_panel_logs'; // Example button without specific perms

// Define the type for the options object passed to registerButtonHandler
// (Optional, but helps with clarity and type safety)
type ButtonHandlerOptions = {
  timeoutMs?: number | null;
  permissionsRequired?: PermissionResolvable[];
};


const adminPanelCommand: CommandOptions = {
  name: 'admin-panel',
  description: 'Displays an example admin control panel with permission-locked buttons.',
  testOnly: true,
  requiredIntents: [GatewayIntentBits.Guilds],
  // Require Administrator permission to even run the slash command
  permissionsRequired: [PermissionsBitField.Flags.Administrator],

  initialize: (client: Client) => {
    // Define options object for Kick button
    const kickOptions: ButtonHandlerOptions = {
        permissionsRequired: [PermissionsBitField.Flags.KickMembers]
    };
    // Correct argument order: handler is 3rd, options is 4th
    registerButtonHandler(
      client,
      KICK_BUTTON_ID,
      handleKickButton, // 3rd argument: handler function
      kickOptions       // 4th argument: options object
    );

    // Define options object for Ban button
    const banOptions: ButtonHandlerOptions = {
        permissionsRequired: [PermissionsBitField.Flags.BanMembers]
    };
    // Correct argument order
    registerButtonHandler(
      client,
      BAN_BUTTON_ID,
      handleBanButton, // 3rd argument: handler function
      banOptions       // 4th argument: options object
    );

    // Register handler for the LOGS button (no options needed)
    // Correct argument order
    registerButtonHandler(
      client,
      LOGS_BUTTON_ID,
      handleLogsButton // 3rd argument: handler function
      // No 4th argument needed as options are optional
    );
  },

  callback: async (client: Client, interaction: CommandInteraction) => {
    console.log("Admin Panel command executed");

    // Create buttons
    const kickButton = new ButtonBuilder()
      .setCustomId(KICK_BUTTON_ID)
      .setLabel('Kick User (Test)')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('👢');

    const banButton = new ButtonBuilder()
      .setCustomId(BAN_BUTTON_ID)
      .setLabel('Ban User (Test)')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔨');

    const logsButton = new ButtonBuilder()
      .setCustomId(LOGS_BUTTON_ID)
      .setLabel('View Logs (Test)')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📜');

    // Create action row
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(kickButton, banButton, logsButton);

    // Reply with the panel
    try {
      await interaction.reply({
        content: '🚧 **Admin Panel (Test)** 🚧\nClick buttons to test actions (check console logs).',
        components: [row],
        // flags: MessageFlags.Ephemeral // Commented out for testing visibility
      });
    } catch (error) {
        console.error("Failed to send admin panel reply:", error);
    }
  },
};

// --- Button Handler Functions ---

async function handleKickButton(client: Client, interaction: ButtonInteraction): Promise<void> {
  // Permission check already happened in buttonHandler.ts
  console.log(`[Admin Panel] Kick button triggered by ${interaction.user.tag} (${interaction.user.id})`);
  await interaction.reply({ content: 'Kick action triggered (check console). Requires KickMembers permission.', flags: MessageFlags.Ephemeral });
}

async function handleBanButton(client: Client, interaction: ButtonInteraction): Promise<void> {
  // Permission check already happened
  console.log(`[Admin Panel] Ban button triggered by ${interaction.user.tag} (${interaction.user.id})`);
  await interaction.reply({ content: 'Ban action triggered (check console). Requires BanMembers permission.', flags: MessageFlags.Ephemeral });
}

async function handleLogsButton(client: Client, interaction: ButtonInteraction): Promise<void> {
  // No specific permission check needed for this button beyond the initial command permission
  console.log(`[Admin Panel] Logs button triggered by ${interaction.user.tag} (${interaction.user.id})`);
  await interaction.reply({ content: 'Logs action triggered (check console). Requires Administrator permission (from command).', flags: MessageFlags.Ephemeral });
}

export = adminPanelCommand;
