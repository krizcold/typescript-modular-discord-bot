import { Client, ButtonInteraction, MessageFlags, Interaction } from 'discord.js';
import { RegisteredButtonInfo } from '../../../types/commandTypes'; // Import type

// Default timeout duration (15 minutes in milliseconds)
const DEFAULT_BUTTON_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Handles incoming button interactions, using the map attached to the client.
 */
async function handleButtonInteraction(client: Client, interaction: ButtonInteraction) {
  // Double check it's a button interaction
  if (!interaction.isButton()) return;

  // --- Use client.buttonHandlers ---
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

  // Use the full customId from the interaction to find the corresponding handler
  const customId = interaction.customId;
  const buttonInfo = registeredButtons.get(customId);


  // Check if handler exists for this customId
  if (!buttonInfo) {
    // Log which specific customId wasn't found
    console.warn(`No handler found for button customId: ${customId}`);
    try {
      // Acknowledge the interaction to prevent "Interaction Failed"
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate(); // Update silently
      }
    } catch (deferError) {
      console.error("Failed to defer update for unknown button interaction:", deferError);
    }
    return;
  }

  // Perform Expiration Check
  const { handler, timeoutMs } = buttonInfo;
  if (timeoutMs !== null) {
    const messageAge = interaction.createdTimestamp - interaction.message.createdTimestamp;
    const effectiveTimeout = timeoutMs > 0 ? timeoutMs : DEFAULT_BUTTON_TIMEOUT_MS;
    if (messageAge > effectiveTimeout) {
      console.log(`Button interaction expired and ignored: ${customId}`);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.deferUpdate(); // Update silently
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
    // Log error with the specific customId
    console.error(`Error executing button handler for customId "${customId}":`, error);
    try {
      // Try to reply or follow up with an error message
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'There was an error processing this button click.', flags: MessageFlags.Ephemeral });
      } else if (!interaction.replied) { // If deferred but not replied
        await interaction.editReply({ content: 'There was an error processing this button click.' });
      } else { // If already replied (e.g., via deferUpdate and then handler replied)
        await interaction.followUp({ content: 'There was an error processing this button click.', flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      console.error("Failed to send error reply/followUp for button handler error:", replyError);
    }
  }
}

/**
 * Register a button handler FOR THE GIVEN CLIENT INSTANCE.
 * The customId provided here MUST exactly match the customId set on the ButtonBuilder.
 * @param client The Client instance to attach the handler map to.
 * @param customId The exact customId used for the button.
 * @param handler The async function to execute when a matching button is clicked.
 * @param timeoutMs Optional timeout duration (null for never expire based on message age).
 */
function registerButtonHandler(
  client: Client,
  customId: string, // Parameter name changed for clarity, represents the full ID
  handler: (client: Client, interaction: ButtonInteraction) => Promise<void>,
  timeoutMs: number | null = DEFAULT_BUTTON_TIMEOUT_MS
) {
  if (!client.buttonHandlers) {
    console.error("[registerButtonHandler] client.buttonHandlers map not found! Initializing fallback. This should not happen if clientInitializer is correct.");
    client.buttonHandlers = new Map<string, RegisteredButtonInfo>();
  }

  const registeredButtons = client.buttonHandlers;

  if (registeredButtons.has(customId)) {
    console.warn(`[!] Overwriting existing button handler for customId: ${customId}`);
  }

  registeredButtons.set(customId, { handler, timeoutMs });
  const timeoutDesc = timeoutMs === null ? 'never expires' : `${timeoutMs}ms`;
  console.log(`[i] Registered button handler for customId: ${customId} (Timeout: ${timeoutDesc})`);
}

// Default Export for the Event Handler System (called by clientInitializer)
export default async function eventFunction(client: Client, interaction: Interaction) {
  if (!interaction.isButton()) {
    return;
  }
  // Pass client and interaction down to the specific handler logic
  await handleButtonInteraction(client, interaction as ButtonInteraction);
}

// Named Export for commands/modules to register their button handlers
export { registerButtonHandler };
