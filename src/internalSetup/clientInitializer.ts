import { Client, GatewayIntentBits, Collection, Interaction, ButtonInteraction, StringSelectMenuInteraction, MessageFlags } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import getAllFiles from './utils/getAllFiles';
import 'dotenv/config';
import { RegisteredButtonInfo, RegisteredDropdownInfo, RegisteredModalInfo, RegisteredReactionInfo } from '../types/commandTypes';


const projectRoot = path.join(__dirname, '..', '..');
const isProd = process.env.NODE_ENV === 'development' ? false : true;

const scanRoot = isProd ? 'dist' : 'src';
const validIntentValues = new Set(Object.values(GatewayIntentBits).filter(v => typeof v === 'number'));

// --- collectRequiredIntents and mergeIntents functions ---
function collectRequiredIntents(...relativeDirs: string[]): number[] {
  const intents = new Set<number>();
  function findIntentsRecursive(directory: string) {
    const filesInDir = getAllFiles(directory, false);
    for (const file of filesInDir) {
      if (file.split(path.sep).includes('disabled')) continue;
      try {
        delete require.cache[require.resolve(file)];
        const mod = require(file);
        let intentsArray: number[] | undefined;
        if (mod?.requiredIntents && Array.isArray(mod.requiredIntents)) {
          intentsArray = mod.requiredIntents;
        } else if (typeof mod === 'object' && mod !== null && mod.default?.requiredIntents && Array.isArray(mod.default.requiredIntents)) {
          intentsArray = mod.default.requiredIntents;
        }
        if (intentsArray) {
          intentsArray
            .filter((intent): intent is number => typeof intent === 'number' && validIntentValues.has(intent))
            .forEach(intent => intents.add(intent));
        }
      } catch (error) { console.error(`Error loading file for intents ${file}:`, error); }
    }
    const subDirs = getAllFiles(directory, true);
    for (const subDir of subDirs) {
      if (path.basename(subDir) === 'disabled' || subDir.split(path.sep).includes('disabled')) continue;
      findIntentsRecursive(subDir);
    }
  }
  for (const relativeDir of relativeDirs) {
    const absoluteDir = path.join(projectRoot, relativeDir);
    try {
      if (!fs.existsSync(absoluteDir)) { console.warn(`[collectRequiredIntents] Directory not found: ${absoluteDir}. Skipping.`); continue; }
      findIntentsRecursive(absoluteDir);
    } catch (error) { console.warn(`Warning: Could not fully scan directory for intents ${absoluteDir}. Error: ${(error as Error).message}`); }
  }
  return Array.from(intents);
}
function mergeIntents(...intentArrays: number[][]): number[] {
  const merged = new Set<number>();
  intentArrays.forEach(arr => arr.forEach(i => merged.add(i)));
  return Array.from(merged);
}


// --- Store modules needing initialization ---
const modulesToInitialize: any[] = [];

/**
 * Loads event handlers and collects modules needing initialization from event files.
 */
