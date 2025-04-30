import { Client, ButtonInteraction, MessageFlags, Interaction, PermissionsBitField, GuildMember, PermissionResolvable } from 'discord.js';
import { RegisteredButtonInfo, SpecialUserRule } from '../../../types/commandTypes';

// Default timeout duration (15 minutes in milliseconds)
const DEFAULT_BUTTON_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_USER_LEVEL = -1; // Default value if no special rule matches

/**
 * Handles incoming button interactions, checking permissions and special user rules.
 */
async function handleButtonInteraction(client: Client, interaction: ButtonInteraction) {
  if (!interaction.isButton()) return;

  const registeredButtons = client.buttonHandlers;
  if (!registeredButtons) {
    console.error("[handleButtonInteraction] client.buttonHandlers map not found!");
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'An internal error occurred (Button map missing).', flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) { /* Ignore */ }
    return;
  }

  const customId = interaction.customId;
  const buttonInfo = registeredButtons.get(customId);

  if (!buttonInfo) {
    console.warn(`No handler found for button customId: ${customId}`);
    try {
      if (!interaction.replied && !interaction.deferred) { await interaction.deferUpdate(); }
    } catch (deferError) { /* Ignore */ }
    return;
  }

  // --- Permission Check (Denial) ---
  if (buttonInfo.permissionsRequired?.length) {
    if (!interaction.inGuild() || !(interaction.member instanceof GuildMember)) {
        console.warn(`Button ${customId} requires permissions, but interaction is not in a guild or member data is unavailable.`);
         try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'This button cannot be used here.', flags: MessageFlags.Ephemeral });
            }
         } catch (replyError) { /* Ignore */ }
        return;
    }
    for (const permission of buttonInfo.permissionsRequired) {
      if (!interaction.member.permissions.has(permission)) {
        console.log(`User ${interaction.user.tag} lacks permission '${permission}' for button ${customId}`);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'You do not have permission to use this button.', flags: MessageFlags.Ephemeral });
          }
        } catch (replyError) { /* Ignore */ }
        return;
      }
    }
  }
  // --- End Permission Check ---

  // --- Special User Check (Determine Response Level) ---
  let userLevel = DEFAULT_USER_LEVEL; // Default level
  let matchedRuleType = 'default'; // Track why the level was assigned

  if (buttonInfo.specialUsers?.length && interaction.inGuild() && interaction.member instanceof GuildMember) {
    for (const rule of buttonInfo.specialUsers) {
      let match = false;
      if (rule.type === 'user' && interaction.user.id === rule.id) {
        match = true;
        matchedRuleType = `user (${rule.id})`;
      } else if (rule.type === 'permission' && interaction.member.permissions.has(rule.id)) {
        match = true;
        matchedRuleType = `permission (${rule.id})`;
      }

      if (match) {
        userLevel = rule.value;
        console.log(`[Special User Check] User ${interaction.user.tag} matched rule type '${rule.type}' (ID: ${rule.id}) for button ${customId}. Assigned level: ${userLevel}`);
        break; // Stop at the first match (prioritized list)
      }
    }
  }
  if (userLevel === DEFAULT_USER_LEVEL) {
      console.log(`[Special User Check] User ${interaction.user.tag} did not match any special rules for button ${customId}. Using default level: ${userLevel}`);
  }
  // --- End Special User Check ---


  // Perform Expiration Check
  const { handler, timeoutMs } = buttonInfo; // Destructure handler here
  if (timeoutMs !== null) {
    const messageAge = interaction.createdTimestamp - interaction.message.createdTimestamp;
    const effectiveTimeout = timeoutMs > 0 ? timeoutMs : DEFAULT_BUTTON_TIMEOUT_MS;
    if (messageAge > effectiveTimeout) {
      console.log(`Button interaction expired and ignored: ${customId}`);
      try {
        if (!interaction.replied && !interaction.deferred) { await interaction.deferUpdate(); }
      } catch (error) { /* Ignore */ }
      return;
    }
  }

  // Execute the Handler, passing the determined userLevel
  try {
    // Pass userLevel as the third argument
    await handler(client, interaction, userLevel);
  } catch (error) {
    console.error(`Error executing button handler for customId "${customId}" (UserLevel: ${userLevel}):`, error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'There was an error processing this button click.', flags: MessageFlags.Ephemeral });
      } else if (!interaction.replied) {
        await interaction.editReply({ content: 'There was an error processing this button click.' });
      } else {
        await interaction.followUp({ content: 'There was an error processing this button click.', flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) { /* Ignore */ }
  }
}

/**
 * Register a button handler FOR THE GIVEN CLIENT INSTANCE.
 * @param client The Client instance to attach the handler map to.
 * @param customId The exact customId used for the button.
 * @param handler The async function to execute (now accepts userLevel).
 * @param options Optional settings including timeout, permissions, and special users.
 */
function registerButtonHandler(
  client: Client,
  customId: string,
  // Update handler signature to accept userLevel
  handler: (client: Client, interaction: ButtonInteraction, userLevel: number) => Promise<void>,
  options?: {
      timeoutMs?: number | null;
      permissionsRequired?: PermissionResolvable[];
      specialUsers?: SpecialUserRule[]; // Add specialUsers option
  }
) {
  if (!client.buttonHandlers) {
    console.error("[registerButtonHandler] client.buttonHandlers map not found! Initializing fallback.");
    client.buttonHandlers = new Map<string, RegisteredButtonInfo>();
  }

  const registeredButtons = client.buttonHandlers;
  const timeoutMs = options?.timeoutMs === undefined ? DEFAULT_BUTTON_TIMEOUT_MS : options.timeoutMs;
  const permissionsRequired = options?.permissionsRequired;
  const specialUsers = options?.specialUsers; // Get specialUsers from options

  if (registeredButtons.has(customId)) {
     console.warn(`[!] Overwriting existing button handler for customId: ${customId}`);
  }

  // Store handler, timeout, permissions, and specialUsers
  registeredButtons.set(customId, { handler, timeoutMs, permissionsRequired, specialUsers });

  const timeoutDesc = timeoutMs === null ? 'never expires' : `${timeoutMs}ms`;
  const permsDesc = permissionsRequired ? ` (Requires: ${permissionsRequired.join(', ')})` : '';
  const specialDesc = specialUsers ? ` (Special Users: ${specialUsers.length} rules)` : '';
  console.log(`[i] Registered button handler for customId: ${customId} (Timeout: ${timeoutDesc})${permsDesc}${specialDesc}`);
}

// Default Export for the Event Handler System
export default async function eventFunction(client: Client, interaction: Interaction) {
  if (!interaction.isButton()) {
    return;
  }
  await handleButtonInteraction(client, interaction as ButtonInteraction);
}

// Named Export for commands/modules to register their button handlers
export { registerButtonHandler };

