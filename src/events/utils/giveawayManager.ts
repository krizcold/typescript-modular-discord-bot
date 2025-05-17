import * as fs from 'fs';
import * as path from 'path';
import { Giveaway } from '../../types/commandTypes';
import { randomUUID } from 'crypto';
import {
  Client,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  TextBasedChannel,
  User,
  ChannelType,
  Colors
} from 'discord.js';

const dataDir = path.resolve(__dirname, '../data');
const giveawaysFilePath = path.join(dataDir, 'giveaways.json');
const userGiveawayDataPath = path.join(dataDir, 'userGiveawayData.json');

let giveawaysCache: Giveaway[] = [];
let cacheLoaded = false;
const activeTimers = new Map<string, NodeJS.Timeout>();

const GW_CLAIM_PRIZE_BTN_PREFIX = 'gw_claim_prize_btn';

type DefinitelySendableChannel = TextBasedChannel & { type: ChannelType.GuildText | ChannelType.DM | ChannelType.GuildNews | ChannelType.GuildNewsThread | ChannelType.GuildPublicThread | ChannelType.GuildPrivateThread | ChannelType.GuildVoice };

function isChannelDefinitelySendable(channel: any): channel is DefinitelySendableChannel {
  if (!channel) return false;
  return typeof channel.send === 'function' &&
         channel.isTextBased() &&
         !channel.partial &&
         channel.type !== ChannelType.GuildStageVoice;
}

interface UserGiveawayEntry {
    triviaAttemptsMade?: number;
}
interface UserGiveawayData {
    [giveawayId: string]: {
        [userId: string]: UserGiveawayEntry;
    }
}

