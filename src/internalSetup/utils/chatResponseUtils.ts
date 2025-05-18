import { Message, PermissionsBitField } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import getLocalCommands from './getLocalCommands';

// --- Cooldown Management (In-Memory) ---

interface CooldownInfo {
  charges: number;
  lastReplenish: number;
  itemLimits?: Map<string, number>;
  itemLastUsed?: Map<string, number>;
}
const cooldowns = new Map<string, CooldownInfo>();

export function checkCooldown(
  id: string,
  reloadMinutes: number,
  maxCharges: number,
  itemIdentifier?: string,
  itemMax?: number,
  itemReloadMinutes?: number
): boolean {
  const now = Date.now();
  const reloadMillis = reloadMinutes * 60 * 1000;

  if (!cooldowns.has(id)) {
    cooldowns.set(id, {
      charges: maxCharges,
      lastReplenish: now,
      itemLimits: itemIdentifier ? new Map<string, number>() : undefined,
      itemLastUsed: itemIdentifier ? new Map<string, number>() : undefined,
    });
  }

  const cd = cooldowns.get(id)!;

  const elapsed = now - cd.lastReplenish;
  const chargesToAdd = Math.floor(elapsed / reloadMillis);
  if (chargesToAdd > 0) {
    cd.charges = Math.min(maxCharges, cd.charges + chargesToAdd);
    cd.lastReplenish = cd.lastReplenish + chargesToAdd * reloadMillis;
  }

  if (itemIdentifier && itemMax !== undefined && itemReloadMinutes !== undefined) {
    const itemReloadMillis = itemReloadMinutes * 60 * 1000;
    const currentItemCount = cd.itemLimits?.get(itemIdentifier) || 0;
    const lastUsedTimestamp = cd.itemLastUsed?.get(itemIdentifier) || 0;

    if (currentItemCount >= itemMax && now < lastUsedTimestamp + itemReloadMillis) {
      return false;
    }
    if (currentItemCount >= itemMax && now >= lastUsedTimestamp + itemReloadMillis) {
        cd.itemLimits?.set(itemIdentifier, 0);
    }
  }

  if (cd.charges <= 0) {
    return false;
  }

  cd.charges--;

  if (itemIdentifier && itemMax !== undefined && itemReloadMinutes !== undefined) {
      const newItemCount = (cd.itemLimits?.get(itemIdentifier) || 0) + 1;
      cd.itemLimits?.set(itemIdentifier, newItemCount);
      if (newItemCount >= itemMax) {
          cd.itemLastUsed?.set(itemIdentifier, now);
      }
  }

  return true;
}


// --- Channel Restriction ---

export function isChannelAllowed(message: Message, allowedChannelIds: string[]): boolean {
  if (!allowedChannelIds || allowedChannelIds.length === 0) {
    return true;
  }
  return allowedChannelIds.includes(message.channel.id);
}


// --- User Response Limit (JSON based) ---

const runtimeDataDir = path.resolve(__dirname, '../../events/data');
const userResponseDataPath = path.join(runtimeDataDir, 'userResponseData.json');

interface UserResponseData {
  [responseType: string]: {
    [guildId: string]: {
      [userId: string]: number;
    }
  }
}

