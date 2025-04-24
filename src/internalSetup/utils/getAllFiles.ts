import * as fs from 'fs';
import * as path from 'path';

/**
 * Recursively gets all files in a directory (non-recursive version).
 * If foldersOnly is true, returns only directories inside the given directory.
 */
export default function getAllFiles(directory: string, foldersOnly = false): string[] {
  let fileNames: string[] = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (foldersOnly) {
      if (entry.isDirectory()) {
        fileNames.push(entryPath);
      }
    } else {
      if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        fileNames.push(entryPath);
      }
    }
  }
  return fileNames;
}