function ensureUserGiveawayDataFile(): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(userGiveawayDataPath)) {
    fs.writeFileSync(userGiveawayDataPath, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function loadUserGiveawayData(): UserGiveawayData {
  ensureUserGiveawayDataFile();
  try {
    const rawData = fs.readFileSync(userGiveawayDataPath, 'utf-8');
    return JSON.parse(rawData || '{}');
  } catch (error) {
    console.error("[GiveawayManager] Error loading userGiveawayData.json:", error);
    return {};
  }
}

function saveUserGiveawayData(data: UserGiveawayData): void {
  ensureUserGiveawayDataFile();
  try {
    fs.writeFileSync(userGiveawayDataPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error("[GiveawayManager] Error saving userGiveawayData.json:", error);
  }
}

export function getUserTriviaAttempts(giveawayId: string, userId: string): number {
    const data = loadUserGiveawayData();
    return data[giveawayId]?.[userId]?.triviaAttemptsMade || 0;
}

export function incrementUserTriviaAttempts(giveawayId: string, userId: string): number {
    const data = loadUserGiveawayData();
    if (!data[giveawayId]) data[giveawayId] = {};
    if (!data[giveawayId][userId]) data[giveawayId][userId] = { triviaAttemptsMade: 0 };

    data[giveawayId][userId].triviaAttemptsMade = (data[giveawayId][userId].triviaAttemptsMade || 0) + 1;
    saveUserGiveawayData(data);
    return data[giveawayId][userId].triviaAttemptsMade!;
}

function ensureDataFile(): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(giveawaysFilePath)) {
    fs.writeFileSync(giveawaysFilePath, JSON.stringify([]), 'utf-8');
  }
}

function loadGiveaways(forceReload = false): Giveaway[] {
  if (cacheLoaded && !forceReload) {
    return giveawaysCache;
  }
  ensureDataFile();
  try {
    const rawData = fs.readFileSync(giveawaysFilePath, 'utf-8');
    giveawaysCache = JSON.parse(rawData || '[]');
    cacheLoaded = true;
    return giveawaysCache;
  } catch (error) {
    console.error("[GiveawayManager] Error loading giveaways.json:", error);
    giveawaysCache = [];
    cacheLoaded = true;
    return [];
  }
}

function saveGiveaways(): void {
  ensureDataFile();
  try {
    fs.writeFileSync(giveawaysFilePath, JSON.stringify(giveawaysCache, null, 2), 'utf-8');
  } catch (error) {
    console.error("[GiveawayManager] Error saving giveaways.json:", error);
  }
}

export function addGiveaway(giveawayData: Giveaway): Giveaway | null {
  loadGiveaways();
  if (giveawaysCache.some(g => g.id === giveawayData.id)) {
      console.warn(`[GiveawayManager] Attempted to add giveaway with duplicate ID: ${giveawayData.id}.`);
  }
  if (giveawayData.entryMode === 'trivia' && (giveawayData.maxTriviaAttempts === undefined || giveawayData.maxTriviaAttempts === 0)) {
      giveawayData.maxTriviaAttempts = -1;
  }
  giveawaysCache.push(giveawayData);
  saveGiveaways();
  console.log(`[GiveawayManager] Added new giveaway: ${giveawayData.id} (${giveawayData.title})`);
  return giveawayData;
}

export function getGiveaway(giveawayId: string): Giveaway | undefined {
  loadGiveaways();
  return giveawaysCache.find(g => g.id === giveawayId);
}

export function updateGiveaway(giveawayId: string, updatedData: Partial<Giveaway>): boolean {
  loadGiveaways();
  const index = giveawaysCache.findIndex(g => g.id === giveawayId);
  if (index === -1) return false;
  giveawaysCache[index] = { ...giveawaysCache[index], ...updatedData };
  saveGiveaways();
  return true;
}

export function removeGiveaway(giveawayId: string): boolean {
  loadGiveaways();
  const initialLength = giveawaysCache.length;
  giveawaysCache = giveawaysCache.filter(g => g.id !== giveawayId);
  if (activeTimers.has(giveawayId)) {
      clearTimeout(activeTimers.get(giveawayId));
      activeTimers.delete(giveawayId);
  }
  if (giveawaysCache.length < initialLength) {
    saveGiveaways();
    return true;
  }
  return false;
}

export function getAllGiveaways(guildId?: string, activeOnly = false): Giveaway[] {
  loadGiveaways();
  let filtered = giveawaysCache;
  if (guildId) {
    filtered = filtered.filter(g => g.guildId === guildId);
  }
  if (activeOnly) {
    const now = Date.now();
    filtered = filtered.filter(g => !g.ended && !g.cancelled && g.endTime > now);
  }
  return filtered.sort((a, b) => b.startTime - a.startTime);
}

export function addParticipant(giveawayId: string, userId: string): boolean {
    const giveaway = getGiveaway(giveawayId);
    if (!giveaway || giveaway.ended || giveaway.cancelled || giveaway.endTime <= Date.now()) return false;
    if (giveaway.participants.includes(userId)) return false;
    giveaway.participants.push(userId);
    return updateGiveaway(giveawayId, { participants: giveaway.participants });
}

// --- Giveaway Ending Logic ---

async function processEndedGiveaway(client: Client, giveawayId: string): Promise<void> {
    console.log(`[GiveawayManager] Processing end for giveaway ID: ${giveawayId}`);
    const giveaway = getGiveaway(giveawayId);
    if (!giveaway || giveaway.ended || giveaway.cancelled) {
        console.log(`[GiveawayManager] Giveaway ${giveawayId} already ended, cancelled, or not found.`);
        activeTimers.delete(giveawayId);
        return;
    }

    let winners: User[] = [];
    if (giveaway.participants.length > 0) {
        const shuffled = [...giveaway.participants].sort(() => 0.5 - Math.random());
        const winnerIds = shuffled.slice(0, giveaway.winnerCount);
        for (const id of winnerIds) {
            try {
                const user = await client.users.fetch(id);
                winners.push(user);
            } catch (e) {
                console.error(`[GiveawayManager] Failed to fetch winner user ${id} for giveaway ${giveawayId}:`, e);
            }
        }
    }

    updateGiveaway(giveawayId, { ended: true, winners: winners.map(w => w.id) });
    activeTimers.delete(giveawayId);

    try {
        const channel = await client.channels.fetch(giveaway.channelId);

        if (isChannelDefinitelySendable(channel)) {
            const originalMessage = await channel.messages.fetch(giveaway.messageId).catch(() => null);

            const resultEmbed = new EmbedBuilder()
                .setTitle(`🎉 Giveaway Ended: ${giveaway.title} 🎉`)
                .setColor(Colors.Grey); // Use Colors.Grey for ended state

            let winnerMentions = "*No winners were selected (no participants or an error occurred).*";
            if (winners.length > 0) {
                winnerMentions = winners.map(w => w.toString()).join(', ');
                resultEmbed.setDescription(`*Congratulations to ${winnerMentions} for winning **${giveaway.prize}**!*`);
            } else {
                resultEmbed.setDescription('*Unfortunately, there were no participants in this giveaway, so no winner could be chosen.*');
            }
            // Simple, plain text footer for the results message
            resultEmbed.setFooter({ text: `Giveaway Concluded` });


            const claimButton = new ButtonBuilder()
                .setCustomId(`${GW_CLAIM_PRIZE_BTN_PREFIX}_${giveaway.id}`)
                .setLabel('🎁 Claim Prize')
                .setStyle(ButtonStyle.Success)
                .setDisabled(winners.length === 0);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(claimButton);

            const resultMessage = await channel.send({ embeds: [resultEmbed], components: winners.length > 0 ? [row] : [] });

            if (originalMessage) {
                const endedEmbed = EmbedBuilder.from(originalMessage.embeds[0] || new EmbedBuilder())
                    .setDescription(`*This giveaway has ended! [View Results](${resultMessage.url})*`)
                    .setColor(Colors.Grey)
                    .setFields([]) // Clear old fields like "Ends In"
                    .setFooter({text: `Ended`}) // Simple footer for the original message
                    .setTimestamp(giveaway.endTime);
                await originalMessage.edit({ embeds: [endedEmbed], components: [] }).catch(console.error);
            }
        } else {
            console.error(`[GiveawayManager] Could not fetch channel or channel ${giveaway.channelId} is not a sendable text-based channel for giveaway ${giveawayId}.`);
        }
    } catch (e) {
        console.error(`[GiveawayManager] Error announcing results for giveaway ${giveawayId}:`, e);
    }
}

export function scheduleGiveawayEnd(client: Client, giveaway: Giveaway): void {
    if (giveaway.ended || giveaway.cancelled) return;

    const timeRemaining = giveaway.endTime - Date.now();
    if (timeRemaining <= 0) {
        processEndedGiveaway(client, giveaway.id).catch(console.error);
    } else {
        if (activeTimers.has(giveaway.id)) {
            clearTimeout(activeTimers.get(giveaway.id));
        }
        const timer = setTimeout(() => {
            processEndedGiveaway(client, giveaway.id).catch(console.error);
            activeTimers.delete(giveaway.id);
        }, timeRemaining);
        activeTimers.set(giveaway.id, timer);
        console.log(`[GiveawayManager] Scheduled end for giveaway ${giveaway.id} in ${timeRemaining}ms`);
    }
}

export function scheduleExistingGiveaways(client: Client): void {
    console.log("[GiveawayManager] Scheduling ends for existing active giveaways...");
    loadGiveaways();
    const potentiallyActiveGiveaways = giveawaysCache.filter(g => !g.ended && !g.cancelled);

    let scheduledCount = 0;
    let processedImmediatelyCount = 0;

    for (const giveaway of potentiallyActiveGiveaways) {
        if (giveaway.endTime > Date.now()) {
            scheduleGiveawayEnd(client, giveaway);
            scheduledCount++;
        } else {
            console.log(`[GiveawayManager] Giveaway ${giveaway.id} (${giveaway.title}) ended while bot was offline. Processing now.`);
            processEndedGiveaway(client, giveaway.id).catch(console.error);
            processedImmediatelyCount++;
        }
    }
    console.log(`[GiveawayManager] Scheduled ${scheduledCount} future giveaways. Processed ${processedImmediatelyCount} overdue giveaways.`);
}


// --- Helper Functions ---
export function formatDuration(ms: number): string {
    if (ms <= 0) return 'Not Set';
    const d = Math.floor(ms / (1000 * 60 * 60 * 24));
    const h = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const m = Math.floor((ms / (1000 * 60)) % 60);
    const s = Math.floor((ms / 1000) % 60);
    let parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 && parts.length < 2 && !(d > 0 || h > 0)) { // Only show seconds if no d/h and less than 2 parts (e.g. "30s", "1m 30s")
        parts.push(`${s}s`);
    } else if (parts.length === 0 && s <= 0) { // If all are zero
         return "0s";
    }
    if (parts.length === 0) { // If duration was > 0ms but < 1s
        if (ms > 0) return 'Less than 1s';
        return "0s";
    }
    return parts.join(' ');
}

