import {
  Client,
  CommandInteraction,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  InteractionReplyOptions,
  InteractionUpdateOptions,
  TextBasedChannel,
  DMChannel,
  NewsChannel,
  PartialDMChannel,
  TextChannel as GuildTextChannel,
  ThreadChannel,
  VoiceChannel,
  User
} from 'discord.js';
import { CommandOptions, Giveaway } from '../../../types/commandTypes';
import { registerButtonHandler } from '../../../internalSetup/events/interactionCreate/buttonHandler';
import { registerModalHandler } from '../../../internalSetup/events/interactionCreate/modalSubmitHandler';
import * as giveawayManager from '../../../events/utils/giveawayManager';
import { randomUUID } from 'crypto';

// --- Constants for Button Custom IDs (now treated as prefixes for dynamic ones) ---
const LIST_GIVEAWAYS_BTN = 'giveaway_list_btn';
const CREATE_GIVEAWAY_BTN = 'giveaway_create_btn';

const CREATE_SET_TITLE_BTN_PREFIX = 'gw_create_set_title_btn';
const CREATE_TOGGLE_ENTRY_MODE_BTN_PREFIX = 'gw_create_toggle_entry_btn';
const CREATE_SET_TIME_BTN_PREFIX = 'gw_create_set_time_btn';
const CREATE_SET_PRIZE_BTN_PREFIX = 'gw_create_set_prize_btn';
const CREATE_SET_TRIVIA_QNA_BTN_PREFIX = 'gw_create_set_trivia_qna_btn';
const CREATE_SET_TRIVIA_ATTEMPTS_BTN_PREFIX = 'gw_create_set_trivia_attempts_btn';
const CREATE_BACK_BTN_PREFIX = 'gw_create_back_btn';
const CREATE_START_NOW_BTN_PREFIX = 'gw_create_start_now_btn';
const CREATE_REFRESH_PANEL_BTN_PREFIX = 'gw_create_refresh_panel_btn';

// --- Constants for Modal Custom IDs (now treated as prefixes) ---
const MODAL_SET_TITLE_PREFIX = 'gw_modal_set_title';
const MODAL_SET_TIME_PREFIX = 'gw_modal_set_time';
const MODAL_SET_PRIZE_PREFIX = 'gw_modal_set_prize';
const MODAL_SET_TRIVIA_QNA_PREFIX = 'gw_modal_set_trivia_qna';
const MODAL_SET_TRIVIA_ATTEMPTS_PREFIX = 'gw_modal_set_trivia_attempts';

// --- Constants for Live Giveaway Interactions ---
const GW_ENTER_BTN_PREFIX = 'gw_enter_btn';
const GW_TRIVIA_ANSWER_BTN_PREFIX = 'gw_trivia_answer_btn';
const GW_TRIVIA_ANSWER_MODAL_PREFIX = 'gw_trivia_answer_modal';
const GW_CLAIM_PRIZE_BTN_PREFIX = 'gw_claim_prize_btn';

// Interface for pending giveaway data
interface PendingGiveawayData extends Partial<Omit<Giveaway, 'endTime' | 'startTime'>> {
  durationMs?: number;
}
const pendingGiveaways = new Map<string, PendingGiveawayData>();


type SendableTextChannel = GuildTextChannel | DMChannel | NewsChannel | ThreadChannel | VoiceChannel;

function isSendableChannel(channel: any): channel is SendableTextChannel {
  return channel &&
         typeof channel.send === 'function' &&
         channel.isTextBased() &&
         !channel.partial;
}


