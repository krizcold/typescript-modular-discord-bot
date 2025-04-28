import {
  Client,
  Interaction,
  StringSelectMenuInteraction, // Start with StringSelectMenu, can add others later
  MessageFlags
} from 'discord.js';
import { RegisteredDropdownInfo } from '../../../types/commandTypes'; // Import the type

// Default timeout (e.g., 15 minutes), can be adjusted or removed if not needed for dropdowns
const DEFAULT_DROPDOWN_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Handles incoming select menu interactions, using the map attached to the client.
 * Currently focuses on StringSelectMenuInteraction.
 */
async function handleDropdownInteraction(client: Client, interaction: Interaction) {
  // Check if it's a StringSelectMenu interaction
  if (!interaction.isStringSelectMenu()) {
    return;
  }

  // --- Use client.dropdownHandlers ---
  const registeredDropdowns = client.dropdownHandlers;
  if (!registeredDropdowns) {
      console.error("[handleDropdownInteraction] client.dropdownHandlers map not found!");
      try {
          if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: 'An internal error occurred (Dropdown map missing).', flags: MessageFlags.Ephemeral });
          }
      } catch (replyError) {
          console.error("Failed to send error reply for missing dropdown map:", replyError);
      }
      return;
  }

  const customId = interaction.customId;
  const dropdownInfo = registeredDropdowns.get(customId);

  // Check if handler exists for this customId
  if (!dropdownInfo) {
    // Log which specific customId wasn't found
    console.warn(`No handler found for dropdown customId: ${customId}`);
    try {
      if (!interaction.replied && !interaction.deferred) {
          await interaction.deferUpdate();
      }
    } catch (deferError) {
      console.error("Failed to defer update for unknown dropdown interaction:", deferError);
    }
    return;
  }

  // Perform Expiration Check
  const { handler, timeoutMs } = dropdownInfo;
  if (timeoutMs !== null) {
    const messageAge = interaction.createdTimestamp - interaction.message.createdTimestamp;
    const effectiveTimeout = timeoutMs > 0 ? timeoutMs : DEFAULT_DROPDOWN_TIMEOUT_MS;
    if (messageAge > effectiveTimeout) {
      console.log(`Dropdown interaction expired and ignored: ${customId}`);
      try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate();
        }
      } catch (error) {
        console.error(`Error deferring update for expired dropdown interaction:`, error);
      }
      return;
    }
  }

  // Execute the Handler
  try {
    await handler(client, interaction); // interaction is already known to be StringSelectMenuInteraction
  } catch (error) {
    // Log error with the specific customId
    console.error(`Error executing dropdown handler for customId "${customId}":`, error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'There was an error processing your selection.', flags: MessageFlags.Ephemeral });
      } else if (!interaction.replied) {
        await interaction.editReply({ content: 'There was an error processing your selection.' });
      } else {
        await interaction.followUp({ content: 'There was an error processing your selection.', flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      console.error("Failed to send error reply/followUp for dropdown handler error:", replyError);
    }
  }
}

/**
 * Register a dropdown handler FOR THE GIVEN CLIENT INSTANCE.
 * The customIdPrefix provided here MUST exactly match the customId set on the StringSelectMenuBuilder.
 * @param client The Client instance to attach the handler map to.
 * @param customIdPrefix The exact customId used for the select menu.
 * @param handler The async function to execute when a matching dropdown is used.
 * @param timeoutMs Optional timeout duration (null for never expire based on message age).
 */
function registerDropdownHandler<TInteraction extends StringSelectMenuInteraction = StringSelectMenuInteraction>(
  client: Client,
  customIdPrefix: string, // Renamed parameter for clarity, but it's the full ID in this usage
  handler: (client: Client, interaction: TInteraction) => Promise<void>,
  timeoutMs: number | null = DEFAULT_DROPDOWN_TIMEOUT_MS
) {
  if (!client.dropdownHandlers) {
    console.error("[registerDropdownHandler] client.dropdownHandlers map not found! Initializing fallback. This should not happen if clientInitializer is correct.");
    client.dropdownHandlers = new Map<string, RegisteredDropdownInfo>();
  }

  const registeredDropdowns = client.dropdownHandlers;

  if (registeredDropdowns.has(customIdPrefix)) {
     console.warn(`[!] Overwriting existing dropdown handler for customId: ${customIdPrefix}`);
  }

  registeredDropdowns.set(customIdPrefix, { handler: handler as any, timeoutMs });
  const timeoutDesc = timeoutMs === null ? 'never expires' : `${timeoutMs}ms`;
  console.log(`[i] Registered dropdown handler for customId: ${customIdPrefix} (Timeout: ${timeoutDesc})`);
}

// Default Export for the Event Handler System
export default async function processDropdownInteraction(client: Client, interaction: Interaction) {
    await handleDropdownInteraction(client, interaction);
}

// Named Export for commands/modules to register their dropdown handlers
export { registerDropdownHandler };

