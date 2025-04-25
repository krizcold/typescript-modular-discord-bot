import { Client, CommandInteraction, GatewayIntentBits } from 'discord.js';
import { CommandOptions } from '../../../types/CommandTypes';

// Discord.js ping command
/*

  This is a simple ping command that uses the Discord.js library to reply with the bot's ping.
  it is intended to be a simple example of a command that can be used as a template for other commands.

*/

const pingCommand: CommandOptions = {
  name: 'ping',
  description: 'Pong!',
  testOnly: true,
  requiredIntents: [
    GatewayIntentBits.Guilds,
  ],

  callback: (client: Client, interaction: CommandInteraction) => {
    interaction.reply(`Pong! ${client.ws.ping}ms.`);
  },
};

export = pingCommand;
