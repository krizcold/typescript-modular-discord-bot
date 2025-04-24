import { Client, CommandInteraction, GatewayIntentBits } from 'discord.js';

// Discord.js ping command
/*

  This is a simple ping command that uses the Discord.js library to reply with the bot's ping.
  it is intended to be a simple example of a command that can be used as a template for other commands.

*/

interface CommandOptions {
  name: string;
  description: string;
  devOnly?: boolean;
  testOnly?: boolean;
  options?: object[];
  requiredIntents?: GatewayIntentBits[];
  callback: (client: Client, interaction: CommandInteraction) => void;
}

const pingCommand: CommandOptions = {
  name: 'ping',
  description: 'Pong!',
  // devOnly: false,
  testOnly: true,
  // options: [],
  requiredIntents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.MessageContent
  ],

  callback: (client: Client, interaction: CommandInteraction) => {
    interaction.reply(`Pong! ${client.ws.ping}ms.`);
  },
};

export = pingCommand;