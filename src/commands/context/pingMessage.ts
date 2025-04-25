import {
  Client,
  MessageContextMenuCommandInteraction,
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
  callback: (client: Client, interaction: MessageContextMenuCommandInteraction | any) => void; // Use specific interaction type
}

const pingMessageCommand: ContextMenuCommandOptions = {
  name: 'ping-message', // Use hyphen
  type: ApplicationCommandType.Message, // Specify Type 3 for Message context menu
  testOnly: true, // Register in test guild only
  // permissionsRequired: ['SendMessages'], // Not strictly needed if replying to interaction
  // botPermissions: ['SendMessages'], // Not strictly needed if replying to interaction

  // No description or options needed for Message context menus

  callback: async (client: Client, interaction: MessageContextMenuCommandInteraction) => {
    // Defer the reply immediately (visible)
    try {
      await interaction.deferReply(); // Acknowledge interaction
    } catch (deferError) {
      console.error(`Error deferring reply for Ping Message interaction:`, deferError);
      return; // Can't proceed if defer fails
    }

    // Get the message the command was used on
    const targetMessage = interaction.targetMessage;

    // Construct the reply content, linking to the target message
    const replyContent = `Pong! (${client.ws.ping}ms) on message: ${targetMessage.url}`;

    // Edit the deferred reply for the interaction
    try {
      await interaction.editReply(replyContent);
    } catch (error) {
      console.error(`Error editing reply for Ping Message interaction:`, error);
      await interaction.followUp({ content: 'An error occurred.' });
    }
  },
};

export = pingMessageCommand;
