import { Client, MessageReaction, User, PartialUser, PartialMessageReaction, GatewayIntentBits } from 'discord.js';
import { RegisteredReactionInfo } from '../../../types/commandTypes';

export const requiredIntents = [
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessages, // For fetching partial messages if needed
    GatewayIntentBits.DirectMessageReactions, // If used in DMs
];

async function handleReaction(client: Client, reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
    // Default: ignore bot reactions unless explicitly allowed by handler options
    // Check initial user.bot state. If it's a partial user, we'll fetch and check again.
    if (user.partial === false && user.bot && (!client.reactionHandlers.get(reaction.message.id)?.allowBots)) {
        return;
    }

    // Fetch partials
    if (reaction.partial) {
        try {
            reaction = await reaction.fetch();
        } catch (error) {
            console.error('[ReactionHandler] Failed to fetch partial reaction:', error);
            return;
        }
    }
    if (user.partial) {
        try {
            user = await user.fetch();
        } catch (error) {
            console.error('[ReactionHandler] Failed to fetch partial user:', error);
            return;
        }
    }

    // Re-check bot status after fetching, and apply allowBots option
    const reactionInfoFromMap = client.reactionHandlers?.get(reaction.message.id);
    if (user.bot && (!reactionInfoFromMap || !reactionInfoFromMap.allowBots)) {
        return;
    }


    const messageId = reaction.message.id;
    const reactionInfo = client.reactionHandlers?.get(messageId);

    if (!reactionInfo) return; // No handler for this message

    const { handler, emojiIdentifier, endTime, guildId, maxEntries, collectedUsers } = reactionInfo;

    // Emoji check
    const reactedEmojiIdentifier = reaction.emoji.id || reaction.emoji.name; // Custom emoji ID or unicode name
    if (reactedEmojiIdentifier !== emojiIdentifier) {
        return;
    }

    // End time check
    if (endTime && Date.now() > endTime) {
        // Giveaway/event might have ended. The unregister should ideally happen when the event concludes.
        // For robustness, we can remove it here if it's past time.
        // unregisterReactionHandler(client, messageId); // Consider if this is the right place.
        return;
    }

    // Guild check (if specified)
    if (guildId && reaction.message.guildId !== guildId) {
        return;
    }

    // Max entries / already collected check
    if (collectedUsers.has(user.id)) {
        return;
    }
    if (maxEntries && maxEntries > 0 && collectedUsers.size >= maxEntries) {
        return;
    }

    // Execute the handler
    try {
        // Ensure full types are passed to the handler
        await handler(client, reaction as MessageReaction, user as User, reactionInfo);
        collectedUsers.add(user.id); // Mark as collected after successful handler execution
    } catch (error) {
        console.error(`[ReactionHandler] Error executing reaction handler for message ${messageId}, emoji ${emojiIdentifier}:`, error);
    }
}

export function registerReactionHandler(
    client: Client,
    messageId: string,
    emojiIdentifier: string, // Unicode char or custom emoji ID
    handler: (client: Client, reaction: MessageReaction, user: User, self: RegisteredReactionInfo) => Promise<void>,
    options: {
        endTime?: number;
        guildId?: string;
        maxEntries?: number;
        allowBots?: boolean;
    } = {}
) {
    if (!client.reactionHandlers) {
        client.reactionHandlers = new Map<string, RegisteredReactionInfo>();
    }
    const info: RegisteredReactionInfo = {
        handler,
        emojiIdentifier,
        collectedUsers: new Set<string>(),
        endTime: options.endTime,
        guildId: options.guildId,
        maxEntries: options.maxEntries,
        allowBots: options.allowBots || false,
    };
    client.reactionHandlers.set(messageId, info);
    console.log(`[ReactionHandler] Registered handler for message ${messageId}, emoji ${emojiIdentifier}`);
}

export function unregisterReactionHandler(client: Client, messageId: string) {
    if (client.reactionHandlers?.delete(messageId)) {
        console.log(`[ReactionHandler] Unregistered handler for message ${messageId}`);
    }
}

// Default export for clientInitializer to pick up
export default async (client: Client, reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
    await handleReaction(client, reaction, user);
};