const giveawayCommand: CommandOptions = {
  name: 'giveaway',
  description: 'Manage giveaways for this server.',
  testOnly: true,
  requiredIntents: [GatewayIntentBits.Guilds],
  permissionsRequired: [PermissionsBitField.Flags.ManageMessages],

  initialize: (client: Client) => {
    registerButtonHandler(client, LIST_GIVEAWAYS_BTN, handleListGiveawaysButton);
    registerButtonHandler(client, CREATE_GIVEAWAY_BTN, handleCreateGiveawayButton);
    registerButtonHandler(client, CREATE_SET_TITLE_BTN_PREFIX, handleSetTitleButton);
    registerModalHandler(client, MODAL_SET_TITLE_PREFIX, handleSetTitleModal);
    registerButtonHandler(client, CREATE_SET_TIME_BTN_PREFIX, handleSetTimeButton);
    registerModalHandler(client, MODAL_SET_TIME_PREFIX, handleSetTimeModal);
    registerButtonHandler(client, CREATE_SET_PRIZE_BTN_PREFIX, handleSetPrizeButton);
    registerModalHandler(client, MODAL_SET_PRIZE_PREFIX, handleSetPrizeModal);
    registerButtonHandler(client, CREATE_SET_TRIVIA_QNA_BTN_PREFIX, handleSetTriviaQnAButton);
    registerModalHandler(client, MODAL_SET_TRIVIA_QNA_PREFIX, handleSetTriviaQnAModal);
    registerButtonHandler(client, CREATE_SET_TRIVIA_ATTEMPTS_BTN_PREFIX, handleSetTriviaAttemptsButton);
    registerModalHandler(client, MODAL_SET_TRIVIA_ATTEMPTS_PREFIX, handleSetTriviaAttemptsModal);
    registerButtonHandler(client, CREATE_BACK_BTN_PREFIX, handleCreateBackToMainPanel);
    registerButtonHandler(client, CREATE_START_NOW_BTN_PREFIX, handleStartGiveawayNow);
    registerButtonHandler(client, CREATE_TOGGLE_ENTRY_MODE_BTN_PREFIX, handleToggleEntryMode);
    registerButtonHandler(client, CREATE_REFRESH_PANEL_BTN_PREFIX, handleRefreshCreatePanelButton);

    registerButtonHandler(client, GW_ENTER_BTN_PREFIX, handleGiveawayEnterButton);
    registerButtonHandler(client, GW_TRIVIA_ANSWER_BTN_PREFIX, handleTriviaAnswerButton);
    registerModalHandler(client, GW_TRIVIA_ANSWER_MODAL_PREFIX, handleTriviaAnswerModalSubmit);
    registerButtonHandler(client, GW_CLAIM_PRIZE_BTN_PREFIX, handleClaimPrizeButton);

    giveawayManager.scheduleExistingGiveaways(client);
  },

  callback: async (client: Client, interaction: CommandInteraction) => {
    if (!interaction.guildId) {
        await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        return;
    }
    await sendMainGiveawayPanel(interaction);
  },
};

// --- Helper to send Main Panel ---
async function sendMainGiveawayPanel(interaction: CommandInteraction | ButtonInteraction) {
    if (!interaction.guildId) return;
    const activeGiveaways = giveawayManager.getAllGiveaways(interaction.guildId, true);
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎉 Giveaway Management Panel')
      .setDescription('Select an option below to manage giveaways.')
      .addFields({ name: 'Active Giveaways', value: `${activeGiveaways.length}`, inline: true })
      .setFooter({ text: `Guild ID: ${interaction.guildId}` })
      .setTimestamp();
    const listButton = new ButtonBuilder().setCustomId(LIST_GIVEAWAYS_BTN).setLabel('List Giveaways').setStyle(ButtonStyle.Primary).setEmoji('📊');
    const createButton = new ButtonBuilder().setCustomId(CREATE_GIVEAWAY_BTN).setLabel('Start a New Giveaway').setStyle(ButtonStyle.Success).setEmoji('➕');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(listButton, createButton);

    const basePayload: InteractionUpdateOptions = { embeds: [embed], components: [row] };

    if (interaction instanceof CommandInteraction) {
        const replyPayload: InteractionReplyOptions = {
            ...basePayload,
            content: basePayload.content === null ? undefined : basePayload.content,
            flags: MessageFlags.Ephemeral
        };
        if (interaction.replied || interaction.deferred) { await interaction.followUp(replyPayload); } else { await interaction.reply(replyPayload); }
    } else if (interaction instanceof ButtonInteraction) {
        await interaction.update(basePayload);
    }
}

// --- Initial Panel Button Handlers ---
async function handleListGiveawaysButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    await interaction.update({ content: 'List Giveaways - Not Implemented Yet', embeds: [], components: [] });
}
async function handleCreateGiveawayButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    if (!interaction.guildId || !interaction.member) return;
    const creationSessionId = interaction.id;
    pendingGiveaways.set(creationSessionId, {
        guildId: interaction.guildId, creatorId: interaction.user.id, entryMode: 'button',
        title: 'Untitled Giveaway', prize: 'Not Set',
        durationMs: 60 * 60 * 1000, winnerCount: 1,
        maxTriviaAttempts: -1,
    });
    await sendCreateGiveawayPanel(interaction, creationSessionId);
}

