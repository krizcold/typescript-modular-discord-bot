import { Client, ButtonInteraction, MessageFlags } from 'discord.js';

const registeredButtons = new Map<string, (client: Client, interaction: ButtonInteraction) => Promise<void>>();

/**
 * General button handler for all button interactions.
 */
async function handleButtonInteraction(client: Client, interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;

    const [action] = interaction.customId.split('_'); // Extract the action from custom ID

    const handler = registeredButtons.get(action); // Get the handler for the action
    if (handler) {
        try {
            await handler(client, interaction); // Execute the handler
        } catch (error) {
            console.error('Error executing button handler:', error);
            await interaction.reply({
                content: 'There was an error processing your request.',
                flags: MessageFlags.Ephemeral,
            });
        }
    } else {
        console.warn(`No handler found for button: ${action}`);
        await interaction.reply({
            content: 'This interaction failed. Please try again later.',
            flags: MessageFlags.Ephemeral,
        });
    }
}

/**
 * Register a button handler for a specific customId prefix (e.g., "claim").
 */
function registerButtonHandler(customIdPrefix: string, handler: (client: Client, interaction: ButtonInteraction) => Promise<void>) {
    registeredButtons.set(customIdPrefix, handler);
    console.log(`Registered button handler for: ${customIdPrefix}`);
}

// Default Export for the Event Handler System
export default async function eventFunction(client: Client, interaction: ButtonInteraction) {
    await handleButtonInteraction(client, interaction);
}

// Named Export for Button Registration
export { registerButtonHandler };