async function loadEventHandlers(client: Client) {
  const internalEventsDir = path.join(projectRoot, scanRoot, 'internalSetup', 'events');
  const userEventsDir = path.join(projectRoot, scanRoot, 'events');

  console.log("Loading event handlers...");

  const internalEventFolders = fs.existsSync(internalEventsDir) ? getAllFiles(internalEventsDir, true) : [];
  const userEventFolders = fs.existsSync(userEventsDir) ? getAllFiles(userEventsDir, true) : [];

  const allEventFolderPaths = [...internalEventFolders, ...userEventFolders];
  const uniqueEventNames = [...new Set(allEventFolderPaths.map(folder => path.basename(folder)))];
  const eventMap: Record<string, { internal: string[], user: string[] }> = {};

  uniqueEventNames.forEach(eventName => { eventMap[eventName] = { internal: [], user: [] }; });

  // Populate maps
  for (const folder of internalEventFolders) {
    const eventName = path.basename(folder);
    if (folder.includes('data') || folder.includes('disabled')) continue;
    const eventFiles = getAllFiles(folder, false);
    eventMap[eventName].internal.push(...eventFiles);
    eventMap[eventName].internal.sort((a, b) => a.localeCompare(b));
  }
  for (const folder of userEventFolders) {
    const eventName = path.basename(folder);
    if (folder.includes('data') || folder.includes('disabled')) continue;
    const eventFiles = getAllFiles(folder, false);
    eventMap[eventName].user.push(...eventFiles);
    eventMap[eventName].user.sort((a, b) => a.localeCompare(b));
  }

  // Special handling for 'ready' event
  const commandInitFile = path.join(internalEventsDir, 'ready', isProd ? 'registerCommands.js' : 'registerCommands.ts');
  if (eventMap['ready']) {
    eventMap['ready'].internal = eventMap['ready'].internal.filter(file => file !== commandInitFile);
    if (fs.existsSync(commandInitFile)) {
        eventMap['ready'].internal.unshift(commandInitFile);
    } else {
        console.warn(`[Event Loader] registerCommands file not found at: ${commandInitFile}`);
    }
  } else {
    if (fs.existsSync(commandInitFile)) {
        eventMap['ready'] = { internal: [commandInitFile], user: [] };
    } else {
        console.warn(`[Event Loader] registerCommands file not found and no other 'ready' events found.`);
        if (!eventMap['ready']) eventMap['ready'] = { internal: [], user: [] };
    }
  }


  // Special handling for 'interactionCreate' to order internal handlers
  const interactionCreateDir = path.join(internalEventsDir, 'interactionCreate');
  const handleCommandsPath = path.join(interactionCreateDir, isProd ? 'handleCommands.js' : 'handleCommands.ts');
  const buttonHandlerPath = path.join(interactionCreateDir, isProd ? 'buttonHandler.js' : 'buttonHandler.ts');
  const dropdownHandlerPath = path.join(interactionCreateDir, isProd ? 'dropdownHandler.js' : 'dropdownHandler.ts');
  const modalSubmitHandlerPath = path.join(interactionCreateDir, isProd ? 'modalSubmitHandler.js' : 'modalSubmitHandler.ts');
  const orderedInternalInteractionHandlers = [
    handleCommandsPath,
    buttonHandlerPath,
    dropdownHandlerPath,
    modalSubmitHandlerPath
  ].filter(p => fs.existsSync(p));

  if (eventMap['interactionCreate']) {
    eventMap['interactionCreate'].internal = orderedInternalInteractionHandlers;
  } else {
    console.warn("[Event Loader] No 'interactionCreate' event folder/handlers found initially. Setting up internal handlers.");
    eventMap['interactionCreate'] = { internal: orderedInternalInteractionHandlers, user: [] };
  }


  // Register listeners and collect initializers from event files
  for (const [eventName, files] of Object.entries(eventMap)) {
    const orderedFiles = [...files.internal, ...files.user];
    if (orderedFiles.length === 0) continue;

    console.log(`Registering ${eventName} event with handlers:`, orderedFiles.map(f => path.relative(projectRoot, f)));

    client.on(eventName, async (...args) => {
      const interactionOrEvent = args[0];
      for (const eventFile of orderedFiles) {
        try {
          delete require.cache[require.resolve(eventFile)];
          const eventModule = require(eventFile);
          const handler = eventModule.default || eventModule;

          // Collect Initializer from Event Module
          if (handler && typeof handler.initialize === 'function') {
            if (!modulesToInitialize.some(mod => mod === handler)) {
              modulesToInitialize.push(handler);
            }
          } else if (eventModule.default && typeof eventModule.default.initialize === 'function') {
             if (!modulesToInitialize.some(mod => mod === eventModule.default)) {
                modulesToInitialize.push(eventModule.default);
             }
          }

          // Execute handler
          let actualHandler = handler;
          if (typeof handler === 'object' && handler !== null && typeof handler.default === 'function') {
             actualHandler = handler.default;
          } else if (typeof eventModule === 'function') {
             actualHandler = eventModule;
          }

          if (typeof actualHandler === "function") {
            await actualHandler(client, ...args);
          } else if (!eventFile.includes('registerCommands.')) {
            console.error(`Error: ${eventFile} does not export a default function or compatible object. Type: ${typeof actualHandler}`);
          }
        } catch (error) {
          console.error(`Error executing or processing event handler ${eventFile} for event ${eventName}:`, error);
          if (interactionOrEvent && typeof (interactionOrEvent as Interaction).isRepliable === 'function' && (interactionOrEvent as Interaction).isRepliable()) {
            try {
              if ((interactionOrEvent as Interaction & { replied: boolean; deferred: boolean }).replied || (interactionOrEvent as Interaction & { replied: boolean; deferred: boolean }).deferred) {
                await (interactionOrEvent as Interaction & { followUp: Function }).followUp({ content: 'An error occurred while processing your request.', flags: MessageFlags.Ephemeral }).catch(() => { });
              } else {
                await (interactionOrEvent as Interaction & { reply: Function }).reply({ content: 'An error occurred while processing your request.', flags: MessageFlags.Ephemeral }).catch(() => { });
              }
            } catch (replyError) {
              // Ignore
            }
          }
        }
      }
    });
  }
}