// --- Create Giveaway Panel & Handlers ---

async function buildCreateGiveawayPanelBasePayload(creationSessionId: string): Promise<InteractionUpdateOptions> {
    const currentGiveawayData = pendingGiveaways.get(creationSessionId);
    let content: string | undefined = undefined;

    if (!currentGiveawayData) {
        console.error(`[buildCreateGiveawayPanelBasePayload] No pending giveaway data for session ${creationSessionId}`);
        content = 'Error: Could not find giveaway creation session.';
        return { content, embeds:[], components: []};
    }

    const footerText = "Click 🔄 Refresh to see changes after setting values in pop-ups.";

    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📝 Create New Giveaway')
        .setDescription('Configure the details for your new giveaway.')
        .addFields(
            { name: 'Title', value: currentGiveawayData.title || 'Not Set', inline: true },
            { name: 'Prize Description', value: currentGiveawayData.prize || 'Not Set', inline: true },
            { name: 'Entry Mode', value: currentGiveawayData.entryMode?.toUpperCase() || 'BUTTON', inline: true },
            { name: 'Duration', value: giveawayManager.formatDuration(currentGiveawayData.durationMs || 0), inline: true },
            { name: 'Winner Count', value: `${currentGiveawayData.winnerCount || 1}`, inline: true}
        ).setFooter({ text: footerText });

    if (currentGiveawayData.entryMode === 'trivia') {
        const attemptsText = (currentGiveawayData.maxTriviaAttempts === undefined || currentGiveawayData.maxTriviaAttempts <= 0)
            ? 'Infinite'
            : `${currentGiveawayData.maxTriviaAttempts}`;
        embed.addFields(
            { name: 'Trivia Question', value: currentGiveawayData.triviaQuestion || 'Not Set', inline: false },
            { name: 'Trivia Answer', value: currentGiveawayData.triviaAnswer || 'Not Set', inline: true },
            { name: 'Max Trivia Attempts', value: attemptsText, inline: true }
        );
    }

    const titleButton = new ButtonBuilder().setCustomId(`${CREATE_SET_TITLE_BTN_PREFIX}_${creationSessionId}`).setLabel('Set Title').setStyle(ButtonStyle.Secondary);
    const prizeButton = new ButtonBuilder().setCustomId(`${CREATE_SET_PRIZE_BTN_PREFIX}_${creationSessionId}`).setLabel('Set Prize').setStyle(ButtonStyle.Secondary);
    const timeButton = new ButtonBuilder().setCustomId(`${CREATE_SET_TIME_BTN_PREFIX}_${creationSessionId}`).setLabel('Set Duration').setStyle(ButtonStyle.Secondary);
    const nextMode = currentGiveawayData.entryMode === 'button' ? 'reaction' : currentGiveawayData.entryMode === 'reaction' ? 'trivia' : 'button';
    const entryModeButton = new ButtonBuilder()
        .setCustomId(`${CREATE_TOGGLE_ENTRY_MODE_BTN_PREFIX}_${creationSessionId}_${nextMode}`)
        .setLabel(`Mode: ${currentGiveawayData.entryMode?.toUpperCase()}`)
        .setStyle(ButtonStyle.Primary);
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(titleButton, prizeButton, timeButton, entryModeButton);

    const triviaQnAButton = new ButtonBuilder()
        .setCustomId(`${CREATE_SET_TRIVIA_QNA_BTN_PREFIX}_${creationSessionId}`)
        .setLabel(currentGiveawayData.triviaQuestion ? 'Edit Trivia Q&A' : 'Set Trivia Q&A')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentGiveawayData.entryMode !== 'trivia');

    const triviaAttemptsButton = new ButtonBuilder()
        .setCustomId(`${CREATE_SET_TRIVIA_ATTEMPTS_BTN_PREFIX}_${creationSessionId}`)
        .setLabel('Set Trivia Attempts')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentGiveawayData.entryMode !== 'trivia');

    const rowTrivia = new ActionRowBuilder<ButtonBuilder>().addComponents(triviaQnAButton, triviaAttemptsButton);


    const backButton = new ButtonBuilder().setCustomId(`${CREATE_BACK_BTN_PREFIX}_${creationSessionId}`).setLabel('Back').setStyle(ButtonStyle.Danger);
    const startButton = new ButtonBuilder().setCustomId(`${CREATE_START_NOW_BTN_PREFIX}_${creationSessionId}`).setLabel('Start Now').setStyle(ButtonStyle.Success);
    const refreshButton = new ButtonBuilder().setCustomId(`${CREATE_REFRESH_PANEL_BTN_PREFIX}_${creationSessionId}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary);

    const rowActions = new ActionRowBuilder<ButtonBuilder>().addComponents(backButton, refreshButton, startButton);

    const components = [row1, rowTrivia, rowActions];

    return { content: content === null ? undefined : content, embeds: [embed], components };
}

async function sendCreateGiveawayPanel(interaction: ButtonInteraction, creationSessionId: string) {
    const payload = await buildCreateGiveawayPanelBasePayload(creationSessionId);
    await interaction.update(payload).catch(async (error) => {
        console.error("Failed to update create panel from button interaction:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "Error refreshing panel.", flags: MessageFlags.Ephemeral });
        }
    });
}


// --- Handlers for Create Giveaway Panel ---

async function handleSetTitleButton(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_SET_TITLE_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action.", flags: MessageFlags.Ephemeral}); return; }
    const currentData = pendingGiveaways.get(creationSessionId);
    const modal = new ModalBuilder().setCustomId(`${MODAL_SET_TITLE_PREFIX}_${creationSessionId}`).setTitle('Set Giveaway Title');
    const titleInput = new TextInputBuilder().setCustomId('giveawayTitle').setLabel("What is the title?").setStyle(TextInputStyle.Short)
        .setValue(currentData?.title !== 'Untitled Giveaway' ? currentData?.title || '' : '').setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput));
    await interaction.showModal(modal);
}
async function handleSetTitleModal(client: Client, interaction: ModalSubmitInteraction) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, MODAL_SET_TITLE_PREFIX);
    if (!creationSessionId) {
        if (!interaction.replied && !interaction.deferred) await interaction.reply({content: "Error processing action (session ID missing).", flags: MessageFlags.Ephemeral});
        return;
    }
    const title = interaction.fields.getTextInputValue('giveawayTitle');
    const currentData = pendingGiveaways.get(creationSessionId);
    if (currentData) { currentData.title = title; pendingGiveaways.set(creationSessionId, currentData); }

    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
    }
}

async function handleToggleEntryMode(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const basePrefix = CREATE_TOGGLE_ENTRY_MODE_BTN_PREFIX;
    if (!interaction.customId.startsWith(basePrefix + '_')) {
        await interaction.reply({content: "Error processing this action.", flags: MessageFlags.Ephemeral}); return;
    }
    const paramsString = interaction.customId.substring(basePrefix.length + 1);
    const params = paramsString.split('_');
    if (params.length < 2) {
        await interaction.reply({content: "Error processing this action.", flags: MessageFlags.Ephemeral}); return;
    }
    const creationSessionId = params[0];
    const newMode = params[1] as Giveaway['entryMode'];

    const currentData = pendingGiveaways.get(creationSessionId);
    if (currentData) {
        currentData.entryMode = newMode;
        if (newMode !== 'trivia') {
            delete currentData.triviaQuestion;
            delete currentData.triviaAnswer;
            delete currentData.maxTriviaAttempts;
        } else {
            if (currentData.maxTriviaAttempts === undefined) currentData.maxTriviaAttempts = -1;
        }
        pendingGiveaways.set(creationSessionId, currentData);
    }
    await sendCreateGiveawayPanel(interaction, creationSessionId);
}

async function handleSetTimeButton(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_SET_TIME_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action.", flags: MessageFlags.Ephemeral}); return; }
    const modal = new ModalBuilder().setCustomId(`${MODAL_SET_TIME_PREFIX}_${creationSessionId}`).setTitle('Set Giveaway Duration');
    const timeInput = new TextInputBuilder().setCustomId('giveawayDuration').setLabel("Duration (e.g., 30m, 2h, 1d, HH:MM:SS)").setStyle(TextInputStyle.Short)
        .setPlaceholder("Examples: 10m, 2h, 1d / 01:30:00, 45:00").setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput));
    await interaction.showModal(modal);
}
async function handleSetTimeModal(client: Client, interaction: ModalSubmitInteraction) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, MODAL_SET_TIME_PREFIX);
    if (!creationSessionId) {
        if (!interaction.replied && !interaction.deferred) await interaction.reply({content: "Error processing action (session ID missing).", flags: MessageFlags.Ephemeral});
        return;
    }
    const durationStr = interaction.fields.getTextInputValue('giveawayDuration');
    const durationMs = giveawayManager.parseDuration(durationStr);
    if (durationMs === null || durationMs <= 0) {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Invalid duration format. Setting not applied.', flags: MessageFlags.Ephemeral });
        }
        return;
    }
    const currentData = pendingGiveaways.get(creationSessionId);
    if (currentData) { currentData.durationMs = durationMs; pendingGiveaways.set(creationSessionId, currentData); }
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
    }
}

async function handleSetPrizeButton(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_SET_PRIZE_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action.", flags: MessageFlags.Ephemeral}); return; }
    const currentData = pendingGiveaways.get(creationSessionId);
    const modal = new ModalBuilder().setCustomId(`${MODAL_SET_PRIZE_PREFIX}_${creationSessionId}`).setTitle('Set Giveaway Prize');
    const prizeInput = new TextInputBuilder().setCustomId('giveawayPrize').setLabel("What is the prize?").setStyle(TextInputStyle.Paragraph)
        .setValue(currentData?.prize !== 'Not Set' ? currentData?.prize || '' : '').setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(prizeInput));
    await interaction.showModal(modal);
}
async function handleSetPrizeModal(client: Client, interaction: ModalSubmitInteraction) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, MODAL_SET_PRIZE_PREFIX);
    if (!creationSessionId) {
        if (!interaction.replied && !interaction.deferred) await interaction.reply({content: "Error processing action (session ID missing).", flags: MessageFlags.Ephemeral});
        return;
    }
    const prize = interaction.fields.getTextInputValue('giveawayPrize');
    const currentData = pendingGiveaways.get(creationSessionId);
    if (currentData) { currentData.prize = prize; pendingGiveaways.set(creationSessionId, currentData); }
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
    }
}

async function handleSetTriviaQnAButton(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_SET_TRIVIA_QNA_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action (session ID missing).", flags: MessageFlags.Ephemeral}); return; }
    const currentData = pendingGiveaways.get(creationSessionId);

    const modal = new ModalBuilder().setCustomId(`${MODAL_SET_TRIVIA_QNA_PREFIX}_${creationSessionId}`).setTitle('Set Trivia Question & Answer');
    const questionInput = new TextInputBuilder()
        .setCustomId('giveawayTriviaQuestion')
        .setLabel("Enter the trivia question:")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(currentData?.triviaQuestion || '')
        .setRequired(true);
    const answerInput = new TextInputBuilder()
        .setCustomId('giveawayTriviaAnswer')
        .setLabel("Enter the exact answer (case-insensitive):")
        .setStyle(TextInputStyle.Short)
        .setValue(currentData?.triviaAnswer || '')
        .setRequired(true);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(questionInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(answerInput);
    modal.addComponents(firstActionRow, secondActionRow);
    await interaction.showModal(modal);
}

async function handleSetTriviaQnAModal(client: Client, interaction: ModalSubmitInteraction) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, MODAL_SET_TRIVIA_QNA_PREFIX);
    if (!creationSessionId) {
        if (!interaction.replied && !interaction.deferred) await interaction.reply({content: "Error processing action (session ID missing).", flags: MessageFlags.Ephemeral});
        return;
    }
    const question = interaction.fields.getTextInputValue('giveawayTriviaQuestion');
    const answer = interaction.fields.getTextInputValue('giveawayTriviaAnswer');

    const currentData = pendingGiveaways.get(creationSessionId);
    if (currentData) {
        currentData.triviaQuestion = question;
        currentData.triviaAnswer = answer;
        pendingGiveaways.set(creationSessionId, currentData);
    }
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
    }
}

async function handleSetTriviaAttemptsButton(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_SET_TRIVIA_ATTEMPTS_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action.", flags: MessageFlags.Ephemeral}); return; }
    const currentData = pendingGiveaways.get(creationSessionId);

    const modal = new ModalBuilder().setCustomId(`${MODAL_SET_TRIVIA_ATTEMPTS_PREFIX}_${creationSessionId}`).setTitle('Set Max Trivia Attempts');
    const attemptsInput = new TextInputBuilder()
        .setCustomId('giveawayMaxTriviaAttempts')
        .setLabel("Max attempts (-1 or 0 for infinite):")
        .setStyle(TextInputStyle.Short)
        .setValue(currentData?.maxTriviaAttempts?.toString() || '-1')
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(attemptsInput));
    await interaction.showModal(modal);
}

async function handleSetTriviaAttemptsModal(client: Client, interaction: ModalSubmitInteraction) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, MODAL_SET_TRIVIA_ATTEMPTS_PREFIX);
    if (!creationSessionId) {
        if (!interaction.replied && !interaction.deferred) await interaction.reply({content: "Error processing action (session ID missing).", flags: MessageFlags.Ephemeral});
        return;
    }
    const attemptsStr = interaction.fields.getTextInputValue('giveawayMaxTriviaAttempts');
    const attempts = parseInt(attemptsStr, 10);

    if (isNaN(attempts)) {
        if (!interaction.replied && !interaction.deferred) await interaction.reply({content: "Invalid number for attempts.", flags: MessageFlags.Ephemeral});
        return;
    }

    const currentData = pendingGiveaways.get(creationSessionId);
    if (currentData) {
        currentData.maxTriviaAttempts = attempts <= 0 ? -1 : attempts;
        pendingGiveaways.set(creationSessionId, currentData);
    }
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
    }
}


async function handleCreateBackToMainPanel(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_BACK_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action.", flags: MessageFlags.Ephemeral}); return; }
    pendingGiveaways.delete(creationSessionId);
    await sendMainGiveawayPanel(interaction);
}

async function handleRefreshCreatePanelButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_REFRESH_PANEL_BTN_PREFIX);
    if (!creationSessionId) {
        await interaction.reply({ content: "Error: Could not find session to refresh.", flags: MessageFlags.Ephemeral });
        return;
    }
    await sendCreateGiveawayPanel(interaction, creationSessionId);
}


async function handleStartGiveawayNow(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_START_NOW_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action.", flags: MessageFlags.Ephemeral}); return; }
    const giveawayData = pendingGiveaways.get(creationSessionId);
    const currentChannel = interaction.channel;
    if (!interaction.guild || !currentChannel || !interaction.guildId ) {
        await interaction.update({ content: "Error: Could not determine guild or channel.", embeds: [], components: [] }); return;
    }
    if (!isSendableChannel(currentChannel)) {
        await interaction.update({content: "Error: Cannot send giveaway to this channel type.", embeds: [], components: []}); return;
    }

    if (!giveawayData || !giveawayData.title || giveawayData.title === 'Untitled Giveaway' ||
        !giveawayData.prize || giveawayData.prize === 'Not Set' ||
        giveawayData.durationMs === undefined || giveawayData.durationMs <= 0) {
        await interaction.reply({ content: 'Please set title, prize, and a valid duration before starting.', flags: MessageFlags.Ephemeral }); return;
    }
    if (giveawayData.entryMode === 'trivia' && (!giveawayData.triviaQuestion || !giveawayData.triviaAnswer)) {
        await interaction.reply({ content: 'For trivia, set question and answer.', flags: MessageFlags.Ephemeral }); return;
    }

    const actualEndTime = Date.now() + giveawayData.durationMs;
    const giveawayUniqueId = randomUUID();

    let description = `A new giveaway has started! Click the button below to participate for a chance to win.`;
    if (giveawayData.entryMode === 'trivia' && giveawayData.maxTriviaAttempts && giveawayData.maxTriviaAttempts > 0) {
        description += `\n*You have ${giveawayData.maxTriviaAttempts} attempt(s) for the trivia.*`;
    }


    const announcementEmbed = new EmbedBuilder().setTitle(`🎉 ${giveawayData.title} 🎉`)
        .setDescription(description)
        .addFields({ name: 'Ends In', value: `<t:${Math.floor(actualEndTime / 1000)}:R>` })
        .setColor(0x2ECC71).setFooter({ text: `Started by ${interaction.user.tag}` });

    if (giveawayData.entryMode === 'trivia' && giveawayData.triviaQuestion) {
        announcementEmbed.addFields({ name: 'Trivia Question', value: giveawayData.triviaQuestion });
    }
    
    let entryComponent;
    if (giveawayData.entryMode === 'trivia') {
        entryComponent = new ButtonBuilder()
            .setCustomId(`${GW_TRIVIA_ANSWER_BTN_PREFIX}_${giveawayUniqueId}`)
            .setLabel('✏️ Answer Trivia')
            .setStyle(ButtonStyle.Primary);
    } else {
        entryComponent = new ButtonBuilder()
            .setCustomId(`${GW_ENTER_BTN_PREFIX}_${giveawayUniqueId}`)
            .setLabel('🎉 Enter Giveaway')
            .setStyle(ButtonStyle.Success);
    }
    const announcementRow = new ActionRowBuilder<ButtonBuilder>().addComponents(entryComponent);
    try {
        const announcementMessage = await currentChannel.send({ embeds: [announcementEmbed], components: [announcementRow] });
        if (!announcementMessage) { await interaction.update({content: "Failed to send announcement.", embeds: [], components: []}); return; }

        const finalGiveawayData: Giveaway = {
            guildId: interaction.guildId,
            channelId: announcementMessage.channelId,
            messageId: announcementMessage.id,
            id: giveawayUniqueId,
            title: giveawayData.title!,
            prize: giveawayData.prize!,
            endTime: actualEndTime,
            startTime: Date.now(),
            creatorId: giveawayData.creatorId!,
            entryMode: giveawayData.entryMode || 'button',
            winnerCount: giveawayData.winnerCount || 1,
            participants: [],
            winners: [],
            ended: false,
            cancelled: false,
            triviaQuestion: giveawayData.triviaQuestion,
            triviaAnswer: giveawayData.triviaAnswer,
            maxTriviaAttempts: (giveawayData.maxTriviaAttempts === undefined || giveawayData.maxTriviaAttempts <= 0) ? -1 : giveawayData.maxTriviaAttempts,
            requiredRoles: giveawayData.requiredRoles,
            blockedRoles: giveawayData.blockedRoles,
            scheduledStartTime: undefined
        };

        const createdGiveaway = giveawayManager.addGiveaway(finalGiveawayData);
        pendingGiveaways.delete(creationSessionId);

        if (createdGiveaway) {
            giveawayManager.scheduleGiveawayEnd(client, createdGiveaway);
        }
        // Return to main panel after starting
        await sendMainGiveawayPanel(interaction);

    } catch (e) { console.error("Error starting giveaway:", e); await interaction.update({ content: "Error starting giveaway.", embeds: [], components: [] }); }
}

// --- Handlers for Live Giveaway Interactions ---

async function handleGiveawayEnterButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    const giveawayId = giveawayManager.getSessionIdFromCustomId(interaction.customId, GW_ENTER_BTN_PREFIX);
    if (!giveawayId) {
        await interaction.reply({ content: "Error identifying this giveaway.", flags: MessageFlags.Ephemeral });
        return;
    }

    const giveaway = giveawayManager.getGiveaway(giveawayId);
    if (!giveaway) {
         await interaction.reply({ content: "This giveaway could not be found.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (giveaway.ended || giveaway.cancelled || giveaway.endTime <= Date.now()) {
        await interaction.reply({ content: "This giveaway is no longer active or has ended.", flags: MessageFlags.Ephemeral });
        return;
    }

    const added = giveawayManager.addParticipant(giveawayId, interaction.user.id);
    if (added) {
        await interaction.reply({ content: "You have successfully entered the giveaway!", flags: MessageFlags.Ephemeral });
    } else {
        if (giveaway.participants.includes(interaction.user.id)) {
            await interaction.reply({ content: "You are already entered in this giveaway!", flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: "Could not enter the giveaway at this time.", flags: MessageFlags.Ephemeral });
        }
    }
}

async function handleTriviaAnswerButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    const giveawayId = giveawayManager.getSessionIdFromCustomId(interaction.customId, GW_TRIVIA_ANSWER_BTN_PREFIX);
    if (!giveawayId) {
        await interaction.reply({ content: "Error identifying this giveaway for trivia.", flags: MessageFlags.Ephemeral });
        return;
    }
    const giveaway = giveawayManager.getGiveaway(giveawayId);
    if (!giveaway) {
        await interaction.reply({ content: "This giveaway could not be found.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (giveaway.ended || giveaway.cancelled || giveaway.endTime <= Date.now()) {
        await interaction.reply({ content: "This trivia giveaway is no longer active.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (giveaway.participants.includes(interaction.user.id)) {
        await interaction.reply({ content: "You have already successfully answered the trivia for this giveaway!", flags: MessageFlags.Ephemeral });
        return;
    }
    if (!giveaway.triviaQuestion) {
        await interaction.reply({ content: "This trivia giveaway doesn't seem to have a question set up.", flags: MessageFlags.Ephemeral });
        return;
    }

    const attemptsMade = giveawayManager.getUserTriviaAttempts(giveawayId, interaction.user.id);
    const maxAttempts = (giveaway.maxTriviaAttempts === undefined || giveaway.maxTriviaAttempts <= 0) ? -1 : giveaway.maxTriviaAttempts;

    if (maxAttempts !== -1 && attemptsMade >= maxAttempts) {
        await interaction.reply({ content: `You have no more attempts left for this trivia. (Max: ${maxAttempts})`, flags: MessageFlags.Ephemeral });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`${GW_TRIVIA_ANSWER_MODAL_PREFIX}_${giveawayId}`)
        .setTitle(`Trivia: ${giveaway.title}`);
    const answerInput = new TextInputBuilder()
        .setCustomId('triviaUserAnswer')
        .setLabel(giveaway.triviaQuestion)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(answerInput));
    await interaction.showModal(modal);
}

async function handleTriviaAnswerModalSubmit(client: Client, interaction: ModalSubmitInteraction): Promise<void> {
    const giveawayId = giveawayManager.getSessionIdFromCustomId(interaction.customId, GW_TRIVIA_ANSWER_MODAL_PREFIX);
    if (!giveawayId) {
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "Error processing trivia answer (giveaway ID missing).", flags: MessageFlags.Ephemeral });
        return;
    }

    const giveaway = giveawayManager.getGiveaway(giveawayId);
    if (!giveaway) {
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "This giveaway could not be found.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (giveaway.ended || giveaway.cancelled || giveaway.endTime <= Date.now()) {
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "This trivia giveaway is no longer active.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (giveaway.participants.includes(interaction.user.id)) {
         if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "You have already successfully answered the trivia for this giveaway!", flags: MessageFlags.Ephemeral });
        return;
    }
    if (!giveaway.triviaAnswer) {
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "The answer for this trivia is not set. Please contact an admin.", flags: MessageFlags.Ephemeral });
        return;
    }

    const userAnswer = interaction.fields.getTextInputValue('triviaUserAnswer');
    const maxAttempts = (giveaway.maxTriviaAttempts === undefined || giveaway.maxTriviaAttempts <= 0) ? -1 : giveaway.maxTriviaAttempts;
    let attemptsMade = giveawayManager.getUserTriviaAttempts(giveawayId, interaction.user.id);

    if (userAnswer.toLowerCase() === giveaway.triviaAnswer.toLowerCase()) {
        giveawayManager.addParticipant(giveawayId, interaction.user.id);
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "Correct! You've entered the giveaway. 🎉", flags: MessageFlags.Ephemeral });
    } else {
        attemptsMade = giveawayManager.incrementUserTriviaAttempts(giveawayId, interaction.user.id);
        let replyContent = "Sorry, that's not the right answer. ";
        if (maxAttempts !== -1) {
            const attemptsLeft = maxAttempts - attemptsMade;
            if (attemptsLeft > 0) {
                replyContent += `You have **${attemptsLeft}** attempt(s) left.`;
            } else {
                replyContent += `You have no more attempts left.`;
            }
        } else {
            replyContent += "Better luck next time!";
        }
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: replyContent, flags: MessageFlags.Ephemeral });
    }
}


// --- New Handler for Claim Prize Button ---
async function handleClaimPrizeButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    const giveawayId = giveawayManager.getSessionIdFromCustomId(interaction.customId, GW_CLAIM_PRIZE_BTN_PREFIX);
    if (!giveawayId) {
        await interaction.reply({ content: "Error identifying this giveaway.", flags: MessageFlags.Ephemeral });
        return;
    }

    const giveaway = giveawayManager.getGiveaway(giveawayId);
    if (!giveaway) {
        await interaction.reply({ content: "This giveaway could not be found.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (!giveaway.ended) {
         await interaction.reply({ content: "This giveaway has not ended yet.", flags: MessageFlags.Ephemeral });
        return;
    }

    const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
    const isCreator = interaction.user.id === giveaway.creatorId;
    const isWinner = giveaway.winners.includes(interaction.user.id);

    if (isWinner) {
        await interaction.reply({ content: `🎁 Congratulations! Your prize is: ||${giveaway.prize}||`, flags: MessageFlags.Ephemeral });
    } else if (isAdmin || isCreator) {
        await interaction.reply({
            content: `You didn't win this one. As an admin/creator, you can see the prize: ||${giveaway.prize}||`,
            flags: MessageFlags.Ephemeral
        });
    } else {
        await interaction.reply({ content: "Nice try! But you are not the winner of this giveaway... Maybe next time!", flags: MessageFlags.Ephemeral });
    }
}


export = giveawayCommand;
