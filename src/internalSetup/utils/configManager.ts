import * as fs from 'fs';
import * as path from 'path';
// Import renamed types
import { ChatResponseConfig, ChatResponseInstanceConfig } from '../../types/commandTypes';

const rootConfigPath = path.resolve(__dirname, '../../config.json');
const configDataDir = path.resolve(__dirname, '../../configData');
// Rename path variable
const chatResponseConfigPath = path.join(configDataDir, 'chatResponseConfig.json');

/**
 * Ensures a specific config file exists in a given directory. If not, creates an empty one.
 */
function ensureConfigFile(dirPath: string, filePath: string, defaultContent: string = '{}'): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, defaultContent, 'utf-8');
    console.log(`[ConfigManager] Created default config file: ${path.relative(path.resolve(__dirname, '../..'), filePath)}`);
  }
}

/**
 * Reads a JSON config file.
 */
function readConfigFile<T>(filePath: string, defaultValue: T): T {
  if (!fs.existsSync(filePath)) {
    return defaultValue;
  }
  try {
    const configRaw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(configRaw || JSON.stringify(defaultValue));
  } catch (e) {
    console.error(`[ConfigManager] Error reading/parsing ${path.basename(filePath)}:`, e);
    return defaultValue;
  }
}

/**
 * Retrieves a property from the ROOT config file (config.json).
 */
export function getConfigProperty<T>(property: string, defaultValue: T): T {
  ensureConfigFile(path.dirname(rootConfigPath), rootConfigPath);
  const config = readConfigFile(rootConfigPath, { [property]: defaultValue });

  if (config[property] === undefined) {
    config[property] = defaultValue;
    try {
      fs.writeFileSync(rootConfigPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
        console.error(`[ConfigManager] Error writing default property '${property}' to ${path.basename(rootConfigPath)}:`, e);
    }
    return defaultValue;
  }
  return config[property];
}


/**
 * Loads the entire ChatResponse configuration from src/configData/chatResponseConfig.json.
 * Creates a default empty file if it doesn't exist.
 * @param defaultValue The default value (usually an empty object) if the file is missing or invalid.
 * @returns The loaded ChatResponse configuration object.
 */
 // Rename function and update types/paths
export function getChatResponseConfig(defaultValue: ChatResponseConfig = {}): ChatResponseConfig {
    ensureConfigFile(configDataDir, chatResponseConfigPath, JSON.stringify(defaultValue, null, 2));
    return readConfigFile<ChatResponseConfig>(chatResponseConfigPath, defaultValue);
}
