import { Client, ButtonInteraction, MessageFlags, Interaction } from 'discord.js';

// Default timeout duration (15 minutes in milliseconds)
const DEFAULT_BUTTON_TIMEOUT_MS = 1 * 60 * 1000;

// Define the structure for storing handler info
interface RegisteredButtonInfo {
    handler: (client: Client, interaction: ButtonInteraction) => Promise<void>;
    timeoutMs: number | null; // Timeout in ms, or null for never expire
}

// Map to store button handlers and their timeout settings
const registeredButtons = new Map<string, RegisteredButtonInfo>();


/**
 * Handles incoming button interactions, including a customizable expiration check.
 */
async function handleButtonInteraction(client: Client, interaction: ButtonInteraction) {
    // Double check it's a button interaction
    if (!interaction.isButton()) return;

    // Extract the base action part of the custom ID (before any potential '_')
    const [action] = interaction.customId.split('_');
    const buttonInfo = registeredButtons.get(action); // Find the registered handler info

    // --- Check if a handler exists ---
    if (!buttonInfo) {
        // No handler registered for this button's action prefix
        console.warn(`No handler found for button action: ${action} (Full Custom ID: ${interaction.customId})`);
        try {
            // Acknowledge silently to prevent "Interaction Failed" but do nothing else
            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferUpdate();
            }
        } catch (replyError) {
             console.error("Failed to defer update for unknown button interaction:", replyError);
        }
        return; // Stop processing
    }

    // --- Perform Expiration Check (if applicable) ---
    const { handler, timeoutMs } = buttonInfo; // Destructure info

    // Only check expiration if timeoutMs is a number (not null)
    if (timeoutMs !== null) {
        const messageTimestamp = interaction.message.createdTimestamp;
        const interactionTimestamp = interaction.createdTimestamp;
        const messageAge = interactionTimestamp - messageTimestamp;

        // Use the specific timeout for this button, or the default if somehow invalid
        const effectiveTimeout = timeoutMs > 0 ? timeoutMs : DEFAULT_BUTTON_TIMEOUT_MS;

        if (messageAge > effectiveTimeout) {
            // Log that the button was expired
            console.log(`Button interaction expired and ignored: ${interaction.customId} (Message age: ${messageAge}ms > Timeout: ${effectiveTimeout}ms)`);
            // Acknowledge the interaction silently to prevent "Interaction failed"
            try {
                await interaction.deferUpdate(); // Acknowledges without replying
            } catch (error) {
                console.error(`Error deferring update for expired button interaction (ID: ${interaction.customId}):`, error);
            }
            return; // Stop processing this interaction further
        }
    }
    // --- End Expiration Check ---


    // --- Execute the Handler ---
    try {
        // Execute the specific handler associated with this button's action
        await handler(client, interaction);
    } catch (error) {
        console.error(`Error executing button handler for action "${action}" (ID: ${interaction.customId}):`, error);
        // Try to inform the user about the error
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'There was an error processing this button click.',
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                 await interaction.followUp({
                    content: 'There was an error processing this button click.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (replyError) {
             console.error("Failed to send error reply/followUp to button interaction:", replyError);
        }
    }
}

/**
 * Register a button handler for a specific customId prefix.
 * @param customIdPrefix The prefix of the customId to handle (e.g., "ping-response").
 * @param handler The async function to execute when a matching button is clicked.
 * @param timeoutMs Optional. The timeout duration in milliseconds for this button.
 * Defaults to 15 minutes (900000ms).
 * Pass `null` to make the button never expire based on time.
 */
function registerButtonHandler(
    customIdPrefix: string,
    handler: (client: Client, interaction: ButtonInteraction) => Promise<void>,
    timeoutMs: number | null = DEFAULT_BUTTON_TIMEOUT_MS // Default to 15 mins
) {
    if (registeredButtons.has(customIdPrefix)) {
        console.warn(`Button handler for prefix "${customIdPrefix}" is being overwritten.`);
    }
    // Store handler and timeout setting
    registeredButtons.set(customIdPrefix, { handler, timeoutMs });
    const timeoutDesc = timeoutMs === null ? 'never expires' : `${timeoutMs}ms`;
    console.log(`Registered button handler for: ${customIdPrefix} (Timeout: ${timeoutDesc})`);
}

// Default Export for the Event Handler System (called by clientInitializer)
export default async function eventFunction(client: Client, interaction: Interaction) {
    if (!interaction.isButton()) {
        return; // Ignore non-button interactions
    }
    // It's a button, pass it to the specific handler logic
    await handleButtonInteraction(client, interaction);
}

// Named Export for commands/modules to register their button handlers
export { registerButtonHandler };
