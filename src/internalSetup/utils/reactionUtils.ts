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


// --- User Reaction Limit (JSON based) ---

const runtimeDataDir = path.resolve(__dirname, '../../events/data');
const userReactionDataPath = path.join(runtimeDataDir, 'userReactionData.json');

interface UserReactionData {
  [reactionType: string]: {
    [guildId: string]: {
      [userId: string]: number;
    }
  }
}

function ensureUserDataFile(): void {
  if (!fs.existsSync(runtimeDataDir)) {
    fs.mkdirSync(runtimeDataDir, { recursive: true });
  }
  if (!fs.existsSync(userReactionDataPath)) {
    fs.writeFileSync(userReactionDataPath, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function loadUserData(): UserReactionData {
  ensureUserDataFile();
  try {
    const rawData = fs.readFileSync(userReactionDataPath, 'utf-8');
    return JSON.parse(rawData || '{}');
  } catch (error) {
    console.error("Error loading user reaction data:", error);
    return {};
  }
}

function saveUserData(data: UserReactionData): void {
  ensureUserDataFile();
  try {
    fs.writeFileSync(userReactionDataPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error("Error saving user reaction data:", error);
  }
}

export function checkUserLimit(
  reactionType: string, // Keep generic, specific ID generated in chatReactManager
  userId: string,
  maxPerUser: number,
  scopeId: string,
  resetMinutes?: number
): boolean {
    if (maxPerUser <= 0) return true;

    const userData = loadUserData();
    const now = Date.now();
    const resetMillis = resetMinutes ? resetMinutes * 60 * 1000 : 0;

    if (!userData[reactionType]) userData[reactionType] = {};
    if (!userData[reactionType][scopeId]) userData[reactionType][scopeId] = {};

    const userTimestamp = userData[reactionType][scopeId][userId] || 0;

    if (resetMillis > 0) {
        if (userTimestamp > 0 && now < userTimestamp + resetMillis) {
            return false;
        }
        userData[reactionType][scopeId][userId] = now;
        saveUserData(userData);
        return true;
    } else {
        if (userTimestamp > 0) {
            return false;
        }
        userData[reactionType][scopeId][userId] = now;
        saveUserData(userData);
        return true;
    }
}

// --- ChatReact Data Loading ---
const configDataDir = path.resolve(__dirname, '../../configData');
const chatReactDataPath = path.join(configDataDir, 'chatReactData.json'); // Renamed path variable

// Renamed interface
interface ChatReactData {
  [key: string]: any[];
}

let cachedChatReactData: ChatReactData | null = null; // Renamed cache variable
let lastReadTimestamp: number = 0;

// Renamed loading function
function loadChatReactDataFile(): ChatReactData {
  let currentTimestamp = 0;
  try {
      if (fs.existsSync(chatReactDataPath)) { // Use renamed path
          currentTimestamp = fs.statSync(chatReactDataPath).mtimeMs;
      }
  } catch (_) { /* ignore */ }

  if (!cachedChatReactData || currentTimestamp > lastReadTimestamp) { // Use renamed cache variable
    console.log('[ChatReactData] Reloading chatReactData.json from configData...'); // Updated log
    if (!fs.existsSync(configDataDir)) {
        fs.mkdirSync(configDataDir, { recursive: true });
    }
    if (!fs.existsSync(chatReactDataPath)) { // Use renamed path
      console.warn(`[ChatReactData] Data file not found: ${chatReactDataPath}. Creating empty file.`); // Updated log
      fs.writeFileSync(chatReactDataPath, JSON.stringify({}, null, 2), 'utf-8');
      cachedChatReactData = {}; // Update renamed cache variable
    } else {
      try {
        const rawData = fs.readFileSync(chatReactDataPath, 'utf-8'); // Use renamed path
        cachedChatReactData = JSON.parse(rawData || '{}'); // Update renamed cache variable
      } catch (error) {
        console.error(`Error reading or parsing data file ${chatReactDataPath}:`, error); // Use renamed path
        cachedChatReactData = cachedChatReactData || {}; // Update renamed cache variable
      }
    }
    lastReadTimestamp = currentTimestamp || Date.now();
  }

  return cachedChatReactData!; // Return renamed cache variable
}

/**
 * Gets a specific list from the chatReactData file.
 */
 // Renamed getter function
export function getChatReactList<T = any>(listKey: string): T[] {
  const data = loadChatReactDataFile(); // Use renamed loader
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
