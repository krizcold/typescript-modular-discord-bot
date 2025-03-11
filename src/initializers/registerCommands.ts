import { Client, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import getLocalCommands from './getLocalCommands';
import areCommandsDifferent from './areCommandsDifferent';
import 'dotenv/config';

const testMode = false; //TO DO: Set this from the CONFIG file
const guildId = process.env.GUILD_ID;

export default async function registerCommands(client: Client) {
  console.log('[i] Registering commands...');
  if (!guildId) {
    console.error('GUILD_ID environment variable is not set.');
    console.warn('Commands will not be registered.');
    return;
  }

  try {
    // Load all local commands (each file exports a command object or an array of commands)
    const localCommands = getLocalCommands();

    // Fetch existing commands from Discord
    const globalCommands = await client.application?.commands.fetch();
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.error(`Guild (ID: ${guildId}) not found.`);
      return;
    }
    const guildCommands = await guild.commands.fetch(); // Test commands!

    // Process each local command
    for (const localCommand of localCommands) {
      // TO DO: Addd more from: https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-structure

      // --> I should probably instead add these, and then scan for other properties and add them raw (probably do/test that with "type")
      const { name, description, testOnly, permissionsRequired } = localCommand;

      if (!name) {
        console.warn('Command name not found in [', localCommand, ']');
        continue;
      }

      if (!description) {
        console.warn('Command description not found in [', localCommand, ']');
        continue;
      }

      // commandData will be a deep copy of localCommand
      //const commandData: RESTPostAPIApplicationCommandsJSONBody = JSON.parse(JSON.stringify(localCommand));
      const commandData: RESTPostAPIChatInputApplicationCommandsJSONBody = JSON.parse(JSON.stringify(localCommand));

      commandData.description = testOnly ? `[TEST] ${description}` : description;
      commandData.default_member_permissions = permissionsRequired ? String(permissionsRequired) : null;

      // Determine whether this command should be registered globally or locally
      const existingCommand = testOnly
        ? guildCommands.find(cmd => cmd.name === name)
        : globalCommands?.find(cmd => cmd.name === name);

      if (testMode && !testOnly) {
        // In test mode, skip global commands
        continue;
      }

      if (existingCommand) {
        // If the command exists, update it if it differs from the local version
        if (areCommandsDifferent(existingCommand, localCommand)) {
          if (testOnly) {
            await guild.commands.edit(existingCommand.id, commandData);
            console.log(`Edited local command ${name}`);
          } else {
            await client.application?.commands.edit(existingCommand.id, commandData);
            console.log(`Edited global command ${name}`);
          }
        }
      } else {
        // Command does not exist – create it
        if (testOnly) {
          await guild.commands.create(commandData);
          console.log(`Registered local command ${name}`);
        } else {
          await client.application?.commands.create(commandData);
          console.log(`Registered global command ${name}`);
        }
      }
    }

    // Remove global commands that are no longer present locally
    if (globalCommands) {
      for (const globalCommand of globalCommands.values()) {
        const found = localCommands.some(cmd => cmd.name === globalCommand.name && !cmd.testOnly);
        if (!found) {
          await client.application?.commands.delete(globalCommand.id);
          console.log(`Deleted global command ${globalCommand.name} as it is no longer found locally.`);
        }
      }
    }

    // Remove local (guild) commands that are no longer present locally
    for (const guildCommand of guildCommands.values()) {
      const found = localCommands.some(cmd => cmd.name === guildCommand.name && cmd.testOnly);
      if (!found) {
        await guild.commands.delete(guildCommand.id);
        console.log(`Deleted local command ${guildCommand.name} as it is no longer found locally.`);
      }
    }
  } catch (error) {
    console.error(`There was an error while registering commands:\n${error}`);
  }
}
