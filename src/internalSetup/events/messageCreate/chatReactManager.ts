import { Client, Message, GatewayIntentBits, TextChannel, NewsChannel, ThreadChannel, DMChannel, PartialDMChannel } from 'discord.js';
import * as utils from '../../utils/reactionUtils';
// Import renamed config loader and types
import { getChatReactConfig } from '../../utils/configManager';
import { ChatReactConfig, ChatReactInstanceConfig, CommandOptions } from '../../../types/commandTypes';

// Type guard to check if a channel is text-based and supports .send()
function isTextBasedChannel(channel: any): channel is TextChannel | NewsChannel | ThreadChannel | DMChannel | PartialDMChannel {
    return channel && typeof channel.send === 'function';
}

// --- Main Handler ---
export default async (client: Client, message: Message) => {
  if (message.author.bot) return;

  // Load the chat-react configuration
  const chatReactConfig = getChatReactConfig(); // Use renamed function

  if (!chatReactConfig || Object.keys(chatReactConfig).length === 0) {
    return;
  }

  // Cache local commands for this message event
  const localCommands = utils.getCachedLocalCommands();

  for (const [configKey, config] of Object.entries(chatReactConfig)) {
    if (config.enabled === false) continue;

    const scopeId = config.scope === 'global' ? 'global' : message.guild?.id;
    if (config.scope === 'guild' && !message.guild) {
        continue;
    }
    if (!scopeId) continue;

    // --- Load data using keys from chatReactData.json ---
    // Use renamed getter function
    const triggerPhrases = config.triggerListKey ? utils.getChatReactList<string>(config.triggerListKey) : null;
    const reactionItems = utils.getChatReactList<string>(config.reactListKey);
    const allowedChannels = config.allowedChannelsKey ? utils.getChatReactList<string>(config.allowedChannelsKey) : [];

    // --- Basic validation ---
    if (!reactionItems || reactionItems.length === 0) {
      console.warn(`[ChatReactManager-${configKey}] reactListKey "${config.reactListKey}" is empty or failed to load. Skipping.`); // Updated log prefix
      continue;
    }
    if (!triggerPhrases && !['react', 'command'].includes(config.reactMode)) {
         console.warn(`[ChatReactManager-${configKey}] triggerListKey "${config.triggerListKey}" is required for reactMode "${config.reactMode}" but is missing or failed to load. Skipping.`); // Updated log prefix
         continue;
    }
     if (config.reactMode === 'command' && (!triggerPhrases || triggerPhrases.length === 0)) {
        console.warn(`[ChatReactManager-${configKey}] triggerListKey "${config.triggerListKey}" is required for reactMode "command". Skipping.`); // Updated log prefix
        continue;
     }


    // --- Apply checks ---

    // 1. Channel Check
    if (message.guild && allowedChannels.length > 0 && !utils.isChannelAllowed(message, allowedChannels)) {
      continue;
    }

    // 2. Trigger Check
    let matchedPhrase: string | null = null;
    if (triggerPhrases && triggerPhrases.length > 0) {
        matchedPhrase = utils.findMatchingPhrase(message.content, triggerPhrases, config.matchMode || 'word');
        if (!matchedPhrase) {
            continue;
        }
    }
    else if (config.reactMode !== 'react') {
        continue;
    }

    // 3. Cooldown Check
    // Generate cooldownId using 'chatreact_' prefix
    const cooldownId = (config.reloadMinutes !== undefined && config.maxCharges !== undefined)
                       ? `chatreact_${configKey}_cd` // Updated prefix
                       : null;

    if (cooldownId && config.reloadMinutes !== undefined && config.maxCharges !== undefined) {
      if (!utils.checkCooldown(cooldownId, config.reloadMinutes, config.maxCharges)) {
        continue;
      }
    }

    // 4. User Limit Check
    // Generate userLimitType using 'chatreact_' prefix
    const userLimitType = `chatreact_${configKey}_user`; // Updated prefix
    if (config.maxPerUser !== undefined && config.maxPerUser > 0) {
      if (!utils.checkUserLimit(userLimitType, message.author.id, config.maxPerUser, scopeId, config.resetUserMinutes)) {
        continue;
      }
    }

    // --- Perform Action ---
    const randomItem = reactionItems[Math.floor(Math.random() * reactionItems.length)];
    const commandName = config.reactMode === 'command' ? reactionItems[0] : randomItem;

    if (!commandName && config.reactMode === 'command') {
        console.warn(`[ChatReactManager-${configKey}] No command name found in list for key "${config.reactListKey}".`); // Updated log prefix
        continue;
    }
    if (!randomItem && config.reactMode !== 'command') {
         console.warn(`[ChatReactManager-${configKey}] No reaction item found for key "${config.reactListKey}".`); // Updated log prefix
         continue;
    }


    try {
      switch (config.reactMode) {
        case 'react':
          if (randomItem) await message.react(randomItem);
          break;
        case 'reply':
          if (randomItem) {
             const replyContent = randomItem.replace('{user}', message.author.toString());
             await message.reply(replyContent);
          }
          break;
        case 'respond':
           if (randomItem && isTextBasedChannel(message.channel)) {
              const respondContent = randomItem.replace('{user}', message.author.toString());
              await message.channel.send(respondContent);
           } else if (!isTextBasedChannel(message.channel)) {
               console.warn(`[ChatReactManager-${configKey}] Cannot use 'respond' mode in non-text-based channel: ${message.channel.id} (${message.channel.type})`); // Updated log prefix
           }
          break;
        case 'command':
          if (utils.checkCommandPermissions(message, commandName)) {
            console.log(`[ChatReactManager-${configKey}] User ${message.author.tag} triggered command '${commandName}' via message.`); // Updated log prefix

            const commandObject = localCommands.find(cmd => cmd.name === commandName) as CommandOptions | undefined;

            if (commandObject && typeof commandObject.messageCallback === 'function') {
                console.log(`[ChatReactManager-${configKey}] Executing messageCallback for command '${commandName}'.`); // Updated log prefix
                await commandObject.messageCallback(client, message);
            } else {
                console.log(`[ChatReactManager-${configKey}] Command '${commandName}' recognized but has no specific messageCallback defined.`); // Updated log prefix
            }

          } else {
             console.log(`[ChatReactManager-${configKey}] User ${message.author.tag} triggered command '${commandName}' but lacks permissions.`); // Updated log prefix
          }
          break;
      }
      // break;

    } catch (error) {
      console.error(`[ChatReactManager-${configKey}] Failed to perform action (${config.reactMode}):`, error); // Updated log prefix
    }
  } // End loop through configs
};

// Define required intents
export const requiredIntents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
];