function ensureUserDataFile(): void {
  if (!fs.existsSync(runtimeDataDir)) {
    fs.mkdirSync(runtimeDataDir, { recursive: true });
  }
  if (!fs.existsSync(userResponseDataPath)) {
    fs.writeFileSync(userResponseDataPath, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function loadUserData(): UserResponseData {
  ensureUserDataFile();
  try {
    const rawData = fs.readFileSync(userResponseDataPath, 'utf-8');
    return JSON.parse(rawData || '{}');
  } catch (error) {
    console.error("Error loading user response data:", error);
    return {};
  }
}

function saveUserData(data: UserResponseData): void {
  ensureUserDataFile();
  try {
    fs.writeFileSync(userResponseDataPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error("Error saving user response data:", error);
  }
}

export function checkUserLimit(
  responseType: string, // Keep generic, specific ID generated in chatResponseManager
  userId: string,
  maxPerUser: number,
  scopeId: string,
  resetMinutes?: number
): boolean {
    if (maxPerUser <= 0) return true;

    const userData = loadUserData();
    const now = Date.now();
    const resetMillis = resetMinutes ? resetMinutes * 60 * 1000 : 0;

    if (!userData[responseType]) userData[responseType] = {};
    if (!userData[responseType][scopeId]) userData[responseType][scopeId] = {};

    const userTimestamp = userData[responseType][scopeId][userId] || 0;

    if (resetMillis > 0) {
        if (userTimestamp > 0 && now < userTimestamp + resetMillis) {
            return false;
        }
        userData[responseType][scopeId][userId] = now;
        saveUserData(userData);
        return true;
    } else {
        if (userTimestamp > 0) {
            return false;
        }
        userData[responseType][scopeId][userId] = now;
        saveUserData(userData);
        return true;
    }
}

// --- ChatResponse Data Loading ---
const configDataDir = path.resolve(__dirname, '../../configData');
const chatResponseDataPath = path.join(configDataDir, 'chatResponseData.json'); // Renamed path variable

// Renamed interface
interface ChatResponseData {
  [key: string]: any[];
}

let cachedChatResponseData: ChatResponseData | null = null; // Renamed cache variable
let lastReadTimestamp: number = 0;

// Renamed loading function
function loadChatResponseDataFile(): ChatResponseData {
  let currentTimestamp = 0;
  try {
      if (fs.existsSync(chatResponseDataPath)) { // Use renamed path
          currentTimestamp = fs.statSync(chatResponseDataPath).mtimeMs;
      }
  } catch (_) { /* ignore */ }

  if (!cachedChatResponseData || currentTimestamp > lastReadTimestamp) { // Use renamed cache variable
    console.log('[ChatResponseData] Reloading chatResponseData.json from configData...'); // Updated log
    if (!fs.existsSync(configDataDir)) {
        fs.mkdirSync(configDataDir, { recursive: true });
    }
    if (!fs.existsSync(chatResponseDataPath)) { // Use renamed path
      console.warn(`[ChatResponseData] Data file not found: ${chatResponseDataPath}. Creating empty file.`); // Updated log
      fs.writeFileSync(chatResponseDataPath, JSON.stringify({}, null, 2), 'utf-8');
      cachedChatResponseData = {}; // Update renamed cache variable
    } else {
      try {
        const rawData = fs.readFileSync(chatResponseDataPath, 'utf-8'); // Use renamed path
        cachedChatResponseData = JSON.parse(rawData || '{}'); // Update renamed cache variable
      } catch (error) {
        console.error(`Error reading or parsing data file ${chatResponseDataPath}:`, error); // Use renamed path
        cachedChatResponseData = cachedChatResponseData || {}; // Update renamed cache variable
      }
    }
    lastReadTimestamp = currentTimestamp || Date.now();
  }

  return cachedChatResponseData!; // Return renamed cache variable
}

/**
 * Gets a specific list from the chatResponseData file.
 */
 // Renamed getter function
export function getChatResponseList<T = any>(listKey: string): T[] {
  const data = loadChatResponseDataFile(); // Use renamed loader
  const list = data[listKey];
  return Array.isArray(list) ? list as T[] : [];
}


// --- Text Matching ---

export function findMatchingPhrase(
  content: string,
  phrases: string[],
  mode: 'exact' | 'word' | 'contains' | 'startsWith' = 'word'
): string | null {
  if (!phrases || phrases.length === 0) return null;

  const lowerContent = content.toLowerCase();

  for (const phrase of phrases) {
    const lowerPhrase = phrase.toLowerCase();
    if (!lowerPhrase) continue;

    switch (mode) {
      case 'exact':
        if (lowerContent === lowerPhrase) return phrase;
        break;
      case 'contains':
        if (lowerContent.includes(lowerPhrase)) return phrase;
        break;
      case 'startsWith':
        if (lowerContent.startsWith(lowerPhrase)) return phrase;
        break;
      case 'word':
      default:
        const escapedPhrase = lowerPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?<![\\w:])${escapedPhrase}(?![\\w:])`, 'i');
        if (regex.test(content)) return phrase;
        break;
    }
  }
  return null;
}

// --- Command Permission Check ---

let localCommandsCache: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000;

// Renamed getter function
export function getCachedLocalCommands(): any[] {
    const now = Date.now();
    if (!localCommandsCache || now - cacheTimestamp > CACHE_DURATION) {
        const commandsSets = getLocalCommands();
        localCommandsCache = [];
        commandsSets.forEach((commands: any) => {
            if (Array.isArray(commands)) {
                localCommandsCache = [...localCommandsCache!, ...commands];
            } else if (commands) {
                localCommandsCache!.push(commands);
            }
        });
        cacheTimestamp = now;
    }
    return localCommandsCache!;
}

/**
 * Checks if the message author has the required permissions to run a specific command.
 */
export function checkCommandPermissions(message: Message, commandName: string): boolean {
  if (!message.member) return false;

  const localCommands = getCachedLocalCommands();
  const commandObject = localCommands.find(cmd => cmd.name === commandName);

  if (!commandObject) {
    console.warn(`[checkCommandPermissions] Command '${commandName}' not found locally.`);
    return false;
  }

   if (commandObject.testOnly && message.guild?.id !== process.env.GUILD_ID) {
       return false;
   }

  if (commandObject.devOnly) {
      const devs = process.env.DEVS?.split(',') || [];
      if (!devs.includes(message.author.id)) {
        return false;
      }
  }

  if (commandObject.permissionsRequired?.length) {
    for (const permission of commandObject.permissionsRequired) {
      try {
        const permFlag = PermissionsBitField.resolve(permission as any);
         if (!message.member.permissions.has(permFlag)) {
            return false;
        }
      } catch (e) {
         console.error(`[checkCommandPermissions] Invalid permission '${permission}' defined for command '${commandName}'.`);
         return false;
      }
    }
  }

  return true;
}
