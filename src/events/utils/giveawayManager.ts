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
  Colors,
  Message,
  ComponentType
} from 'discord.js';
import { unregisterReactionHandler } from '../../internalSetup/events/messageReactionAdd/reactionHandler';

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
  // Also attempt to unregister reaction handler if one might exist
  const giveaway = getGiveaway(giveawayId); // getGiveaway will load from potentially already filtered cache if not careful
                                            // It's better to fetch giveaway before filtering the main cache.
                                            // However, removeGiveaway is usually called for *already ended/cancelled* giveaways
                                            // For safety, we'll assume client is not available here,
                                            // unregistration should happen in processEnded or cancel.
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
  // Sort by startTime descending (newer first)
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

    // Unregister reaction handler if it was a reaction giveaway
    if (giveaway && giveaway.entryMode === 'reaction' && giveaway.messageId) {
        unregisterReactionHandler(client, giveaway.messageId);
    }

    if (!giveaway || (giveaway.ended && !giveaway.cancelled) /* Allow re-processing if cancelled but now finishing */) {
        if (giveaway && giveaway.ended && !giveaway.cancelled) {
             console.log(`[GiveawayManager] Giveaway ${giveawayId} already ended normally.`);
        } else if (!giveaway) {
            console.log(`[GiveawayManager] Giveaway ${giveawayId} not found for processing end.`);
        }
        activeTimers.delete(giveawayId);
        return;
    }
    if (giveaway.cancelled) {
        console.log(`[GiveawayManager] Giveaway ${giveawayId} was cancelled, not processing normal end.`);
        activeTimers.delete(giveawayId);
        // Ensure it's marked as ended if cancelled
        if (!giveaway.ended) {
            updateGiveaway(giveawayId, { ended: true });
        }
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

    updateGiveaway(giveawayId, { ended: true, winners: winners.map(w => w.id), cancelled: false }); // Ensure cancelled is false
    activeTimers.delete(giveawayId);

    try {
        const channel = await client.channels.fetch(giveaway.channelId);

        if (isChannelDefinitelySendable(channel)) {
            let originalMessage: Message | null = null;
            try {
                originalMessage = await channel.messages.fetch(giveaway.messageId);
            } catch (e) {
                console.warn(`[GiveawayManager] Could not fetch original giveaway message ${giveaway.messageId} for giveaway ${giveawayId}. It might have been deleted.`);
            }

            const resultEmbed = new EmbedBuilder()
                .setTitle(`🎉 Giveaway Ended: ${giveaway.title} 🎉`)
                .setColor(Colors.Aqua); // Use a color for ended state

            let winnerMentions = "*No winners were selected (no participants or an error occurred).*";
            if (winners.length > 0) {
                winnerMentions = winners.map(w => w.toString()).join(', ');
                resultEmbed.setDescription(`*Congratulations to ${winnerMentions} for winning **${giveaway.prize}**!*`);
            } else {
                resultEmbed.setDescription('*Unfortunately, there were no participants in this giveaway, so no winner could be chosen.*');
            }
            resultEmbed.setFooter({ text: `Giveaway Concluded` });
            resultEmbed.setTimestamp(giveaway.endTime);


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
                    .setColor(Colors.Grey) // Keep original message greyed out
                    .setFields([]) 
                    .setFooter({text: `Ended`}) 
                    .setTimestamp(giveaway.endTime);

                let finalComponents: ActionRowBuilder<ButtonBuilder>[] = [];
                if (giveaway.entryMode === 'reaction' && originalMessage.components.length > 0) {
                    // For reaction giveaways, we might want to remove or disable the initial bot reaction
                    // or any "entry" components if they existed (they shouldn't for reaction mode).
                    // Simplest is to just clear components.
                } else if (originalMessage.components.length > 0) {
                    // For button/trivia, disable existing buttons
                    const disabledRows = originalMessage.components.map(actionRow => {
                        const newRow = new ActionRowBuilder<ButtonBuilder>();
                        actionRow.components.forEach(component => {
                            if (component.type === ComponentType.Button) {
                                newRow.addComponents(ButtonBuilder.from(component).setDisabled(true)); // Disable buttons
                            } else {
                                newRow.addComponents(component as any); // Keep other components like select menus if any
                            }
                        });
                        return newRow;
                    });
                    finalComponents = disabledRows as ActionRowBuilder<ButtonBuilder>[];
                }
                
                await originalMessage.edit({ embeds: [endedEmbed], components: finalComponents }).catch(console.error);
                if (giveaway.entryMode === 'reaction' && giveaway.reactionDisplayEmoji) {
                    // Remove all reactions from the original message, or at least the bot's
                    originalMessage.reactions.removeAll().catch(e => console.warn(`[GiveawayManager] Could not remove reactions from ended giveaway ${giveaway.id}: ${e.message}`));
                }
            }
        } else {
            console.error(`[GiveawayManager] Could not fetch channel or channel ${giveaway.channelId} is not a sendable text-based channel for giveaway ${giveawayId}.`);
        }
    } catch (e) {
        console.error(`[GiveawayManager] Error announcing results for giveaway ${giveawayId}:`, e);
    }
}

