import { Client, CommandInteraction, ContextMenuCommandInteraction, Interaction, PermissionsBitField, MessageFlags } from 'discord.js';
import getLocalCommands from '../../utils/getLocalCommands';

const devs = process.env.DEVS?.split(',') || []; // List of developer IDs
const testServer = process.env.GUILD_ID || ''; // Test server ID

const localCommandsSets = getLocalCommands();

export default async function handleCommands(client: Client, interaction: Interaction) {
  if (!interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return;

  let localCommands: any[] = [];

  // Flatten the local commands array
  localCommandsSets.forEach((commands: any) => {
    if (Array.isArray(commands)) {
      localCommands = [...localCommands, ...commands];
    } else {
      localCommands.push(commands);
    }
  });

  try {
    const commandObject = localCommands.find(
      (cmd) => cmd.name === interaction.commandName
    );

    if (!commandObject) return;

    // Check developer-only condition
    if (commandObject.devOnly) {
      if (!devs.includes(interaction.user.id)) {
        interaction.reply({
          content: 'Only developers are allowed to run this command.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // Check test-only condition
    if (commandObject.testOnly) {
      if (interaction.guildId !== testServer) {
        interaction.reply({
          content: 'This command cannot be run here.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // Check if the user has the required permissions
    if (commandObject.permissionsRequired?.length) {
      for (const permission of commandObject.permissionsRequired) {
        // Cast permission to a key of PermissionsBitField.Flags
        const permKey = permission as keyof typeof PermissionsBitField.Flags;
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags[permKey])) {
          interaction.reply({
            content: 'Not enough permissions.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }
    }

    // Check if the bot has required permissions
    if (commandObject.botPermissions?.length) {
      const bot = interaction.guild?.members.me;
      if (bot) {
        for (const permission of commandObject.botPermissions) {
          const permKey = permission as keyof typeof PermissionsBitField.Flags;
          if (!bot.permissions.has(PermissionsBitField.Flags[permKey])) {
            interaction.reply({
              content: "I don't have enough permissions.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
        }
      }
    }

    await commandObject.callback(client, interaction as CommandInteraction | ContextMenuCommandInteraction);
  } catch (error) {
    console.error(`There was an error running this command:`, error);
  }
};
