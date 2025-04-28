import {
  Client,
  CommandInteraction,
  GatewayIntentBits,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  MessageFlags
} from 'discord.js';
import { registerModalHandler } from '../../../internalSetup/events/interactionCreate/modalSubmitHandler'; // Adjust path if needed
import { CommandOptions } from '../../../types/commandTypes'; // Adjust path if needed

const MODAL_ID = 'example_feedback_modal';

const exampleModalCommand: CommandOptions = {
  name: 'modal-example',
  description: 'Shows an example modal popup.',
  testOnly: true,
  requiredIntents: [GatewayIntentBits.Guilds],

  initialize: (client: Client) => {
    registerModalHandler(
      client,
      MODAL_ID,
      handleModalSubmission // The function to call when the modal is submitted
    );
  },

  callback: async (client: Client, interaction: CommandInteraction) => {
    // Create the modal
    const modal = new ModalBuilder()
      .setCustomId(MODAL_ID) // Use the defined ID
      .setTitle('My Example Modal');

    // Create text input components
    const favoriteColorInput = new TextInputBuilder()
      .setCustomId('favoriteColorInput') // ID to retrieve the value later
      .setLabel("What's your favorite color?")
      .setStyle(TextInputStyle.Short) // Short input for single line
      .setRequired(true)
      .setPlaceholder('e.g., Blue');

    const feedbackInput = new TextInputBuilder()
      .setCustomId('feedbackInput')
      .setLabel("Any feedback for us?")
      .setStyle(TextInputStyle.Paragraph) // Paragraph for longer text
      .setRequired(false) // Optional field
      .setPlaceholder('Enter your feedback here...');

    // Add inputs to the modal (each needs its own ActionRow)
    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(favoriteColorInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(feedbackInput);

    modal.addComponents(firstActionRow, secondActionRow);

    // Show the modal to the user
    try {
      await interaction.showModal(modal);
    } catch (error) {
      console.error("Failed to show modal:", error);
      // Inform user if modal fails to show
      if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Could not display the modal.', flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
          await interaction.followUp({ content: 'Could not display the modal.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};

/**
 * Handles the submission of the example modal.
 */
async function handleModalSubmission(client: Client, interaction: ModalSubmitInteraction): Promise<void> {
  // Get the data entered by the user
  const favoriteColor = interaction.fields.getTextInputValue('favoriteColorInput');
  const feedback = interaction.fields.getTextInputValue('feedbackInput'); // Optional field

  console.log(`Modal submitted: Color='${favoriteColor}', Feedback='${feedback}' (Custom ID: ${interaction.customId})`);

  let responseMessage = `Thanks for submitting! Your favorite color is ${favoriteColor}.`;
  if (feedback) {
    responseMessage += `\nWe appreciate your feedback: "${feedback}"`;
  } else {
    responseMessage += `\nNo feedback provided.`;
  }

  try {
    // Reply to the interaction (modals *must* be acknowledged)
    await interaction.reply({
      content: responseMessage,
      flags: MessageFlags.Ephemeral // Keep the confirmation private
    });
  } catch (error) {
    console.error("Failed to reply to modal submission:", error);
    // If initial reply fails, we can't really follow up easily
  }
}

export = exampleModalCommand;
