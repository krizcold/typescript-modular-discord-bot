import path from 'path';
import getAllFiles from './getAllFiles'; // Use the non-recursive version

/**
 * Scans the commands folder recursively and returns an array of command objects,
 * excluding any whose names appear in the exceptions list or are in 'disabled' folders.
 *
 * @param exceptions - A list of command names to exclude.
 * @returns An array of command objects.
 */
export default function getLocalCommands(exceptions: string[] = []): any[] {
  const localCommands: any[] = [];
  const commandsBaseDir = path.join(__dirname, '..', '..', 'commands'); // Path to src/commands

  console.log(`[getLocalCommands] Starting scan in: ${commandsBaseDir}`);

  // Recursive function to process directories
  function findCommandsRecursive(directory: string) {
    // Get immediate files (.ts/.js) in the current directory
    const filesInDir = getAllFiles(directory, false); // false = get files

    for (const commandFile of filesInDir) {
      // Skip disabled files based on path segment
      if (commandFile.split(path.sep).includes('disabled')) {
        continue;
      }

      // Process the command file
      try {
        delete require.cache[require.resolve(commandFile)];
        const commandObject = require(commandFile);

        if (Array.isArray(commandObject)) {
          for (const cmd of commandObject) {
            if (cmd && cmd.name && !exceptions.includes(cmd.name)) {
              // console.log(`[getLocalCommands] Adding command "${cmd.name}" from array in ${path.basename(commandFile)}`);
              localCommands.push(cmd);
            }
          }
        } else if (commandObject && commandObject.name && !exceptions.includes(commandObject.name)) {
          // console.log(`[getLocalCommands] Adding command "${commandObject.name}" from ${path.basename(commandFile)}`);
          localCommands.push(commandObject);
        } else if (!commandObject?.name) {
           console.warn(`[getLocalCommands] Command file ${path.basename(commandFile)} is missing a 'name' or exported incorrectly.`);
        }
      } catch (error) {
        console.error(`[getLocalCommands] Error requiring command file ${commandFile}:`, error);
      }
    }

    // Get immediate subdirectories in the current directory
    const subDirs = getAllFiles(directory, true); // true = get folders
    for (const subDir of subDirs) {
      // Skip disabled folders
      if (path.basename(subDir) === 'disabled' || subDir.split(path.sep).includes('disabled')) {
         console.log(`[getLocalCommands:Recursive] Skipping disabled subdir: ${subDir}`); // <<< ADDED DEBUG LOG
        continue;
      }
      // Recurse into the subdirectory
      findCommandsRecursive(subDir);
    }
  }

  // Start the recursive scan from the base commands directory
  findCommandsRecursive(commandsBaseDir);

  // Log final results
  const finalNames = localCommands.map(cmd => cmd.name);
  console.log(`[getLocalCommands] Final collected command names:`, finalNames);
  if (new Set(finalNames).size !== finalNames.length) {
      console.warn(`[getLocalCommands] WARNING: Duplicate command names detected in the final list! Check file structure or command definitions.`);
  }
  console.log(`[getLocalCommands] Found ${localCommands.length} valid command definitions.`);
  return localCommands;
}
