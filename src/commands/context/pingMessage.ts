import {
  Client,
  MessageContextMenuCommandInteraction,
  ApplicationCommandType,
  GatewayIntentBits
} from 'discord.js';
import { ContextMenuCommandOptions } from '../../types/commandTypes';

const pingMessageCommand: ContextMenuCommandOptions<MessageContextMenuCommandInteraction> = {
  name: 'ping-message',
  type: ApplicationCommandType.Message,
  testOnly: true,
  requiredIntents: [GatewayIntentBits.Guilds],
  permissionsRequired: ['SendMessages', 'ReadMessageHistory'],
  botPermissions: ['SendMessages'],

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
    }
  },
};

export = pingMessageCommand;
