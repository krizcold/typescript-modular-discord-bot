import { Client, GatewayIntentBits } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
// Updated import path for getAllFiles
import getAllFiles from './utils/getAllFiles';
import 'dotenv/config';

// Assuming __dirname resolves correctly relative to the new location
// Adjust if necessary based on your build process (e.g., using process.cwd())
const basePath = path.join(__dirname, '..'); // Navigate up from internalSetup to src level

const isProd = process.env.NODE_ENV === 'development' ? false : true;

/**
 * Collects all required intents from files in specified directories.
 */
function collectRequiredIntents(...directories: string[]): number[] {
  const intents = new Set<number>();
  for (const directory of directories) {
    try {
      const folders = getAllFiles(directory, true); // Get subfolders
      for (const folder of folders) {
        if (folder.includes('data') || folder.includes('disabled')) continue;

        const files = getAllFiles(folder); // Get files in subfolder
        for (const file of files) {
          try {
            const mod = require(file);
            if (mod.requiredIntents && Array.isArray(mod.requiredIntents)) {
              mod.requiredIntents.forEach((intent: number) => intents.add(intent));
            }
          } catch (error) {
            console.error(`Error loading file for intents ${file}:`, error);
          }
      }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory for intents ${directory}. Skipping. Error: ${(error as Error).message}`);
    }
  }
  return Array.from(intents);
}


/**
 * Merge multiple arrays of intents into one, removing duplicates.
 */
function mergeIntents(...intentArrays: number[][]): number[] {
  const merged = new Set<number>();
  for (const arr of intentArrays) {
    for (const i of arr) {
      merged.add(i);
    }
  }
  return Array.from(merged);
}

/**
 * Loads and registers event handlers from both internalSetup and user events folders,
 * ensuring internal handlers run first.
 */
async function registerEvents(client: Client) {
  // Define paths relative to the base src directory
  const internalEventsDir = path.join(basePath, 'internalSetup', 'events');
  const userEventsDir = path.join(basePath, 'events');

  console.log("Registering events...");
  console.log(`Scanning internal events directory: ${internalEventsDir}`);
  console.log(`Scanning user events directory: ${userEventsDir}`);

  const internalEventFolders = fs.existsSync(internalEventsDir) ? getAllFiles(internalEventsDir, true) : [];
  const userEventFolders = fs.existsSync(userEventsDir) ? getAllFiles(userEventsDir, true) : [];

  // Combine folder paths and get unique event names
  const allEventFolderPaths = [...internalEventFolders, ...userEventFolders];
  const uniqueEventNames = [...new Set(allEventFolderPaths.map(folder => path.basename(folder)))];

  const eventMap: Record<string, { internal: string[], user: string[] }> = {};

  // Initialize map structure for each unique event
  uniqueEventNames.forEach(eventName => {
    eventMap[eventName] = { internal: [], user: [] };
  });

  // Populate the map with internal event files
  for (const folder of internalEventFolders) {
    const eventName = path.basename(folder);
    if (folder.includes('data') || folder.includes('disabled')) continue;
    const eventFiles = getAllFiles(folder);
    eventMap[eventName].internal.push(...eventFiles);
    eventMap[eventName].internal.sort((a, b) => a.localeCompare(b)); // Sort internal files
  }

  // Populate the map with user event files
  for (const folder of userEventFolders) {
    const eventName = path.basename(folder);
      if (folder.includes('data') || folder.includes('disabled')) continue;
    const eventFiles = getAllFiles(folder);
    eventMap[eventName].user.push(...eventFiles);
    eventMap[eventName].user.sort((a, b) => a.localeCompare(b)); // Sort user files
  }

  // Special handling for 'ready' event to ensure registerCommands runs first
  const commandInitFile = path.join(internalEventsDir, 'ready', isProd ? 'registerCommands.js' : 'registerCommands.ts');
  if (eventMap['ready']) {
    // Remove it if it exists in the list to avoid duplicates
    eventMap['ready'].internal = eventMap['ready'].internal.filter(file => file !== commandInitFile);
    // Add it to the very beginning of internal ready events
    eventMap['ready'].internal.unshift(commandInitFile);
  } else {
      eventMap['ready'] = { internal: [commandInitFile], user: [] };
  }


  // Register combined listeners for each event type
  for (const [eventName, files] of Object.entries(eventMap)) {
    // Combine internal and user files, internal first
    const orderedFiles = [...files.internal, ...files.user];

    if(orderedFiles.length === 0) continue; // Skip if no handlers for this event

    console.log(`Registering ${eventName} event with handlers:`, orderedFiles.map(f => path.relative(basePath, f)));

    client.on(eventName, async (...args) => {
      for (const eventFile of orderedFiles) {
        try {
          const eventModule = require(eventFile);
          // Use default export if available, otherwise named export 'default'
          const handler = eventModule.default || eventModule;
          if (typeof handler === "function") {
            await handler(client, ...args);
          } else {
            console.error(`Error: ${eventFile} does not export a default function or named 'default'.`);
          }
        } catch (error) {
          console.error(`Error executing event handler ${eventFile} for event ${eventName}:`, error);
        }
      }
    });
  }
}


/**
 * Main function that initializes the client.
 */
async function main() {
  // Define paths relative to the base src directory
  const commandsDir = path.join(basePath, 'commands');
  const internalEventsDir = path.join(basePath, 'internalSetup', 'events');
  const userEventsDir = path.join(basePath, 'events');


  // Collect intents from all relevant directories
  const commandIntents = collectRequiredIntents(commandsDir);
  const internalEventIntents = collectRequiredIntents(internalEventsDir);
  const userEventIntents = collectRequiredIntents(userEventsDir);


  console.log("Command intents:", commandIntents);
  console.log("Internal Event intents:", internalEventIntents);
  console.log("User Event intents:", userEventIntents);

  // Merge required intents
  const requiredIntents = mergeIntents(commandIntents, internalEventIntents, userEventIntents);

  // Fallback default intents
  const defaultIntents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ];

  const intents = requiredIntents.length > 0 ? requiredIntents : defaultIntents;
  const intentsList = intents.map((i) => GatewayIntentBits[i] || i); // Handle potential raw numbers

  console.log('Logging in with intents:', intentsList);

  // Create the client
  const client = new Client({ intents });

  // Register events (internal first, then user)
  await registerEvents(client);

  client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}!`);
  });

  client.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);
