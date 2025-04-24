import path from 'path';
import getAllFiles from './getAllFiles';

/**
 * Scans the commands folder and returns an array of command objects,
 * excluding any whose names appear in the exceptions list.
 *
 * @param exceptions - A list of command names to exclude.
 * @returns An array of command objects.
 */
export default function getLocalCommands(exceptions: string[] = []): any[] {
  const localCommands: any[] = [];
  const commandsDir = path.join(__dirname, '../../', 'commands');
  const commandCategories = getAllFiles(commandsDir, true);

  for (const commandCategory of commandCategories) {
    if (commandCategory.includes('disabled')) continue;

    const commandFiles = getAllFiles(commandCategory);
    for (const commandFile of commandFiles) {
      const commandObject = require(commandFile);
      // If the command file exports an array, flatten it
      if (Array.isArray(commandObject)) {
        for (const cmd of commandObject) {
          if (!exceptions.includes(cmd.name)) {
            localCommands.push(cmd);
          }
        }
      } else {
        if (!exceptions.includes(commandObject.name)) {
          localCommands.push(commandObject);
        }
      }
    }
  }

  return localCommands;
}
