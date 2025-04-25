import { Client, GatewayIntentBits } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
// Updated import path for getAllFiles
import getAllFiles from './utils/getAllFiles'; // Ensure this is the corrected non-recursive version
import 'dotenv/config';

// Base path calculation (adjust if necessary for your build output)
const projectRoot = path.join(__dirname, '..', '..');
const basePath = path.join(projectRoot, 'src');

const isProd = process.env.NODE_ENV === 'development' ? false : true; // Keep using NODE_ENV

/**
 * Collects all required intents recursively from files in specified directories.
 * Expects directory paths relative to the project root.
 */
function collectRequiredIntents(...relativeDirs: string[]): number[] {
  const intents = new Set<number>();

  // Recursive function to find intents in files
  function findIntentsRecursive(directory: string) {
    // console.log(`[findIntentsRecursive] Scanning: ${directory}`); // Debug log

    // Get immediate files (.ts/.js) in the current directory
    const filesInDir = getAllFiles(directory, false); // false = get files
    for (const file of filesInDir) {
      // Skip disabled files based on path segment
      if (file.split(path.sep).includes('disabled')) {
        continue;
      }

      try {
        // Use require with the absolute path
        delete require.cache[require.resolve(file)];
        const mod = require(file);

        // Check for requiredIntents property
        let intentsArray: number[] | undefined;
        if (mod && mod.requiredIntents && Array.isArray(mod.requiredIntents)) {
          intentsArray = mod.requiredIntents;
        } else if (typeof mod === 'object' && mod !== null && mod.default?.requiredIntents && Array.isArray(mod.default.requiredIntents)) {
          intentsArray = mod.default.requiredIntents;
        }

        if (intentsArray) {
           // console.log(`[findIntentsRecursive] Found intents in ${path.basename(file)}:`, intentsArray); // Debug log
          intentsArray.forEach((intent: number) => intents.add(intent));
        }
      } catch (error) {
        console.error(`Error loading file for intents ${file}:`, error);
      }
    }

    // Get immediate subdirectories in the current directory
    const subDirs = getAllFiles(directory, true); // true = get folders
    for (const subDir of subDirs) {
      // Skip disabled folders
      if (path.basename(subDir) === 'disabled' || subDir.split(path.sep).includes('disabled')) {
        continue;
      }
      // Recurse into the subdirectory
      findIntentsRecursive(subDir);
    }
  }

  // --- Main part of collectRequiredIntents ---
  for (const relativeDir of relativeDirs) {
    const absoluteDir = path.join(projectRoot, relativeDir); // Construct absolute path
    console.log(`[collectRequiredIntents] Starting recursive scan in: ${absoluteDir}`);

    try {
      if (!fs.existsSync(absoluteDir)) {
        console.warn(`[collectRequiredIntents] Directory not found: ${absoluteDir}. Skipping.`);
        continue;
      }
      // Start the recursive scan for this base directory
      findIntentsRecursive(absoluteDir);
    } catch (error) {
      console.warn(`Warning: Could not fully scan directory for intents ${absoluteDir}. Skipping. Error: ${(error as Error).message}`);
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
  // Define paths relative to the project root
  const internalEventsDir = path.join(projectRoot, 'src', 'internalSetup', 'events');
  const userEventsDir = path.join(projectRoot, 'src', 'events');

  console.log("Registering events...");
  console.log(`Scanning internal events directory: ${internalEventsDir}`);
  console.log(`Scanning user events directory: ${userEventsDir}`);

  // Get immediate subfolders for event names
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

  // Populate the map with internal event files (non-recursive file search within event folder)
  for (const folder of internalEventFolders) {
    const eventName = path.basename(folder);
    if (folder.includes('data') || folder.includes('disabled')) continue;
    const eventFiles = getAllFiles(folder, false); // Get files directly in this folder
    eventMap[eventName].internal.push(...eventFiles);
    eventMap[eventName].internal.sort((a, b) => a.localeCompare(b)); // Sort internal files
  }

  // Populate the map with user event files (non-recursive file search within event folder)
  for (const folder of userEventFolders) {
    const eventName = path.basename(folder);
    if (folder.includes('data') || folder.includes('disabled')) continue;
    const eventFiles = getAllFiles(folder, false); // Get files directly in this folder
    eventMap[eventName].user.push(...eventFiles);
    eventMap[eventName].user.sort((a, b) => a.localeCompare(b)); // Sort user files
  }

  // Special handling for 'ready' event to ensure registerCommands runs first
  // Use absolute path for require/filtering
  const commandInitFile = path.join(internalEventsDir, 'ready', isProd ? 'registerCommands.js' : 'registerCommands.ts');
  if (eventMap['ready']) {
    eventMap['ready'].internal = eventMap['ready'].internal.filter(file => file !== commandInitFile);
    eventMap['ready'].internal.unshift(commandInitFile);
  } else {
    eventMap['ready'] = { internal: [commandInitFile], user: [] };
  }


  // Register combined listeners for each event type
  for (const [eventName, files] of Object.entries(eventMap)) {
    const orderedFiles = [...files.internal, ...files.user];
    if (orderedFiles.length === 0) continue;

    // Log relative paths for readability
    console.log(`Registering ${eventName} event with handlers:`, orderedFiles.map(f => path.relative(projectRoot, f)));

    client.on(eventName, async (...args) => {
      for (const eventFile of orderedFiles) {
        try {
          delete require.cache[require.resolve(eventFile)]; // Clear cache
          const eventModule = require(eventFile);
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
  // Define paths relative to the project root for collecting intents
  const commandsDirRelative = path.join('src', 'commands');
  const internalEventsDirRelative = path.join('src', 'internalSetup', 'events');
  const userEventsDirRelative = path.join('src', 'events');


  // Collect intents from all relevant directories using relative paths from project root
  const commandIntents = collectRequiredIntents(commandsDirRelative);
  const internalEventIntents = collectRequiredIntents(internalEventsDirRelative);
  const userEventIntents = collectRequiredIntents(userEventsDirRelative);


  console.log("Command intents:", commandIntents); // Should now show values
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
  // Ensure conversion to number if needed, handle potential strings/enums
  const finalIntents = intents.map(intent => typeof intent === 'string' ? GatewayIntentBits[intent as keyof typeof GatewayIntentBits] : intent).filter(i => typeof i === 'number');
  const intentsList = finalIntents.map((i) => {
    const intentName = Object.entries(GatewayIntentBits).find(([key, value]) => value === i)?.[0];
    return intentName || i; // Show name if found, otherwise number
  });


  console.log('Logging in with intents:', intentsList);

  // Create the client
  const client = new Client({ intents: finalIntents }); // Pass the numeric intents

  // Register events (internal first, then user)
  await registerEvents(client);

  client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}!`);
  });

  client.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);
