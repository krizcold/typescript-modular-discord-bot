import {
  Client,
  UserContextMenuCommandInteraction,
  ApplicationCommandType,
  // MessageFlags not needed for non-ephemeral reply
} from 'discord.js';

// Define structure for context menu commands if desired (optional)
interface ContextMenuCommandOptions {
  name: string; // Name displayed in the context menu
  type: ApplicationCommandType.User | ApplicationCommandType.Message; // Must be User or Message
  testOnly?: boolean;
  devOnly?: boolean;
  permissionsRequired?: string[];
  botPermissions?: string[];
  requiredIntents?: number[]; // Use GatewayIntentBits if importing
  // No description or options for context menu commands
  callback: (client: Client, interaction: UserContextMenuCommandInteraction | any) => void; // Use specific interaction type
}

const pingUserCommand: ContextMenuCommandOptions = {
  name: 'ping-user', // Use hyphen
  type: ApplicationCommandType.User, // Specify Type 2 for User context menu
  testOnly: true, // Register in test guild only

  // No description or options needed for User context menus

  callback: async (client: Client, interaction: UserContextMenuCommandInteraction) => {
    // Defer the reply immediately (visible this time)
    try {
      await interaction.deferReply(); // No ephemeral flag
    } catch (deferError) {
      console.error(`Error deferring reply for Ping User interaction:`, deferError);
      // If defer fails, we likely can't proceed
      return;
    }


    // Get the user the command was used on
    const targetUser = interaction.targetUser;

    // Construct the reply content
    const replyContent = `Pong! ${targetUser} (${client.ws.ping}ms)`;

    // Edit the deferred reply
    try {
      await interaction.editReply(replyContent);
    } catch (error) {
      console.error(`Error editing reply for Ping User interaction:`, error);
      await interaction.followUp({ content: 'An error occurred.' }); // Non-ephemeral follow-up
    }
  },
};

export = pingUserCommand;
