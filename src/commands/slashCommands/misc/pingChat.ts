import { Client, CommandInteraction, GatewayIntentBits, Message } from 'discord.js';
import { CommandOptions } from '../../../types/commandTypes';

// Shared function to perform the ping reply logic
async function executePingLogic(client: Client, source: CommandInteraction | Message): Promise<void> {
  const latency = client.ws.ping;
  const content = `Pong! ${latency}ms.`;

  try {
    // Check if the source is an interaction or a message and reply accordingly
    if (source instanceof CommandInteraction) {
      // Check if already replied or deferred
      if (source.replied || source.deferred) {
        await source.followUp(content);
      } else {
        await source.reply(content);
      }
    } else if (source instanceof Message) {
      await source.reply(content);
    }
  } catch (error) {
    console.error(`[pingChat] Failed to send reply for ${source instanceof CommandInteraction ? 'interaction' : 'message'} ${source.id}:`, error);
  }
}

// Command definition using CommandOptions interface
const pingChatCommand: CommandOptions = {
  name: 'pingchat',
  description: 'Pong! Replies with bot latency (works via slash or message trigger).',
  testOnly: true,
  requiredIntents: [
    GatewayIntentBits.Guilds, // Needed for slash command context
    GatewayIntentBits.GuildMessages, // Needed for message context
    GatewayIntentBits.MessageContent // Needed if triggered by message content
  ],

  // Callback for Slash Command execution
  callback: async (client: Client, interaction: CommandInteraction) => {
    await executePingLogic(client, interaction);
  },

  // Callback for Message-based execution (triggered by chatReactManager)
  messageCallback: async (client: Client, message: Message) => {
    await executePingLogic(client, message);
  },
};

export = pingChatCommand;
