import { 
  Client, 
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  RESTPostAPIContextMenuApplicationCommandsJSONBody,
  ApplicationCommand,
  ApplicationCommandType,
  PermissionsBitField } from 'discord.js';
import getLocalCommands from './getLocalCommands';
import areCommandsDifferent from './areCommandsDifferent';
import 'dotenv/config';
import { getConfigProperty } from '../internalUtils/configManager';

const testMode = getConfigProperty<boolean>('testMode', false);
const guildId = process.env.GUILD_ID;


const typeChat = ApplicationCommandType.ChatInput
const typeUser = ApplicationCommandType.User
const typeMessage = ApplicationCommandType.Message


// Filter out internal keys from the command object
/*
  These variables are passed from the Command scripts for internal
  purposes, or are handled in the command registration process.
  So we will filter them out before sending the command to Discord.
*/
const internalOrHandledKeys = [
  'callback',
  'requiredIntents',
  'permissionsRequired',
  'testOnly',
  'botPermissions',
];

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
      // https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-structure
      
      const { name, testOnly, type = typeChat } = localCommand;

      if (skipCommand(localCommand)) {
        continue;
      }

      // Determine if the command should be registered as a test command or a global command
      // Based on command matching name AND type
      const existingCommand = (testOnly ? guildCommands : globalCommands)?.
      find(cmd => cmd.name === name && cmd.type === type);

      // --> Register either as a SLASH command, or a CONTEXT menu command
      const commandData: any = createBasePayload(localCommand)
      //commandData.description = testOnly ? `[TEST] ${description}` : description;

      await commandRegistration(commandData, localCommand, existingCommand, guild, client);
    }

    
    // Remove global commands that are no longer present locally
    if (globalCommands) {
      for (const appCommand of globalCommands.values()) {
        // Find local command matching name AND type
        const foundLocal = localCommands.some(localCmd =>
          localCmd.name === appCommand.name &&
          (localCmd.type ?? typeChat) === appCommand.type && // Compare type
          !localCmd.testOnly // Ensure it's marked as global locally
        );

        // Also consider testMode: If testMode is ON, we shouldn't find *any* corresponding local command unless it's testOnly
        const shouldExistGlobally = !testMode || localCommands.find(cmd => cmd.name === appCommand.name && (cmd.type ?? typeChat) === appCommand.type)?.testOnly;

        if (!foundLocal || !shouldExistGlobally) {
          // Avoid deleting if in test mode and it *should* be global (but wasn't registered)
          if (testMode && localCommands.some(cmd => cmd.name === appCommand.name && (cmd.type ?? typeChat) === appCommand.type && !cmd.testOnly)) {
            console.log(`[Test Mode] Skipping deletion of global command: ${appCommand.name} (Type: ${ApplicationCommandType[appCommand.type]})`);
            continue;
          }
          try {
            await client.application?.commands.delete(appCommand.id);
            console.log(`Deleted global command "${appCommand.name}" (Type: ${ApplicationCommandType[appCommand.type]}) as it is no longer found locally or test mode active.`);
          } catch(deleteError){
            console.error(`Error deleting global command "${appCommand.name}":`, deleteError);
          }
        }
      }
    }

    // Remove local (guild) commands that are no longer present locally or shouldn't be local
    for (const guildCommand of guildCommands.values()) {
      // Find local command matching name AND type
      const foundLocal = localCommands.some(localCmd =>
        localCmd.name === guildCommand.name &&
        (localCmd.type ?? typeChat) === guildCommand.type && // Compare type
        localCmd.testOnly // Ensure it's marked as testOnly locally
      );

      if (!foundLocal) {
        // Don't delete if in testMode and it *should* be a global command (we handle global deletion above)
        // This check might be redundant if the above global check works correctly, but safe to keep
        const correspondingLocal = localCommands.find(cmd => cmd.name === guildCommand.name && (cmd.type ?? typeChat) === guildCommand.type);
        if (testMode && correspondingLocal && !correspondingLocal.testOnly) {
          continue;
        }
        try {
          await guild.commands.delete(guildCommand.id);
          console.log(`Deleted local command "${guildCommand.name}" (Type: ${ApplicationCommandType[guildCommand.type]}) as it is no longer found locally or not marked testOnly.`);
        } catch(deleteError){
          console.error(`Error deleting local command "${guildCommand.name}":`, deleteError);
        }
      }
    }
  } catch (error) {
    console.error(`There was an error while registering commands:\n${error}`);
  }
}

/**
 * Creates a base payload object from localCommand, copying only properties
 * that are not internal or explicitly handled elsewhere.
 * @param localCommand The command object from the local file.
 * @returns A base payload object with potentially valid API properties.
 */
