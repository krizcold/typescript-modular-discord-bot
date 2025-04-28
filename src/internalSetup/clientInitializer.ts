import { Client, GatewayIntentBits, Collection, Interaction, ButtonInteraction } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import getAllFiles from './utils/getAllFiles';
import 'dotenv/config';
import { RegisteredButtonInfo } from '../types/commandTypes';


// Augment the discord.js Client type
declare module 'discord.js' {
  interface Client {
    buttonHandlers: Map<string, RegisteredButtonInfo>;
  }
}

const projectRoot = path.join(__dirname, '..', '..');
const basePath = path.join(projectRoot, 'src');
const isProd = process.env.NODE_ENV === 'development' ? false : true;

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
        if (intentsArray) intentsArray.forEach(intent => intents.add(intent));
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
    // console.log(`[collectRequiredIntents] Starting recursive scan in: ${absoluteDir}`); // DEBUG LOG REMOVED
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
  const internalEventsDir = path.join(projectRoot, 'src', 'internalSetup', 'events');
  const userEventsDir = path.join(projectRoot, 'src', 'events');

  console.log("Loading event handlers..."); // Keep this log

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
    eventMap['ready'].internal.unshift(commandInitFile);
  } else {
    eventMap['ready'] = { internal: [commandInitFile], user: [] };
  }


  // Register listeners and collect initializers from event files
  for (const [eventName, files] of Object.entries(eventMap)) {
    const orderedFiles = [...files.internal, ...files.user];
    if (orderedFiles.length === 0) continue;

    // Keep this log - useful for seeing which handlers are active
    console.log(`Registering ${eventName} event with handlers:`, orderedFiles.map(f => path.relative(projectRoot, f)));

    client.on(eventName, async (...args) => {
      for (const eventFile of orderedFiles) {
        try {
          delete require.cache[require.resolve(eventFile)];
          const eventModule = require(eventFile);
          const handler = eventModule.default || eventModule;

          // Collect Initializer from Event Module
          if (handler && typeof handler.initialize === 'function') {
            if (!modulesToInitialize.some(mod => mod === handler)) {
              // console.log(`[Initializer] Found initialize function in event module: ${path.basename(eventFile)} - Queued.`); // DEBUG LOG REMOVED
              modulesToInitialize.push(handler);
            }
          }

          // Execute handler
          if (typeof handler === "function") {
            await handler(client, ...args);
          } else if (handler && typeof handler.default === 'function') {
            await handler.default(client, ...args);
          } else if (typeof handler !== 'object') {
            console.error(`Error: ${eventFile} does not export a default function or compatible object. Type: ${typeof handler}`);
          }
        } catch (error) {
          console.error(`Error executing or processing event handler ${eventFile} for event ${eventName}:`, error);
        }
      }
    });
  }
}

/**
 * Collects command modules that have an initialize function.
 */
function collectCommandInitializers() {
  // console.log('[Initializer] Starting collection of command initializers...'); // DEBUG LOG REMOVED
  const commandsBaseDir = path.join(projectRoot, 'src', 'commands');

  function findInitializersRecursive(directory: string) {
    const filesInDir = getAllFiles(directory, false);
    for (const file of filesInDir) {
      if (file.split(path.sep).includes('disabled')) continue;
      try {
        delete require.cache[require.resolve(file)];
        const commandModule = require(file);
        if (commandModule && typeof commandModule.initialize === 'function') {
          if (!modulesToInitialize.some(mod => mod === commandModule)) {
            // console.log(`[Initializer] Found initialize function in command module: ${path.basename(file)} - Queued.`); // DEBUG LOG REMOVED
            modulesToInitialize.push(commandModule);
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

  // console.log(`[Initializer] Total modules queued for initialization: ${modulesToInitialize.length}`); // DEBUG LOG REMOVED
}

/**
 * Runs all collected initialize functions.
 */
function runInitializers(client: Client) { // Client is passed in
  console.log(`[Initializer] Running initialization for ${modulesToInitialize.length} modules...`);
  if (modulesToInitialize.length === 0) { return; }
  for (const module of modulesToInitialize) {
    let moduleName = module.name || 'Unnamed Module';
    try {
      module.initialize(client); // Pass client to initialize function
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
  // Collect intents
  const commandsDirRelative = path.join('src', 'commands');
  const internalEventsDirRelative = path.join('src', 'internalSetup', 'events');
  const userEventsDirRelative = path.join('src', 'events');
  const commandIntents = collectRequiredIntents(commandsDirRelative);
  const internalEventIntents = collectRequiredIntents(internalEventsDirRelative);
  const userEventIntents = collectRequiredIntents(userEventsDirRelative);
  // console.log("Command intents:", commandIntents); // DEBUG LOG REMOVED
  // console.log("Internal Event intents:", internalEventIntents); // DEBUG LOG REMOVED
  // console.log("User Event intents:", userEventIntents); // DEBUG LOG REMOVED
  const requiredIntents = mergeIntents(commandIntents, internalEventIntents, userEventIntents);
  const defaultIntents = [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent ];
  const intents = requiredIntents.length > 0 ? requiredIntents : defaultIntents;
  const finalIntents = intents.map(intent => typeof intent === 'string' ? GatewayIntentBits[intent as keyof typeof GatewayIntentBits] : intent).filter(i => typeof i === 'number');
  const intentsList = finalIntents.map((i) => { const n = Object.entries(GatewayIntentBits).find(([_,v])=>v===i)?.[0]; return n||i; });
  console.log('Logging in with intents:', intentsList);

  // Create the client
  const client = new Client({ intents: finalIntents });

  // Initialize the button handler map ON the client
  client.buttonHandlers = new Map<string, RegisteredButtonInfo>();

  // Collect command initializers
  collectCommandInitializers();

  // Load event handlers (also collects initializers from event files)
  await loadEventHandlers(client);

  // Run initializers (passing client so they can access client.buttonHandlers)
  runInitializers(client);

  client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}!`);
  });

  client.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);
