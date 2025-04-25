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

interface CommandOptions {
  name: string;
  description: string;
  devOnly?: boolean;
  testOnly?: boolean;
  options?: object[];
  requiredIntents?: GatewayIntentBits[];
  callback: (client: Client, interaction: CommandInteraction) => void;
}

const pingButtonCommand: CommandOptions = {
  name: 'ping-button',
  description: 'Sends a ping button!',
  testOnly: true,
  requiredIntents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],

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

// Register button handler
registerButtonHandler('ping-response', async (client: Client, interaction: ButtonInteraction) => {
  await interaction.reply({ content: `Pong! 🏓`, flags: MessageFlags.Ephemeral });
}, null);

export = pingButtonCommand;
