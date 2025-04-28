import {
  Client,
  UserContextMenuCommandInteraction,
  ApplicationCommandType,
  GatewayIntentBits,
} from 'discord.js';

// Define structure for context menu commands if desired (optional)
import { ContextMenuCommandOptions } from '../../types/commandTypes'; // Adjust path as needed

const pingUserCommand: ContextMenuCommandOptions<UserContextMenuCommandInteraction> = {
  name: 'ping-user', // Use hyphen
  type: ApplicationCommandType.User, // Specify Type 2 for User context menu
  testOnly: true, // Register in test guild only
  requiredIntents: [GatewayIntentBits.Guilds],

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
