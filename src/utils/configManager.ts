// src/utils/configManager.ts
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.resolve(__dirname, '../../config.json');

/**
 * Ensures the config.json file exists. If not, creates an empty one.
 */
function ensureConfigFile(): void {
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({}, null, 2), 'utf-8');
  }
}

/**
 * Retrieves a property from the config file. If the property doesn't exist,
 * it is set to the provided default value and saved.
 *
 * @param property The property name (as a string key)
 * @param defaultValue The default value to use if the property is missing
 * @returns The value of the property from the config file.
 */
export function getConfigProperty<T>(property: string, defaultValue: T): T {
  ensureConfigFile();
  const configRaw = fs.readFileSync(configPath, 'utf-8');
  let config;
  try {
    config = JSON.parse(configRaw);
  } catch (e) {
    config = {};
  }

  if (config[property] === undefined) {
    // Save the default value in the config file
    config[property] = defaultValue;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return defaultValue;
  }
  return config[property];
}
