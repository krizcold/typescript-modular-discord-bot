import { Client, ButtonInteraction, MessageFlags, Interaction } from 'discord.js';
import { RegisteredButtonInfo } from '../../../types/commandTypes';

// Default timeout duration (15 minutes in milliseconds)
const DEFAULT_BUTTON_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Handles incoming button interactions, using the map attached to the client.
 */
async function handleButtonInteraction(client: Client, interaction: ButtonInteraction) {
  // Double check it's a button interaction
  if (!interaction.isButton()) return;

  // --- Use client.buttonHandlers ---
  const registeredButtons = client.buttonHandlers; // Get map from client
  // <<< --- COMMENTED OUT DEBUG LOG --- >>>
  // console.log(`[handleButtonInteraction] Handling interaction ${interaction.customId}. Current map size: ${registeredButtons.size}. Keys: [${Array.from(registeredButtons.keys()).join(', ')}]`);


  const [action] = interaction.customId.split('_');
  const buttonInfo = registeredButtons.get(action);

  // Check if handler exists
  if (!buttonInfo) {
    console.warn(`No handler found for button action: ${action} (Full Custom ID: ${interaction.customId})`);
    try {
      if (!interaction.replied && !interaction.deferred) { await interaction.deferUpdate(); }
    } catch (replyError) { console.error("Failed to defer update for unknown button interaction:", replyError); }
    return;
  }

  // Perform Expiration Check
  const { handler, timeoutMs } = buttonInfo;
  if (timeoutMs !== null) {
    const messageAge = interaction.createdTimestamp - interaction.message.createdTimestamp;
    const effectiveTimeout = timeoutMs > 0 ? timeoutMs : DEFAULT_BUTTON_TIMEOUT_MS;
    if (messageAge > effectiveTimeout) {
      console.log(`Button interaction expired and ignored: ${interaction.customId}`);
      try { await interaction.deferUpdate(); } catch (error) { console.error(`Error deferring update for expired button interaction:`, error); }
      return;
    }
  }

  // Execute the Handler
  try {
    await handler(client, interaction);
  } catch (error) {
    console.error(`Error executing button handler for action "${action}" (ID: ${interaction.customId}):`, error);
    try {
      if (!interaction.replied && !interaction.deferred) { await interaction.reply({ content: 'Error processing button click.', flags: MessageFlags.Ephemeral }); }
      else { await interaction.followUp({ content: 'Error processing button click.', flags: MessageFlags.Ephemeral }); }
    } catch (replyError) { console.error("Failed to send error reply/followUp:", replyError); }
  }
}

/**
 * Register a button handler FOR THE GIVEN CLIENT INSTANCE.
 * @param client The Client instance to attach the handler map to.
 * @param customIdPrefix The prefix of the customId to handle.
 * @param handler The async function to execute.
 * @param timeoutMs Optional timeout duration (null for never expire).
 */
function registerButtonHandler(
  client: Client,
  customIdPrefix: string,
  handler: (client: Client, interaction: ButtonInteraction) => Promise<void>,
  timeoutMs: number | null = DEFAULT_BUTTON_TIMEOUT_MS
) {
  // --- Use client.buttonHandlers ---
  if (!client.buttonHandlers) {
    console.error("[registerButtonHandler] client.buttonHandlers map not found! Initializing fallback.");
    client.buttonHandlers = new Map<string, RegisteredButtonInfo>();
  }

  const registeredButtons = client.buttonHandlers; // Get map from client
  /*const existingInfo = registeredButtons.get(customIdPrefix);

  if (existingInfo) {
    console.log(`[i] Button handler prefix "${customIdPrefix}" is being re-registered.`); // Optional log
  }*/

  registeredButtons.set(customIdPrefix, { handler, timeoutMs });
  const timeoutDesc = timeoutMs === null ? 'never expires' : `${timeoutMs}ms`;
  console.log(`[i] Registered button handler for: ${customIdPrefix} (Timeout: ${timeoutDesc})`);
}

// Default Export for the Event Handler System
export default async function eventFunction(client: Client, interaction: Interaction) {
  if (!interaction.isButton()) {
    return;
  }
  // Pass client down to the handler logic
  await handleButtonInteraction(client, interaction);
}

// Named Export for commands/modules to register their button handlers
export { registerButtonHandler }; // Keep export name the same