/**
 * Collects command modules that have an initialize function.
 */
function collectCommandInitializers() {
  const commandsBaseDir = path.join(projectRoot, scanRoot, 'commands');

  function findInitializersRecursive(directory: string) {
    const filesInDir = getAllFiles(directory, false);
    for (const file of filesInDir) {
      if (file.split(path.sep).includes('disabled')) continue;
      try {
        delete require.cache[require.resolve(file)];
        const commandModule = require(file);
        const initializer = commandModule?.initialize || commandModule?.default?.initialize;
        if (typeof initializer === 'function') {
           const moduleToStore = commandModule?.initialize ? commandModule : commandModule.default;
           if (moduleToStore && !modulesToInitialize.some(mod => mod === moduleToStore)) {
              modulesToInitialize.push(moduleToStore);
           }
        }
      } catch (error) { console.error(`Error loading file for command initializers ${file}:`, error); }
    }
    const subDirs = getAllFiles(directory, true);
    for (const subDir of subDirs) {
      if (path.basename(subDir) === 'disabled' || subDir.split(path.sep).includes('disabled')) continue;
      findInitializersRecursive(subDir);
    }
  }

  try {
    if (!fs.existsSync(commandsBaseDir)) { return; }
    findInitializersRecursive(commandsBaseDir);
  } catch (error) { console.error(`[Initializer] Error scanning commands directory ${commandsBaseDir} for initializers:`, error); }

}

/**
 * Runs all collected initialize functions.
 */
function runInitializers(client: Client) {
  console.log(`[Initializer] Running initialization for ${modulesToInitialize.length} modules...`);
  if (modulesToInitialize.length === 0) { return; }
  for (const module of modulesToInitialize) {
    let moduleName = module?.name || module?.default?.name || 'Unnamed Module';
    try {
      module.initialize(client);
    } catch (error) {
      console.error(`[Initializer] Error running initialize function for module: ${moduleName}`, error);
    }
  }
  console.log(`[Initializer] Initialization complete.`);
}


/**
 * Main function that initializes the client.
 */
async function main() {
  const commandsDirRelative = path.join(scanRoot, 'commands');
  const internalEventsDirRelative = path.join(scanRoot, 'internalSetup', 'events');
  const userEventsDirRelative = path.join(scanRoot, 'events');
  const commandIntents = collectRequiredIntents(commandsDirRelative);
  const internalEventIntents = collectRequiredIntents(internalEventsDirRelative);
  const userEventIntents = collectRequiredIntents(userEventsDirRelative);
  const requiredIntents = mergeIntents(commandIntents, internalEventIntents, userEventIntents);
  const defaultIntents = [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions ];
  const intents = requiredIntents.length > 0 ? requiredIntents : defaultIntents;
  const finalIntents = intents.map(intent => typeof intent === 'string' ? GatewayIntentBits[intent as keyof typeof GatewayIntentBits] : intent).filter(i => typeof i === 'number');
  const intentsList = finalIntents.map((i) => { const n = Object.entries(GatewayIntentBits).find(([_,v])=>v===i)?.[0]; return n||i; });
  console.log('Logging in with intents:', intentsList);

  const client = new Client({ intents: finalIntents });

  client.buttonHandlers = new Map<string, RegisteredButtonInfo>();
  client.dropdownHandlers = new Map<string, RegisteredDropdownInfo>();
  client.modalHandlers = new Map<string, RegisteredModalInfo>();
  client.reactionHandlers = new Map<string, RegisteredReactionInfo>();

  collectCommandInitializers();
  await loadEventHandlers(client);
  runInitializers(client);

  client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}!`);
  });

  client.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);