function createBasePayload(localCommand: any): any {
  const payload: any = {};
  for (const key in localCommand) {
    if (!internalOrHandledKeys.includes(key) && localCommand.hasOwnProperty(key)) {
      payload[key] = localCommand[key]; // Copy other properties
    }
  }
  return payload;
}

/**
 * Checks if the command should be skipped based on its properties.
 * @param localCommand The command object from the local file.
 * @returns True if the command should be skipped, false otherwise.
 */
function skipCommand(localCommand: any) {

  const { name, testOnly, type = typeChat } = localCommand || {};

  if (testMode && !testOnly) {
    // In test mode, skip global commands
    return true;
  }

  if (!name) {
    console.warn('Command name not found in [', localCommand, ']');
    return true;
  }

  // Description check using the constant
  if (type === typeChat && !localCommand.description) {
    console.warn(`Command description not found for ChatInput command "${name}". Skipping.`);
    return true;
  }
  // Name validation for User/Message commands using constants
  if ((type === typeUser || type === typeMessage) && (!/^[a-z0-9_-]{1,32}$/.test(name) || name.includes(' '))) {
    console.warn(`Name "${name}" is invalid for User/Message command. It must be lowercase, without spaces, 1-32 characters. Skipping.`);
    return true;
  }

  return false;
}

/**
 * Registers or updates a command based on its existence and properties.
 * @param commandData The command data to be registered or updated.
 * @param localCommand The local command object.
 * @param existingCommand The existing command object from Discord, if any.
 * @param guild The guild object for test commands.
 * @param client The Discord client instance.
 */
async function commandRegistration(
  commandData: any,
  localCommand: any,
  existingCommand: ApplicationCommand | undefined,
  guild: any,
  client: Client,
) {

  const {testOnly = false, permissionsRequired, options, type = typeChat } = localCommand;

  let finalCommand: any = JSON.parse(JSON.stringify(commandData)); // Deep copy to avoid mutation
  //finalCommand.default_member_permissions = permissionsRequired ? String(permissionsRequired) : null;


  // Handle description: Overwrite if ChatInput and testOnly, Delete if not ChatInput
  if (type === typeChat) {
    // Tag test commands with [TEST] in the description
    finalCommand.description = testOnly ? `[TEST] ${localCommand.description}` : localCommand.description;
    finalCommand.options = options || [];
  } else {
    // Ensure description and options are removed for Context Menu types
    delete finalCommand.description;
    delete finalCommand.options;
  }


  // Calculate and set default_member_permissions (overwrites if present in basePayload)
  if (permissionsRequired?.length) {
    try {
      const resolvedPermissions = PermissionsBitField.resolve(permissionsRequired);
      finalCommand.default_member_permissions = String(resolvedPermissions);
    } catch (error) {
      console.error(`Error resolving permissions for command "${finalCommand.name}":`, error);
      finalCommand.default_member_permissions = null;
    }
  } else {
    // Ensure it's null if not specified, overwriting any potential copied value
    finalCommand.default_member_permissions = null;
  }


  // ---> Assert correct type before sending <---
  let finalCommandDataTyped: RESTPostAPIChatInputApplicationCommandsJSONBody | RESTPostAPIContextMenuApplicationCommandsJSONBody;

  if (type === typeChat) {
      finalCommandDataTyped = finalCommand as RESTPostAPIChatInputApplicationCommandsJSONBody;
  } else if (type === typeUser || type === typeMessage) {
      finalCommandDataTyped = finalCommand as RESTPostAPIContextMenuApplicationCommandsJSONBody;
  } else {
      console.error(`Invalid type encountered in commandRegistration for "${finalCommand.name}".`);
      return;
  }

  
  // ---> Perform Registration/Edit <---
  const targetManager = localCommand.testOnly ? guild.commands : client.application?.commands;
  if (!targetManager) return; // what lmao how

  try {
      if (existingCommand) {
        // Compare existingCommand with the final typed payload
        if (areCommandsDifferent(existingCommand, finalCommandDataTyped)) {
          await targetManager.edit(existingCommand.id, finalCommandDataTyped);
          console.log(`Edited ${localCommand.testOnly ? 'local' : 'global'} command: ${finalCommand.name} (Type: ${ApplicationCommandType[type]})`);
        }
      } else {
        await targetManager.create(finalCommandDataTyped);
        console.log(`Registered ${localCommand.testOnly ? 'local' : 'global'} command: ${finalCommand.name} (Type: ${ApplicationCommandType[type]})`);
      }
  } catch (error) {
      console.error(`Error creating/editing command "${finalCommand.name}" (Type: ${ApplicationCommandType[type]}):`, error);
      console.error('Payload causing error:', JSON.stringify(finalCommandDataTyped, null, 2));
  }
}