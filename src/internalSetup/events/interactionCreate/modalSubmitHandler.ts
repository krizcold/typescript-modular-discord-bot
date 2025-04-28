import { Client, Interaction, ModalSubmitInteraction, MessageFlags } from 'discord.js';
import { RegisteredModalInfo } from '../../../types/commandTypes'; // Import type

/**
 * Handles incoming modal submit interactions using the map attached to the client.
 */
async function handleModalSubmit(client: Client, interaction: Interaction) {
  // Check if it's a ModalSubmit interaction
  if (!interaction.isModalSubmit()) {
    return;
  }

  // --- Use client.modalHandlers ---
  const registeredModals = client.modalHandlers;
  if (!registeredModals) {
    console.error("[handleModalSubmit] client.modalHandlers map not found!");
    try {
      // Modals always allow replying
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'An internal error occurred (Modal map missing).', flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      console.error("Failed to send error reply for missing modal map:", replyError);
    }
    return;
  }

  // Use the exact customId from the modal interaction to find the handler
  const customId = interaction.customId;
  const modalInfo = registeredModals.get(customId);

  // Check if handler exists for this customId
  if (!modalInfo) {
    console.warn(`No handler found for modal customId: ${customId}`);
    // It's good practice to acknowledge the interaction even if unhandled
    try {
      if (!interaction.replied && !interaction.deferred) {
        // Deferring is often preferred for modals if no immediate response is needed
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply({ content: 'This interaction is not handled.' });
      }
    } catch (ackError) {
      console.error("Failed to acknowledge unhandled modal interaction:", ackError);
    }
    return;
  }

  // Execute the Handler
  const { handler } = modalInfo;
  try {
    await handler(client, interaction);
  } catch (error) {
    console.error(`Error executing modal handler for customId "${customId}":`, error);
    try {
      // Try to reply or follow up with an error message
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'There was an error processing your submission.', flags: MessageFlags.Ephemeral });
      } else { // Modals are usually replied to or deferred, so followUp is common
        await interaction.followUp({ content: 'There was an error processing your submission.', flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      console.error("Failed to send error reply/followUp for modal handler error:", replyError);
    }
  }
}

/**
 * Register a modal submit handler FOR THE GIVEN CLIENT INSTANCE.
 * The customId provided here MUST exactly match the customId set on the ModalBuilder.
 * @param client The Client instance to attach the handler map to.
 * @param customId The exact customId used for the modal.
 * @param handler The async function to execute when a matching modal is submitted.
 */
function registerModalHandler(
  client: Client,
  customId: string,
  handler: (client: Client, interaction: ModalSubmitInteraction) => Promise<void>
) {
  if (!client.modalHandlers) {
    console.error("[registerModalHandler] client.modalHandlers map not found! Initializing fallback.");
    client.modalHandlers = new Map<string, RegisteredModalInfo>();
  }

  const registeredModals = client.modalHandlers;

  if (registeredModals.has(customId)) {
    console.warn(`[!] Overwriting existing modal handler for customId: ${customId}`);
  }

  registeredModals.set(customId, { handler }); // Store the handler
  console.log(`[i] Registered modal handler for customId: ${customId}`);
}

// Default Export for the Event Handler System (called by clientInitializer)
export default async function processModalInteraction(client: Client, interaction: Interaction) {
  await handleModalSubmit(client, interaction);
}

// Named Export for commands/modules to register their modal handlers
export { registerModalHandler };
