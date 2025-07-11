import { Client, Message, GatewayIntentBits, TextChannel, NewsChannel, ThreadChannel, DMChannel, PartialDMChannel } from 'discord.js';
import * as utils from '../../utils/chatResponseUtils';
// Import renamed config loader and types
import { getChatResponseConfig } from '../../utils/configManager';
import { ChatResponseConfig, ChatResponseInstanceConfig, CommandOptions } from '../../../types/commandTypes';

// Type guard to check if a channel is text-based and supports .send()
function isTextBasedChannel(channel: any): channel is TextChannel | NewsChannel | ThreadChannel | DMChannel | PartialDMChannel {
    return channel && typeof channel.send === 'function';
}

// --- Main Handler ---
export default async (client: Client, message: Message) => {
  if (message.author.bot) return;

  // Load the chat-response configuration
  const chatResponseConfig = getChatResponseConfig(); // Use renamed function

  if (!chatResponseConfig || Object.keys(chatResponseConfig).length === 0) {
    return;
  }

  // Cache local commands for this message event
  const localCommands = utils.getCachedLocalCommands();

  for (const [configKey, config] of Object.entries(chatResponseConfig)) {
    if (config.enabled === false) continue;

    const scopeId = config.scope === 'global' ? 'global' : message.guild?.id;
    if (config.scope === 'guild' && !message.guild) {
        continue;
    }
    if (!scopeId) continue;

    // --- Load data using keys from chatResponseData.json ---
    // Use renamed getter function
    const triggerPhrases = config.triggerListKey ? utils.getChatResponseList<string>(config.triggerListKey) : null;
    const responseItems = utils.getChatResponseList<string>(config.responseListKey);
    const allowedChannels = config.allowedChannelsKey ? utils.getChatResponseList<string>(config.allowedChannelsKey) : [];

    // --- Basic validation ---
    if (!responseItems || responseItems.length === 0) {
      console.warn(`[chatResponseManager-${configKey}] responseListKey "${config.responseListKey}" is empty or failed to load. Skipping.`); // Updated log prefix
      continue;
    }
    if (!triggerPhrases && !['react', 'command'].includes(config.responseMode)) {
         console.warn(`[chatResponseManager-${configKey}] triggerListKey "${config.triggerListKey}" is required for responseMode "${config.responseMode}" but is missing or failed to load. Skipping.`); // Updated log prefix
         continue;
    }
     if (config.responseMode === 'command' && (!triggerPhrases || triggerPhrases.length === 0)) {
        console.warn(`[chatResponseManager-${configKey}] triggerListKey "${config.triggerListKey}" is required for responseMode "command". Skipping.`); // Updated log prefix
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
    else if (config.responseMode !== 'react') {
        continue;
    }

    // 3. Cooldown Check
    // Generate cooldownId using 'chatresponse_' prefix
    const cooldownId = (config.reloadMinutes !== undefined && config.maxCharges !== undefined)
                       ? `chatresponse_${configKey}_cd` // Updated prefix
                       : null;

    if (cooldownId && config.reloadMinutes !== undefined && config.maxCharges !== undefined) {
      if (!utils.checkCooldown(cooldownId, config.reloadMinutes, config.maxCharges)) {
        continue;
      }
    }

    // 4. User Limit Check
    // Generate userLimitType using 'chatresponse_' prefix
    const userLimitType = `chatresponse_${configKey}_user`; // Updated prefix
    if (config.maxPerUser !== undefined && config.maxPerUser > 0) {
      if (!utils.checkUserLimit(userLimitType, message.author.id, config.maxPerUser, scopeId, config.resetUserMinutes)) {
        continue;
      }
    }

    // --- Perform Action ---
    const randomItem = responseItems[Math.floor(Math.random() * responseItems.length)];
    const commandName = config.responseMode === 'command' ? responseItems[0] : randomItem;

    if (!commandName && config.responseMode === 'command') {
        console.warn(`[chatResponseManager-${configKey}] No command name found in list for key "${config.responseListKey}".`); // Updated log prefix
        continue;
    }
    if (!randomItem && config.responseMode !== 'command') {
         console.warn(`[chatResponseManager-${configKey}] No response item found for key "${config.responseListKey}".`); // Updated log prefix
         continue;
    }


    try {
      switch (config.responseMode) {
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
               console.warn(`[chatResponseManager-${configKey}] Cannot use 'respond' mode in non-text-based channel: ${message.channel.id} (${message.channel.type})`); // Updated log prefix
           }
          break;
        case 'command':
          if (utils.checkCommandPermissions(message, commandName)) {
            console.log(`[chatResponseManager-${configKey}] User ${message.author.tag} triggered command '${commandName}' via message.`); // Updated log prefix

            const commandObject = localCommands.find(cmd => cmd.name === commandName) as CommandOptions | undefined;

            if (commandObject && typeof commandObject.messageCallback === 'function') {
                console.log(`[chatResponseManager-${configKey}] Executing messageCallback for command '${commandName}'.`); // Updated log prefix
                await commandObject.messageCallback(client, message);
            } else {
                console.log(`[chatResponseManager-${configKey}] Command '${commandName}' recognized but has no specific messageCallback defined.`); // Updated log prefix
            }

          } else {
             console.log(`[chatResponseManager-${configKey}] User ${message.author.tag} triggered command '${commandName}' but lacks permissions.`); // Updated log prefix
          }
          break;
      }
      // break;

    } catch (error) {
      console.error(`[chatResponseManager-${configKey}] Failed to perform action (${config.responseMode}):`, error); // Updated log prefix
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