export async function cancelGiveaway(client: Client, giveawayId: string): Promise<boolean> {
    console.log(`[GiveawayManager] Attempting to cancel giveaway ID: ${giveawayId}`);
    const giveaway = getGiveaway(giveawayId);

    if (!giveaway) {
        console.warn(`[GiveawayManager] Cancel failed: Giveaway ${giveawayId} not found.`);
        return false;
    }

    // Unregister reaction handler if it was a reaction giveaway
    if (giveaway.entryMode === 'reaction' && giveaway.messageId) {
        unregisterReactionHandler(client, giveaway.messageId);
    }

    if (giveaway.cancelled) {
        console.warn(`[GiveawayManager] Cancel failed: Giveaway ${giveawayId} is already cancelled.`);
        return false;
    }
    if (giveaway.ended && !giveaway.cancelled) { // Already ended normally
        console.warn(`[GiveawayManager] Cancel failed: Giveaway ${giveawayId} has already ended normally.`);
        return false;
    }

    const updated = updateGiveaway(giveawayId, { cancelled: true, ended: true, winners: [] });
    if (!updated) {
        console.error(`[GiveawayManager] Failed to update giveaway data for cancellation: ${giveawayId}`);
        return false;
    }

    if (activeTimers.has(giveawayId)) {
        clearTimeout(activeTimers.get(giveawayId)!);
        activeTimers.delete(giveawayId);
        console.log(`[GiveawayManager] Cleared active timer for cancelled giveaway ${giveawayId}.`);
    }

    try {
        const channel = await client.channels.fetch(giveaway.channelId);
        if (isChannelDefinitelySendable(channel)) {
            const originalMessage = await channel.messages.fetch(giveaway.messageId).catch(() => null);
            if (originalMessage) {
                const cancelledEmbed = EmbedBuilder.from(originalMessage.embeds[0] || new EmbedBuilder())
                    .setTitle(`🚫 Giveaway Cancelled: ${giveaway.title} 🚫`)
                    .setDescription(`*This giveaway has been cancelled.*`)
                    .setColor(Colors.Red)
                    .setFields([]) // Clear fields like "Ends In"
                    .setFooter({ text: `Cancelled` })
                    .setTimestamp(Date.now());
                await originalMessage.edit({ embeds: [cancelledEmbed], components: [] });
                if (giveaway.entryMode === 'reaction') {
                     originalMessage.reactions.removeAll().catch(e => console.warn(`[GiveawayManager] Could not remove reactions from cancelled giveaway ${giveaway.id}: ${e.message}`));
                }
                console.log(`[GiveawayManager] Edited message for cancelled giveaway ${giveawayId}.`);
            } else {
                 console.warn(`[GiveawayManager] Original message not found for cancelled giveaway ${giveawayId}. Cannot edit.`);
            }
        } else {
            console.error(`[GiveawayManager] Channel ${giveaway.channelId} is not sendable for cancelling giveaway ${giveawayId}.`);
        }
    } catch (e) {
        console.error(`[GiveawayManager] Error updating message for cancelled giveaway ${giveawayId}:`, e);
    }
    
    console.log(`[GiveawayManager] Successfully cancelled giveaway ${giveawayId}.`);
    return true;
}


export function scheduleGiveawayEnd(client: Client, giveaway: Giveaway): void {
    if (giveaway.ended || giveaway.cancelled) {
        console.log(`[GiveawayManager] Giveaway ${giveaway.id} is already ended or cancelled. Not scheduling.`);
        // Ensure reaction handler is cleaned up if somehow missed
        if (giveaway.entryMode === 'reaction' && giveaway.messageId) {
            unregisterReactionHandler(client, giveaway.messageId);
        }
        return;
    }

    const timeRemaining = giveaway.endTime - Date.now();
    if (timeRemaining <= 0) {
        console.log(`[GiveawayManager] Giveaway ${giveaway.id} end time is in the past. Processing immediately.`);
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
    loadGiveaways(); // Ensure cache is fresh
    const potentiallyActiveGiveaways = giveawaysCache.filter(g => !g.ended && !g.cancelled);

    let scheduledCount = 0;
    let processedImmediatelyCount = 0;

    for (const giveaway of potentiallyActiveGiveaways) {
        // Double check endTime before scheduling
        if (giveaway.endTime > Date.now()) {
            scheduleGiveawayEnd(client, giveaway);
            scheduledCount++;
        } else {
            // If endtime is past, but it wasn't marked ended (e.g. bot restart)
            console.log(`[GiveawayManager] Giveaway ${giveaway.id} (${giveaway.title}) ended while bot was offline or was not processed. Processing now.`);
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
    if (s > 0 && parts.length < 2 && !(d > 0 || h > 0)) { 
        parts.push(`${s}s`);
    } else if (parts.length === 0 && s <= 0) { 
         return "0s";
    }
    if (parts.length === 0) { 
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
        else if (timeParts.length === 1 && !str.match(/[dhms]/i)) { totalMs += timeParts[0]*60000; } // Assume minutes if single number without unit
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
        return parts[0]; // The first part after prefix_ is assumed to be the session/giveaway ID
    }
    return null;
}

loadGiveaways();