export function parseDuration(str: string): number | null {
    let totalMs = 0;
    const parts = str.toLowerCase().match(/(\d+)([dhms])/g);
    if (!parts) {
        const timeParts = str.split(':').map(Number);
        if (timeParts.some(isNaN)) return null;
        if (timeParts.length === 3) { totalMs += timeParts[0]*3600000 + timeParts[1]*60000 + timeParts[2]*1000; }
        else if (timeParts.length === 2) { totalMs += timeParts[0]*60000 + timeParts[1]*1000; }
        else if (timeParts.length === 1 && !str.match(/[dhms]/i)) { totalMs += timeParts[0]*60000; }
        else { return null; } return totalMs > 0 ? totalMs : null;
    }
    for (const part of parts) {
        const value = parseInt(part.slice(0, -1)); const unit = part.slice(-1); if (isNaN(value)) return null;
        switch (unit) {
            case 'd': totalMs += value * 86400000; break; case 'h': totalMs += value * 3600000; break;
            case 'm': totalMs += value * 60000; break; case 's': totalMs += value * 1000; break; default: return null;
        }
    } return totalMs > 0 ? totalMs : null;
}

export function getSessionIdFromCustomId(customId: string, prefix: string): string | null {
    if (customId.startsWith(prefix + '_')) {
        const parts = customId.substring(prefix.length + 1).split('_');
        return parts[0];
    }
    return null;
}

loadGiveaways();
