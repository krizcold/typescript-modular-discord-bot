import {
  Client,
  CommandInteraction,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  MessageFlags,
  PermissionResolvable
} from 'discord.js';
import { registerButtonHandler } from '../../../internalSetup/events/interactionCreate/buttonHandler';
// Import SpecialUserRule type
import { CommandOptions, SpecialUserRule } from '../../../types/commandTypes';

// Define unique custom IDs for the admin buttons
const KICK_BUTTON_ID = 'admin_panel_kick';
const BAN_BUTTON_ID = 'admin_panel_ban';
const LOGS_BUTTON_ID = 'admin_panel_logs';
const SPECIAL_ACTION_BUTTON_ID = 'admin_panel_special';

// Example special user rules
const specialActionRules: SpecialUserRule[] = [
  // Top priority: Specific User A gets level 0
  { type: 'user', id: '123456789012345678', value: 0 }, // Replace with a real ID for testing
  // Next priority: Specific User B gets level 0
  { type: 'user', id: '987654321098765432', value: 0 }, // Replace with another real ID
  // Next: Anyone with BanMembers permission gets level 1
  { type: 'permission', id: PermissionsBitField.Flags.BanMembers, value: 1 },
   // Next: Specific User C (who might also have BanMembers) gets level 2 (overrides level 1)
  { type: 'user', id: '254416953001639938', value: 2 }, // Replace with a real ID
  // Next: Specific User D gets level 3
  { type: 'user', id: '250065818925268993', value: 3 }, // Replace with a real ID
  // Finally: Anyone with KickMembers permission gets level 4 (if they didn't match above)
  { type: 'permission', id: PermissionsBitField.Flags.KickMembers, value: 4 },
  // Anyone else who clicks gets the default level (-1)
];


const adminPanelCommand: CommandOptions = {
  name: 'admin-panel',
  description: 'Displays an example admin control panel with permission-locked buttons.',
  testOnly: true,
  requiredIntents: [GatewayIntentBits.Guilds],
  permissionsRequired: [PermissionsBitField.Flags.Administrator],

  initialize: (client: Client) => {
    // Register Kick button handler
    registerButtonHandler(
      client,
      KICK_BUTTON_ID,
      handleKickButton,
      { permissionsRequired: [PermissionsBitField.Flags.KickMembers] }
    );

    // Register Ban button handler
    registerButtonHandler(
      client,
      BAN_BUTTON_ID,
      handleBanButton,
      { permissionsRequired: [PermissionsBitField.Flags.BanMembers] }
    );

    // Register Logs button handler
    registerButtonHandler(
      client,
      LOGS_BUTTON_ID,
      handleLogsButton
    );

    // Register Special Action button handler with special user rules
    registerButtonHandler(
        client,
        SPECIAL_ACTION_BUTTON_ID,
        handleSpecialActionButton, // New handler function
        { specialUsers: specialActionRules } // Pass the rules
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

    // New Special Action button
    const specialButton = new ButtonBuilder()
        .setCustomId(SPECIAL_ACTION_BUTTON_ID)
        .setLabel('Special Action')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✨');

    // Create action rows (max 5 components per row)
    const row1 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(kickButton, banButton, logsButton);
    const row2 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(specialButton);


    // Reply with the panel
    try {
      await interaction.reply({
        content: '🚧 **Admin Panel (Test)** 🚧\nClick buttons to test actions (check console logs).',
        components: [row1, row2], // Add both rows
        // flags: MessageFlags.Ephemeral // Commented out for testing visibility
      });
    } catch (error) {
        console.error("Failed to send admin panel reply:", error);
    }
  },
};

// --- Button Handler Functions ---

// Update existing handlers to accept userLevel (though they don't use it here)
async function handleKickButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
  console.log(`[Admin Panel] Kick button triggered by ${interaction.user.tag} (${interaction.user.id}) - UserLevel: ${userLevel}`);
  await interaction.reply({ content: 'Kick action triggered (check console). Requires KickMembers permission.', flags: MessageFlags.Ephemeral });
}

async function handleBanButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
  console.log(`[Admin Panel] Ban button triggered by ${interaction.user.tag} (${interaction.user.id}) - UserLevel: ${userLevel}`);
  await interaction.reply({ content: 'Ban action triggered (check console). Requires BanMembers permission.', flags: MessageFlags.Ephemeral });
}

async function handleLogsButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
  console.log(`[Admin Panel] Logs button triggered by ${interaction.user.tag} (${interaction.user.id}) - UserLevel: ${userLevel}`);
  await interaction.reply({ content: 'Logs action triggered (check console). Requires Administrator permission (from command).', flags: MessageFlags.Ephemeral });
}

// New handler function for the special action button
async function handleSpecialActionButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    console.log(`[Admin Panel] Special Action button triggered by ${interaction.user.tag} (${interaction.user.id}) - Received UserLevel: ${userLevel}`);

    let response = '';
    switch (userLevel) {
        case 0:
            response = `You matched a specific user rule (Level 0)! Special response for you.`;
            break;
        case 1:
            response = `You matched the BanMembers permission rule (Level 1)!`;
            break;
        case 2:
            response = `You matched a specific user rule (Level 2), overriding lower priority rules!`;
            break;
        case 3:
             response = `You matched a specific user rule (Level 3)!`;
            break;
        case 4:
            response = `You matched the KickMembers permission rule (Level 4)!`;
            break;
        default: // Includes DEFAULT_USER_LEVEL (-1)
            response = `You didn't match any special rules (Default Level ${userLevel}). Standard response.`;
            break;
    }

    await interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
}


export = adminPanelCommand;
