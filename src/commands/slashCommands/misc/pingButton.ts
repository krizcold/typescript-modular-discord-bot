import {
  Client,
  CommandInteraction,
  GatewayIntentBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags
} from 'discord.js';

import { registerButtonHandler } from '../../../internalSetup/events/interactionCreate/buttonHandler';
import { CommandOptions } from '../../../types/commandTypes';

const pingButtonCommand: CommandOptions = {
  name: 'ping-button',
  description: 'Sends a ping button!',
  testOnly: true,
  requiredIntents: [GatewayIntentBits.Guilds],

  initialize: (client: Client) => {
    registerButtonHandler(
      client,
      'ping-response',
      async (btnClient: Client, btnInteraction: ButtonInteraction) => {
        await btnInteraction.reply({ content: `Pong! 🏓`, flags: MessageFlags.Ephemeral });
      },
      null // Timeout - null means never expires based on time
    );
  },

  callback: async (client: Client, interaction: CommandInteraction) => {
    console.log("Ping button command executed");

    const button = new ButtonBuilder()
      .setCustomId('ping-response')
      .setLabel('Click me!')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await interaction.reply({
      content: 'Click the button below to test!',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export = pingButtonCommand;
