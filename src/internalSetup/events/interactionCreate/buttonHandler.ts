import { Client, ButtonInteraction, MessageFlags, Interaction, PermissionsBitField, GuildMember, PermissionResolvable } from 'discord.js';
import { RegisteredButtonInfo } from '../../../types/commandTypes';

// Default timeout duration (15 minutes in milliseconds)
const DEFAULT_BUTTON_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Handles incoming button interactions, checking permissions if required.
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
    } catch (replyError) {
      console.error("Failed to send error reply for missing button map:", replyError);
    }
    return;
  }

  const customId = interaction.customId;
  const buttonInfo = registeredButtons.get(customId);

  if (!buttonInfo) {
    console.warn(`No handler found for button customId: ${customId}`);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
      }
    } catch (deferError) {
      console.error("Failed to defer update for unknown button interaction:", deferError);
    }
    return;
  }

  // --- Permission Check ---
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


  // Perform Expiration Check
  const { handler, timeoutMs } = buttonInfo;
  if (timeoutMs !== null) {
    const messageAge = interaction.createdTimestamp - interaction.message.createdTimestamp;
    const effectiveTimeout = timeoutMs > 0 ? timeoutMs : DEFAULT_BUTTON_TIMEOUT_MS;
    if (messageAge > effectiveTimeout) {
      console.log(`Button interaction expired and ignored: ${customId}`);
      try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate();
        }
      } catch (error) {
        console.error(`Error deferring update for expired button interaction:`, error);
      }
      return;
    }
  }

  // Execute the Handler
  try {
    await handler(client, interaction);
  } catch (error) {
    console.error(`Error executing button handler for customId "${customId}":`, error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'There was an error processing this button click.', flags: MessageFlags.Ephemeral });
      } else if (!interaction.replied) {
        await interaction.editReply({ content: 'There was an error processing this button click.' });
      } else {
        await interaction.followUp({ content: 'There was an error processing this button click.', flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      console.error("Failed to send error reply/followUp for button handler error:", replyError);
    }
  }
}

/**
 * Register a button handler FOR THE GIVEN CLIENT INSTANCE.
 * @param client The Client instance to attach the handler map to.
 * @param customId The exact customId used for the button.
 * @param handler The async function to execute when a matching button is clicked.
 * @param options Optional settings including timeout and permissions.
 * @param options.timeoutMs Optional timeout duration (null for never expire based on message age).
 * @param options.permissionsRequired Optional array of permissions required to use the button.
 */
function registerButtonHandler(
  client: Client,
  customId: string,
  handler: (client: Client, interaction: ButtonInteraction) => Promise<void>,
  // Add the optional options parameter
  options?: {
    timeoutMs?: number | null;
    permissionsRequired?: PermissionResolvable[];
  }
) {
  if (!client.buttonHandlers) {
    console.error("[registerButtonHandler] client.buttonHandlers map not found! Initializing fallback.");
    client.buttonHandlers = new Map<string, RegisteredButtonInfo>();
  }

  const registeredButtons = client.buttonHandlers;
  // Use options?.timeoutMs, default if undefined
  const timeoutMs = options?.timeoutMs === undefined ? DEFAULT_BUTTON_TIMEOUT_MS : options.timeoutMs;
  // Get permissions from options
  const permissionsRequired = options?.permissionsRequired;

  if (registeredButtons.has(customId)) {
     console.warn(`[!] Overwriting existing button handler for customId: ${customId}`);
  }

  // Store handler, timeout, and permissions
  registeredButtons.set(customId, { handler, timeoutMs, permissionsRequired });

  const timeoutDesc = timeoutMs === null ? 'never expires' : `${timeoutMs}ms`;
  // Update log message to include permissions if provided
  const permsDesc = permissionsRequired ? ` (Requires: ${permissionsRequired.join(', ')})` : '';
  console.log(`[i] Registered button handler for customId: ${customId} (Timeout: ${timeoutDesc})${permsDesc}`);
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

