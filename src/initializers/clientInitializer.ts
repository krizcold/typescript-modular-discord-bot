import { Client, GatewayIntentBits } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import getAllFiles from '../utils/getAllFiles';
import 'dotenv/config';

/**
 * Collects all required intents from files in a given directory.
 * Each file may export a property `requiredIntents` (an array of numbers).
 */
function collectRequiredIntents(directory: string): number[] {
  const folders = getAllFiles(directory, true);
  const intents: number[] = [];

  for (const folder of folders) {
    if (folder.includes('data')) continue; // Ignore "data" folders
    if (folder.includes('disabled')) continue; // Ignore "disabled" folders

    const files = getAllFiles(folder);

    for (const file of files) {
      try {
        const mod = require(file);
        if (mod.requiredIntents && Array.isArray(mod.requiredIntents)) {
          for (const intent of mod.requiredIntents) {
            if (!intents.includes(intent)) {
              intents.push(intent);
            }
          }
        }
      } catch (error) {
        console.error(`Error loading file ${file}:`, error);
      }
    }
  }


  return intents;
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
 * Loads and registers event handlers.
 * For each subdirectory in the events folder (ignoring any named 'data'),
 * it reads the event files and registers a listener.
 */
async function registerEvents(client: Client) {
  console.log("Registering events...");
  const eventsDir = path.join(__dirname, '..', 'events');
  const eventFolders = getAllFiles(eventsDir, true);

  const eventMap: Record<string, string[]> = {}; // Stores events per event type (ready, interactionCreate, etc.)

  // Scan all event folders
  for (const folder of eventFolders) {
    if (folder.includes('data')) continue; // Ignore "data" folders

    const eventFiles = getAllFiles(folder);
    eventFiles.sort((a, b) => a.localeCompare(b)); // Sort files alphabetically
    const eventName = path.basename(folder);

    // Store event files inside eventMap
    eventMap[eventName] = eventFiles;
  }

  // Ensure "ready" events exist & force `registerCommands.ts` as the first one
  if (!eventMap['ready']) {
    eventMap['ready'] = [];
  }
  const commandInitFile = path.join(__dirname, 'registerCommands.js');
  eventMap['ready'].unshift(commandInitFile); // Ensure it's the first file in "ready"

  //console.log("Final event execution order:", eventMap);

  // Register each event type
  for (const [eventName, eventFiles] of Object.entries(eventMap)) {
    client.on(eventName, async (...args) => {
      for (const eventFile of eventFiles) {
        try {
          const eventModule = require(eventFile);
          if (typeof eventModule.default === "function") {
              await eventModule.default(client, ...args);
          } else {
              console.error(`Error: ${eventFile} does not export a default function.`);
          }
        } catch (error) {
          console.error(`Error in event ${eventName} from file ${eventFile}:`, error);
        }
      }
    });
  }
}




/**
 * Main function that initializes the client:
 * - It scans events and commands for required intents,
 * - Merges them with defaults if necessary,
 * - Creates the Discord client with those intents,
 * - Registers events and commands,
 * - And finally logs in.
 */
async function main() {
  // Directories to scan for intents
  const eventsDir = path.join(__dirname, '..', 'events');
  const commandsDir = path.join(__dirname, '..', 'commands');

  const eventIntents = collectRequiredIntents(eventsDir);
  const commandIntents = collectRequiredIntents(commandsDir);

  console.log("Event intents:", eventIntents);
  console.log("Command intents:", commandIntents);

  // Merge required intents (deduplicated)
  const requiredIntents = mergeIntents(eventIntents, commandIntents);

  // Fallback default intents if none are found:
  const defaultIntents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ];

  const intents = requiredIntents.length > 0 ? requiredIntents : defaultIntents;

  const intentsList = intents.map((i) => GatewayIntentBits[i]);

  console.log('Logging in with intents:', intentsList);

  // Create the client with the collected intents
  const client = new Client({ intents });

  // Register events and commands
  await registerEvents(client);

  client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}!`);
  });

  client.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);
