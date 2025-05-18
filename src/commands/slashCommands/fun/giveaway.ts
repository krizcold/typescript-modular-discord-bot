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
  User,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuInteraction,
  GuildMember,
  Colors
} from 'discord.js';
import { CommandOptions, Giveaway } from '../../../types/commandTypes';
import { registerButtonHandler } from '../../../internalSetup/events/interactionCreate/buttonHandler';
import { registerModalHandler } from '../../../internalSetup/events/interactionCreate/modalSubmitHandler';
import { registerDropdownHandler } from '../../../internalSetup/events/interactionCreate/dropdownHandler';
import * as giveawayManager from '../../../events/utils/giveawayManager';
import { randomUUID } from 'crypto';

// --- Constants for Button Custom IDs (now treated as prefixes for dynamic ones) ---
const LIST_GIVEAWAYS_BTN = 'giveaway_list_btn'; // From main panel to list panel
const CREATE_GIVEAWAY_BTN = 'giveaway_create_btn'; // From main panel to create panel

// Create Panel
const CREATE_SET_TITLE_BTN_PREFIX = 'gw_create_set_title_btn';
const CREATE_TOGGLE_ENTRY_MODE_BTN_PREFIX = 'gw_create_toggle_entry_btn';
const CREATE_SET_TIME_BTN_PREFIX = 'gw_create_set_time_btn';
const CREATE_SET_PRIZE_BTN_PREFIX = 'gw_create_set_prize_btn';
const CREATE_SET_TRIVIA_QNA_BTN_PREFIX = 'gw_create_set_trivia_qna_btn';
const CREATE_SET_TRIVIA_ATTEMPTS_BTN_PREFIX = 'gw_create_set_trivia_attempts_btn';
const CREATE_BACK_BTN_PREFIX = 'gw_create_back_btn'; // Back from create to main panel
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

// --- New Constants for List/Details Panels ---
const LIST_PANEL_PAGE_BTN_PREFIX = 'gw_list_page_btn';
const LIST_PANEL_SELECT_GA_PREFIX = 'gw_list_select_ga';
const LIST_PANEL_BACK_TO_MAIN_BTN_PREFIX = 'gw_list_back_main_btn';

const DETAIL_PANEL_ACTION_BTN_PREFIX = 'gw_detail_action_btn'; // For Remove, Cancel, Finish
const DETAIL_PANEL_BACK_TO_LIST_BTN_PREFIX = 'gw_detail_back_list_btn';

// Action types for DETAIL_PANEL_ACTION_BTN_PREFIX
const ACTION_TYPE_REMOVE = 'remove';
const ACTION_TYPE_CANCEL = 'cancel';
const ACTION_TYPE_FINISH = 'finish';

const GIVEAWAYS_PER_PAGE = 10; // Max 25, but 10 is more readable in embed
const GIVEAWAY_NAME_DISPLAY_CAP = 25;


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
  requiredIntents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers], // Added GuildMembers for fetching creator/winners
  permissionsRequired: [PermissionsBitField.Flags.ManageMessages], // Base permission for command

  initialize: (client: Client) => {
    // Main Panel
    registerButtonHandler(client, LIST_GIVEAWAYS_BTN, handleListGiveawaysButton);
    registerButtonHandler(client, CREATE_GIVEAWAY_BTN, handleCreateGiveawayButton);

    // Create Panel
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

    // Live Giveaway
    registerButtonHandler(client, GW_ENTER_BTN_PREFIX, handleGiveawayEnterButton);
    registerButtonHandler(client, GW_TRIVIA_ANSWER_BTN_PREFIX, handleTriviaAnswerButton);
    registerModalHandler(client, GW_TRIVIA_ANSWER_MODAL_PREFIX, handleTriviaAnswerModalSubmit);
    registerButtonHandler(client, GW_CLAIM_PRIZE_BTN_PREFIX, handleClaimPrizeButton);

    // List Panel
    registerButtonHandler(client, LIST_PANEL_PAGE_BTN_PREFIX, handleListPageNavigationButton);
    registerDropdownHandler(client, LIST_PANEL_SELECT_GA_PREFIX, handleGiveawaySelectedFromList);
    registerButtonHandler(client, LIST_PANEL_BACK_TO_MAIN_BTN_PREFIX, handleListPanelBackToMain);
    
    // Detail Panel
    registerButtonHandler(client, DETAIL_PANEL_ACTION_BTN_PREFIX, handleDetailPanelActionButton);
    registerButtonHandler(client, DETAIL_PANEL_BACK_TO_LIST_BTN_PREFIX, handleDetailPanelBackToListButton);


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
    // Main panel shows ACTIVE giveaways count
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
        // Ensure pending giveaway creation session (if any) is cleared when returning to main panel
        const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_BACK_BTN_PREFIX) ||
                                  giveawayManager.getSessionIdFromCustomId(interaction.customId, LIST_PANEL_BACK_TO_MAIN_BTN_PREFIX);
        if (creationSessionId) {
            pendingGiveaways.delete(creationSessionId);
        }
        await interaction.update(basePayload);
    }
}

// --- Initial Panel Button Handlers ---
async function handleListGiveawaysButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    if (!interaction.guildId) {
        await interaction.reply({ content: "Error: Guild ID not found.", flags: MessageFlags.Ephemeral }); return;
    }
    const sessionId = interaction.id; // Use interaction ID as session ID for list navigation
    await sendListGiveawaysPanel(client, interaction, sessionId, 0);
}

async function handleCreateGiveawayButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    if (!interaction.guildId || !interaction.member) return;
    const creationSessionId = interaction.id; // Use interaction ID as session ID for creation
    pendingGiveaways.set(creationSessionId, {
        guildId: interaction.guildId, creatorId: interaction.user.id, entryMode: 'button',
        title: 'Untitled Giveaway', prize: 'Not Set',
        durationMs: 60 * 60 * 1000, winnerCount: 1,
        maxTriviaAttempts: -1, // Default for non-trivia or infinite
    });
    await sendCreateGiveawayPanel(interaction, creationSessionId);
}


// --- LIST GIVEAWAYS PANEL ---
async function sendListGiveawaysPanel(client: Client, interaction: ButtonInteraction | StringSelectMenuInteraction, sessionId: string, page: number) {
    if (!interaction.guildId) return;

    const allGiveawaysInGuild = giveawayManager.getAllGiveaways(interaction.guildId, false); // false = get all (active and ended)
    
    const totalPages = Math.max(1, Math.ceil(allGiveawaysInGuild.length / GIVEAWAYS_PER_PAGE));
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));

    const startIndex = currentPage * GIVEAWAYS_PER_PAGE;
    const endIndex = startIndex + GIVEAWAYS_PER_PAGE;
    const giveawaysOnPage = allGiveawaysInGuild.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
        .setColor(0x1ABC9C)
        .setTitle(`📘 List of Giveaways (Page ${currentPage + 1} of ${totalPages})`)
        .setFooter({ text: `Session ID: ${sessionId}`});

    if (giveawaysOnPage.length === 0) {
        embed.setDescription("No giveaways found in this server.");
    } else {
        const giveawayListString = giveawaysOnPage.map(g => {
            const cappedName = g.title.length > GIVEAWAY_NAME_DISPLAY_CAP 
                             ? `${g.title.substring(0, GIVEAWAY_NAME_DISPLAY_CAP)}...` 
                             : g.title;
            let status = "";
            if (g.cancelled) {
                status = `🚫 Cancelled <t:${Math.floor(g.endTime / 1000)}:R>`;
            } else if (g.ended) {
                status = `✅ Ended <t:${Math.floor(g.endTime / 1000)}:F>`;
            } else if (g.endTime > Date.now()) {
                status = `⏳ Ends <t:${Math.floor(g.endTime / 1000)}:R>`;
            } else {
                status = `⌛ Ending now / Processing...`; // Should be caught by scheduler
            }
            return `\`${cappedName.replace(/`/g, "'")}\` - ${status}`; // Sanitize backticks in name
        }).join('\n');
        embed.setDescription(giveawayListString || "No giveaways on this page.");
    }

    const components: ActionRowBuilder<any>[] = [];

    // Dropdown for selecting a giveaway
    if (giveawaysOnPage.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`${LIST_PANEL_SELECT_GA_PREFIX}_${sessionId}_${currentPage}`) // Include current page for back context
            .setPlaceholder('Select a giveaway to view details...')
            .addOptions(
                giveawaysOnPage.map(g => new StringSelectMenuOptionBuilder()
                    .setLabel(g.title.substring(0, 100)) // Max label length is 100
                    .setValue(g.id)
                    .setDescription(`Prize: ${g.prize.substring(0,50)}${g.prize.length > 50 ? '...' : ''}`)
                )
            );
        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
    }

    // Pagination buttons
    const prevButton = new ButtonBuilder()
        .setCustomId(`${LIST_PANEL_PAGE_BTN_PREFIX}_${sessionId}_${currentPage - 1}`)
        .setLabel('⬅️ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0);
    const nextButton = new ButtonBuilder()
        .setCustomId(`${LIST_PANEL_PAGE_BTN_PREFIX}_${sessionId}_${currentPage + 1}`)
        .setLabel('Next ➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1);
    const backToMainButton = new ButtonBuilder()
        .setCustomId(`${LIST_PANEL_BACK_TO_MAIN_BTN_PREFIX}_${sessionId}`) // Session ID here is just for consistency, could be static
        .setLabel('Back to Main Panel')
        .setStyle(ButtonStyle.Danger);
        
    const navigationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);
    if (totalPages > 1 || giveawaysOnPage.length > 0) { // Show nav if multiple pages or if there are items
         components.push(navigationRow);
    }
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(backToMainButton));


    await interaction.update({ embeds: [embed], components });
}

async function handleListPageNavigationButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    const parts = interaction.customId.split('_');
    const sessionId = parts[parts.length - 2];
    const page = parseInt(parts[parts.length - 1], 10);
    if (isNaN(page) || !sessionId) {
        await interaction.reply({content: "Error processing page navigation.", flags: MessageFlags.Ephemeral}); return;
    }
    await sendListGiveawaysPanel(client, interaction, sessionId, page);
}

async function handleGiveawaySelectedFromList(client: Client, interaction: StringSelectMenuInteraction): Promise<void> {
    const giveawayId = interaction.values[0];
    const parts = interaction.customId.split('_'); // LIST_PANEL_SELECT_GA_PREFIX_sessionId_page
    const sessionId = parts[parts.length - 2];
    const listPage = parseInt(parts[parts.length - 1], 10);

    if (!giveawayId || !sessionId || isNaN(listPage)) {
         await interaction.reply({content: "Error processing selection.", flags: MessageFlags.Ephemeral}); return;
    }
    await sendSpecificGiveawayPanel(client, interaction, sessionId, giveawayId, listPage);
}

async function handleListPanelBackToMain(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    // This interaction.id is the one from the "Back to Main Panel" button itself.
    // The original sessionId from handleListGiveawaysButton isn't strictly needed here as we are just going back to main.
    await sendMainGiveawayPanel(interaction);
}


// --- SPECIFIC GIVEAWAY DETAIL PANEL ---
async function sendSpecificGiveawayPanel(client: Client, interaction: ButtonInteraction | StringSelectMenuInteraction, sessionId: string, giveawayId: string, listPage: number) {
    if (!interaction.guildId || !interaction.member) {
         await interaction.update({content: "Error: Missing guild/member context.", embeds:[], components:[]}); return;
    }

    const giveaway = giveawayManager.getGiveaway(giveawayId);
    if (!giveaway) {
        await interaction.update({ content: "Error: Giveaway not found.", embeds: [], components: [] });
        return;
    }

    let creatorName = `User ID: ${giveaway.creatorId}`;
    try {
        const creatorUser = await client.users.fetch(giveaway.creatorId);
        creatorName = creatorUser.tag;
    } catch { /* Keep ID if fetch fails */ }

    const embed = new EmbedBuilder()
        .setTitle(`🎁 ${giveaway.title}`)
        .setColor(giveaway.cancelled ? Colors.DarkRed : (giveaway.ended ? Colors.Orange : Colors.Green))
        .addFields(
            { name: "Prize", value: `||${giveaway.prize}||`, inline: true },
            { name: "Participants", value: `${giveaway.participants.length}`, inline: true },
            { name: "Creator", value: creatorName, inline: true }
        );

    let timeStatus = "";
    if (giveaway.cancelled) {
        timeStatus = `🚫 Cancelled <t:${Math.floor(giveaway.endTime / 1000)}:F>`;
    } else if (giveaway.ended) {
        timeStatus = `✅ Ended <t:${Math.floor(giveaway.endTime / 1000)}:F>`;
    } else if (giveaway.endTime > Date.now()) {
        timeStatus = `⏳ Ends <t:${Math.floor(giveaway.endTime / 1000)}:R> (<t:${Math.floor(giveaway.endTime / 1000)}:F>)`;
    } else {
        timeStatus = `⌛ Ending now / Processing...`;
    }
    embed.addFields({ name: "Status", value: timeStatus, inline: false });

    let winnerDisplay = "Not decided yet.";
    if (giveaway.ended) {
        if (giveaway.winners.length > 0) {
            const winnerTags = [];
            for (const winnerId of giveaway.winners) {
                try {
                    const winnerUser = await client.users.fetch(winnerId);
                    winnerTags.push(winnerUser.toString()); // Mention user
                } catch { winnerTags.push(`User ID: ${winnerId}`); }
            }
            winnerDisplay = winnerTags.join(', ');
        } else if (giveaway.cancelled) {
            winnerDisplay = "Cancelled, no winners.";
        }
        else {
            winnerDisplay = "No winners were selected.";
        }
    }
    embed.addFields({ name: "Winner(s)", value: winnerDisplay, inline: false });

    if (giveaway.entryMode === 'trivia' && giveaway.triviaQuestion) {
        embed.addFields(
            { name: "Trivia Question", value: giveaway.triviaQuestion, inline: false},
            { name: "Trivia Answer", value: `||${giveaway.triviaAnswer || "Not set"}||`, inline: true}
        );
        if (giveaway.maxTriviaAttempts && giveaway.maxTriviaAttempts > 0) {
            embed.addFields({ name: "Max Trivia Attempts", value: `${giveaway.maxTriviaAttempts}`, inline: true });
        }
    }
    embed.setFooter({ text: `Giveaway ID: ${giveaway.id}` });


    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    const backButton = new ButtonBuilder()
        .setCustomId(`${DETAIL_PANEL_BACK_TO_LIST_BTN_PREFIX}_${sessionId}_${listPage}`)
        .setLabel('Back to List')
        .setStyle(ButtonStyle.Secondary);

    // Check permissions for action buttons
    const memberPermissions = interaction.member.permissions as PermissionsBitField;
    const canManage = interaction.user.id === giveaway.creatorId || memberPermissions.has(PermissionsBitField.Flags.ManageGuild);


    if (giveaway.ended || giveaway.cancelled) {
        const removeButton = new ButtonBuilder()
            .setCustomId(`${DETAIL_PANEL_ACTION_BTN_PREFIX}_${giveaway.id}_${ACTION_TYPE_REMOVE}_${sessionId}_${listPage}`)
            .setLabel('Remove Giveaway Record')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!canManage);
        actionRow.addComponents(removeButton);
    } else {
        const cancelButton = new ButtonBuilder()
            .setCustomId(`${DETAIL_PANEL_ACTION_BTN_PREFIX}_${giveaway.id}_${ACTION_TYPE_CANCEL}_${sessionId}_${listPage}`)
            .setLabel('Cancel Giveaway')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!canManage);
        const finishButton = new ButtonBuilder()
            .setCustomId(`${DETAIL_PANEL_ACTION_BTN_PREFIX}_${giveaway.id}_${ACTION_TYPE_FINISH}_${sessionId}_${listPage}`)
            .setLabel('Finish Now')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!canManage);
        actionRow.addComponents(cancelButton, finishButton);
    }
    
    const components = [actionRow, new ActionRowBuilder<ButtonBuilder>().addComponents(backButton)];
    await interaction.update({ embeds: [embed], components });
}

async function handleDetailPanelActionButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    const parts = interaction.customId.split('_'); // DETAIL_PANEL_ACTION_BTN_PREFIX_giveawayId_actionType_sessionId_listPage
    const giveawayId = parts[parts.length - 4];
    const actionType = parts[parts.length - 3];
    const sessionId = parts[parts.length - 2];
    const listPage = parseInt(parts[parts.length - 1], 10);

    if (!giveawayId || !actionType || !sessionId || isNaN(listPage) || !interaction.guild) {
        await interaction.reply({content: "Error processing action.", flags: MessageFlags.Ephemeral}); return;
    }
    
    const giveaway = giveawayManager.getGiveaway(giveawayId);
    if (!giveaway) {
        await interaction.reply({content: "Giveaway not found.", flags: MessageFlags.Ephemeral});
        return sendListGiveawaysPanel(client, interaction, sessionId, listPage); // Attempt to return to list
    }

    // Permission check again, as button handler options might not cover dynamic IDs perfectly
    const member = interaction.member instanceof GuildMember ? interaction.member : await interaction.guild.members.fetch(interaction.user.id);
    if (!member) {
        await interaction.reply({content: "Could not verify your permissions.", flags: MessageFlags.Ephemeral}); return;
    }
    const canManage = giveaway.creatorId === interaction.user.id || member.permissions.has(PermissionsBitField.Flags.ManageGuild);

    if (!canManage) {
        await interaction.reply({content: "You don't have permission to perform this action on this giveaway.", flags: MessageFlags.Ephemeral});
        return;
    }

    switch (actionType) {
        case ACTION_TYPE_REMOVE:
            const removed = giveawayManager.removeGiveaway(giveawayId);
            if (removed) {
                await interaction.update({content: `Giveaway "${giveaway.title}" has been removed.`, embeds:[], components:[]});
                // Delay then show list
                setTimeout(() => sendListGiveawaysPanel(client, interaction, sessionId, listPage).catch(console.error), 2000);
            } else {
                await interaction.reply({content: "Failed to remove giveaway.", flags: MessageFlags.Ephemeral});
            }
            break;
        case ACTION_TYPE_CANCEL:
            const cancelled = await giveawayManager.cancelGiveaway(client, giveawayId);
            if (cancelled) {
                 await interaction.update({content: `Giveaway "${giveaway.title}" has been cancelled.`, embeds:[], components:[]});
                 setTimeout(() => sendSpecificGiveawayPanel(client, interaction, sessionId, giveawayId, listPage).catch(console.error), 2000);
            } else {
                await interaction.reply({content: "Failed to cancel giveaway (it might be already ended/cancelled or not found).", flags: MessageFlags.Ephemeral});
            }
            break;
        case ACTION_TYPE_FINISH:
            if (giveaway.ended || giveaway.cancelled) {
                await interaction.reply({content: "This giveaway has already ended or been cancelled.", flags: MessageFlags.Ephemeral}); return;
            }
            const updatedGiveaway = { ...giveaway, endTime: Date.now() - 1000 }; // Set end time to past
            giveawayManager.updateGiveaway(giveawayId, { endTime: Date.now() - 1000});
            giveawayManager.scheduleGiveawayEnd(client, updatedGiveaway); // This will trigger processEndedGiveaway
            await interaction.update({content: `Giveaway "${giveaway.title}" is being ended now...`, embeds:[], components:[]});
            setTimeout(() => sendSpecificGiveawayPanel(client, interaction, sessionId, giveawayId, listPage).catch(console.error), 3000); // Refresh panel after a bit
            break;
        default:
            await interaction.reply({content: "Unknown action.", flags: MessageFlags.Ephemeral});
    }
}

async function handleDetailPanelBackToListButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    const parts = interaction.customId.split('_'); // DETAIL_PANEL_BACK_TO_LIST_BTN_PREFIX_sessionId_listPage
    const sessionId = parts[parts.length - 2];
    const page = parseInt(parts[parts.length - 1], 10);
     if (isNaN(page) || !sessionId) {
        await interaction.reply({content: "Error returning to list.", flags: MessageFlags.Ephemeral}); return;
    }
    await sendListGiveawaysPanel(client, interaction, sessionId, page);
}


// --- Create Giveaway Panel & Handlers (largely unchanged, but shown for completeness) ---

async function buildCreateGiveawayPanelBasePayload(creationSessionId: string): Promise<InteractionUpdateOptions> {
    const currentGiveawayData = pendingGiveaways.get(creationSessionId);
    let content: string | undefined = undefined;

    if (!currentGiveawayData) {
        console.error(`[buildCreateGiveawayPanelBasePayload] No pending giveaway data for session ${creationSessionId}`);
        content = 'Error: Could not find giveaway creation session. Please go back and try again.';
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
    
    // Cycle: button -> reaction (placeholder, not implemented) -> trivia -> button
    const nextMode = currentGiveawayData.entryMode === 'button' ? 'trivia' : 'button'; // Simplified: button <-> trivia
    // const nextMode = currentGiveawayData.entryMode === 'button' ? 'reaction' : currentGiveawayData.entryMode === 'reaction' ? 'trivia' : 'button';
    
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

    const components = [row1];
    if (currentGiveawayData.entryMode === 'trivia') {
        components.push(rowTrivia);
    }
    components.push(rowActions);


    return { content: content === null ? undefined : content, embeds: [embed], components };
}

async function sendCreateGiveawayPanel(interaction: ButtonInteraction, creationSessionId: string) {
    const payload = await buildCreateGiveawayPanelBasePayload(creationSessionId);
    if (payload.content && payload.content.startsWith("Error:")) { // If error in payload construction
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: payload.content, flags: MessageFlags.Ephemeral, embeds: [], components: [] });
        } else {
            await interaction.reply({ content: payload.content, flags: MessageFlags.Ephemeral, embeds: [], components: [] });
        }
        return;
    }
    await interaction.update(payload).catch(async (error) => {
        console.error("Failed to update create panel from button interaction:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "Error refreshing panel.", flags: MessageFlags.Ephemeral });
        } else {
            // Try to send a followup if update fails after deferral
            await interaction.followUp({ content: "Error refreshing panel (update failed).", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    });
}


async function handleSetTitleButton(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_SET_TITLE_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action (session ID missing).", flags: MessageFlags.Ephemeral}); return; }
    
    const currentData = pendingGiveaways.get(creationSessionId);
    if (!currentData) {
        await interaction.reply({content: "Error: Giveaway creation session not found. Please go back and try again.", flags: MessageFlags.Ephemeral});
        return;
    }

    const modal = new ModalBuilder().setCustomId(`${MODAL_SET_TITLE_PREFIX}_${creationSessionId}`).setTitle('Set Giveaway Title');
    const titleInput = new TextInputBuilder().setCustomId('giveawayTitle').setLabel("What is the title?").setStyle(TextInputStyle.Short)
        .setValue(currentData?.title !== 'Untitled Giveaway' ? currentData?.title || '' : '').setRequired(true).setMaxLength(100);
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
        await interaction.deferUpdate().catch(e => console.error("Defer update failed in setTitleModal", e)); // Defer if modal was quick
    } else if (interaction.deferred && !interaction.replied) {
      // If already deferred (e.g. by button handler), no further action needed here for ack
    }
}

async function handleToggleEntryMode(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const basePrefix = CREATE_TOGGLE_ENTRY_MODE_BTN_PREFIX;
    if (!interaction.customId.startsWith(basePrefix + '_')) {
        await interaction.reply({content: "Error processing this action (invalid customId).", flags: MessageFlags.Ephemeral}); return;
    }
    const paramsString = interaction.customId.substring(basePrefix.length + 1);
    const params = paramsString.split('_');
    if (params.length < 2) {
        await interaction.reply({content: "Error processing this action (param mismatch).", flags: MessageFlags.Ephemeral}); return;
    }
    const creationSessionId = params[0];
    const newMode = params[1] as Giveaway['entryMode'];

    const currentData = pendingGiveaways.get(creationSessionId);
     if (!currentData) {
        await interaction.reply({content: "Error: Giveaway creation session not found. Please go back and try again.", flags: MessageFlags.Ephemeral});
        return;
    }
    if (currentData) {
        currentData.entryMode = newMode;
        if (newMode !== 'trivia') {
            delete currentData.triviaQuestion;
            delete currentData.triviaAnswer;
            delete currentData.maxTriviaAttempts;
        } else {
            if (currentData.maxTriviaAttempts === undefined) currentData.maxTriviaAttempts = -1; // Default to infinite if switching to trivia
        }
        pendingGiveaways.set(creationSessionId, currentData);
    }
    await sendCreateGiveawayPanel(interaction, creationSessionId);
}

async function handleSetTimeButton(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_SET_TIME_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action (session ID missing).", flags: MessageFlags.Ephemeral}); return; }
    const currentData = pendingGiveaways.get(creationSessionId);
    if (!currentData) {
        await interaction.reply({content: "Error: Giveaway creation session not found. Please go back and try again.", flags: MessageFlags.Ephemeral});
        return;
    }
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

    const currentData = pendingGiveaways.get(creationSessionId); // Get data before potential early return
    
    if (durationMs === null || durationMs <= 0) {
        // Modal submissions must be acknowledged.
        await interaction.reply({ content: 'Invalid duration format. Please use formats like "30m", "2h", "1d 12h", or "HH:MM:SS". Setting not applied.', flags: MessageFlags.Ephemeral });
        return; // Return AFTER replying.
    }
    
    if (currentData) { currentData.durationMs = durationMs; pendingGiveaways.set(creationSessionId, currentData); }
    
    if (!interaction.replied && !interaction.deferred) { // Should always be false after modal, but good check
        await interaction.deferUpdate().catch(e => console.error("Defer update failed in setTimeModal", e));
    }
}

async function handleSetPrizeButton(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_SET_PRIZE_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action (session ID missing).", flags: MessageFlags.Ephemeral}); return; }
    const currentData = pendingGiveaways.get(creationSessionId);
    if (!currentData) {
        await interaction.reply({content: "Error: Giveaway creation session not found. Please go back and try again.", flags: MessageFlags.Ephemeral});
        return;
    }
    const modal = new ModalBuilder().setCustomId(`${MODAL_SET_PRIZE_PREFIX}_${creationSessionId}`).setTitle('Set Giveaway Prize');
    const prizeInput = new TextInputBuilder().setCustomId('giveawayPrize').setLabel("What is the prize?").setStyle(TextInputStyle.Paragraph)
        .setValue(currentData?.prize !== 'Not Set' ? currentData?.prize || '' : '').setRequired(true).setMaxLength(1000);
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
        await interaction.deferUpdate().catch(e => console.error("Defer update failed in setPrizeModal", e));
    }
}

async function handleSetTriviaQnAButton(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_SET_TRIVIA_QNA_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action (session ID missing).", flags: MessageFlags.Ephemeral}); return; }
    const currentData = pendingGiveaways.get(creationSessionId);
    if (!currentData) {
        await interaction.reply({content: "Error: Giveaway creation session not found. Please go back and try again.", flags: MessageFlags.Ephemeral});
        return;
    }

    const modal = new ModalBuilder().setCustomId(`${MODAL_SET_TRIVIA_QNA_PREFIX}_${creationSessionId}`).setTitle('Set Trivia Question & Answer');
    const questionInput = new TextInputBuilder()
        .setCustomId('giveawayTriviaQuestion')
        .setLabel("Enter the trivia question:")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(currentData?.triviaQuestion || '')
        .setRequired(true).setMaxLength(200);
    const answerInput = new TextInputBuilder()
        .setCustomId('giveawayTriviaAnswer')
        .setLabel("Enter the exact answer (case-insensitive):")
        .setStyle(TextInputStyle.Short)
        .setValue(currentData?.triviaAnswer || '')
        .setRequired(true).setMaxLength(100);

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
        await interaction.deferUpdate().catch(e => console.error("Defer update failed in setTriviaQnAModal", e));
    }
}

async function handleSetTriviaAttemptsButton(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_SET_TRIVIA_ATTEMPTS_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action (session ID missing).", flags: MessageFlags.Ephemeral}); return; }
    const currentData = pendingGiveaways.get(creationSessionId);
     if (!currentData) {
        await interaction.reply({content: "Error: Giveaway creation session not found. Please go back and try again.", flags: MessageFlags.Ephemeral});
        return;
    }

    const modal = new ModalBuilder().setCustomId(`${MODAL_SET_TRIVIA_ATTEMPTS_PREFIX}_${creationSessionId}`).setTitle('Set Max Trivia Attempts');
    const attemptsInput = new TextInputBuilder()
        .setCustomId('giveawayMaxTriviaAttempts')
        .setLabel("Max attempts (-1 or 0 for infinite):")
        .setStyle(TextInputStyle.Short)
        .setValue(currentData?.maxTriviaAttempts?.toString() || '-1') // Default to -1 if undefined
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
    const currentData = pendingGiveaways.get(creationSessionId); // Get before early return

    if (isNaN(attempts)) {
        await interaction.reply({content: "Invalid number for attempts. Please enter a whole number (e.g., 3, or -1 for infinite).", flags: MessageFlags.Ephemeral});
        return;
    }

    if (currentData) {
        currentData.maxTriviaAttempts = attempts <= 0 ? -1 : attempts; // -1 for infinite
        pendingGiveaways.set(creationSessionId, currentData);
    }
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate().catch(e => console.error("Defer update failed in setTriviaAttemptsModal", e));
    }
}


async function handleCreateBackToMainPanel(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_BACK_BTN_PREFIX);
    if (!creationSessionId) { 
        // If session ID is not in customId, it might be a direct call or an old interaction.
        // Just send main panel without trying to delete from pendingGiveaways.
        console.warn("CreateBackToMainPanel: No creationSessionId in customId. Sending main panel.");
    } else {
        pendingGiveaways.delete(creationSessionId);
    }
    await sendMainGiveawayPanel(interaction);
}

async function handleRefreshCreatePanelButton(client: Client, interaction: ButtonInteraction, userLevel: number): Promise<void> {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_REFRESH_PANEL_BTN_PREFIX);
    if (!creationSessionId) {
        await interaction.reply({ content: "Error: Could not find session to refresh. Please go back and try again.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (!pendingGiveaways.has(creationSessionId)) {
         await interaction.update({ content: "Error: Giveaway creation session has expired or was not found. Please go back to the main panel and start over.", embeds:[], components:[]}).catch(()=>{
            interaction.followUp({ content: "Error: Giveaway creation session has expired or was not found. Please go back to the main panel and start over.", flags: MessageFlags.Ephemeral});
         });
         pendingGiveaways.delete(creationSessionId); // Clean up just in case
         return;
    }
    await sendCreateGiveawayPanel(interaction, creationSessionId);
}


async function handleStartGiveawayNow(client: Client, interaction: ButtonInteraction, userLevel: number) {
    const creationSessionId = giveawayManager.getSessionIdFromCustomId(interaction.customId, CREATE_START_NOW_BTN_PREFIX);
    if (!creationSessionId) { await interaction.reply({content: "Error processing action (session ID missing).", flags: MessageFlags.Ephemeral}); return; }
    
    const giveawayData = pendingGiveaways.get(creationSessionId);
    const currentChannel = interaction.channel;

    if (!interaction.guild || !currentChannel || !interaction.guildId ) {
        await interaction.update({ content: "Error: Could not determine guild or channel.", embeds: [], components: [] }); return;
    }
    if (!isSendableChannel(currentChannel)) {
        await interaction.update({content: "Error: Cannot send giveaway to this channel type.", embeds: [], components: []}); return;
    }
    if (!giveawayData) { // Check if giveawayData itself is missing
        await interaction.update({ content: "Error: Giveaway creation data not found. Please try creating it again.", embeds: [], components: [] });
        return;
    }


    if (!giveawayData.title || giveawayData.title === 'Untitled Giveaway' ||
        !giveawayData.prize || giveawayData.prize === 'Not Set' ||
        giveawayData.durationMs === undefined || giveawayData.durationMs <= 0) {
        await interaction.reply({ content: 'Please set title, prize, and a valid duration before starting.', flags: MessageFlags.Ephemeral }); return;
    }
    if (giveawayData.entryMode === 'trivia' && (!giveawayData.triviaQuestion || !giveawayData.triviaAnswer)) {
        await interaction.reply({ content: 'For trivia mode, please ensure both a question and an answer are set.', flags: MessageFlags.Ephemeral }); return;
    }

    const actualEndTime = Date.now() + giveawayData.durationMs;
    const giveawayUniqueId = randomUUID();

    let description = `A new giveaway has started! Click the button below to participate for a chance to win **${giveawayData.prize}**.`;
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
    } else { // Default to button entry
        entryComponent = new ButtonBuilder()
            .setCustomId(`${GW_ENTER_BTN_PREFIX}_${giveawayUniqueId}`)
            .setLabel('🎉 Enter Giveaway')
            .setStyle(ButtonStyle.Success);
    }
    const announcementRow = new ActionRowBuilder<ButtonBuilder>().addComponents(entryComponent);
    try {
        // Defer the update from the button click before sending a new message
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
        
        const announcementMessage = await currentChannel.send({ embeds: [announcementEmbed], components: [announcementRow] });
        if (!announcementMessage) { 
            await interaction.followUp({content: "Failed to send giveaway announcement message.", flags: MessageFlags.Ephemeral}); 
            return; 
        }

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
        pendingGiveaways.delete(creationSessionId); // Clean up pending data

        if (createdGiveaway) {
            giveawayManager.scheduleGiveawayEnd(client, createdGiveaway);
             // Update the original interaction (now deferred) to confirm and return to main panel
            await sendMainGiveawayPanel(interaction); // This will perform interaction.update
        } else {
            await interaction.followUp({content: "Failed to save the giveaway data after sending announcement.", flags: MessageFlags.Ephemeral});
        }

    } catch (e) { 
        console.error("Error starting giveaway:", e); 
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: "Error starting giveaway. Please check console.", flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: "Error starting giveaway. Please check console.", flags: MessageFlags.Ephemeral });
        }
    }
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
         await interaction.reply({ content: "This giveaway could not be found or may have been removed.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (giveaway.ended || giveaway.cancelled || giveaway.endTime <= Date.now()) {
        await interaction.reply({ content: "This giveaway is no longer active or has ended.", flags: MessageFlags.Ephemeral });
        return;
    }
     if (giveaway.entryMode === 'trivia') {
        await interaction.reply({ content: "This is a trivia giveaway. Please use the 'Answer Trivia' button if available.", flags: MessageFlags.Ephemeral });
        return;
    }


    const added = giveawayManager.addParticipant(giveawayId, interaction.user.id);
    if (added) {
        await interaction.reply({ content: "You have successfully entered the giveaway!", flags: MessageFlags.Ephemeral });
    } else {
        if (giveaway.participants.includes(interaction.user.id)) {
            await interaction.reply({ content: "You are already entered in this giveaway!", flags: MessageFlags.Ephemeral });
        } else {
            // This case should be rare if checks above are fine
            await interaction.reply({ content: "Could not enter the giveaway at this time. It might have just ended or there was an issue.", flags: MessageFlags.Ephemeral });
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
    if (giveaway.participants.includes(interaction.user.id)) { // User is a participant means they answered correctly
        await interaction.reply({ content: "You have already successfully answered the trivia for this giveaway!", flags: MessageFlags.Ephemeral });
        return;
    }
    if (!giveaway.triviaQuestion) {
        await interaction.reply({ content: "This trivia giveaway doesn't seem to have a question set up correctly.", flags: MessageFlags.Ephemeral });
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
        .setTitle(`Trivia: ${giveaway.title.substring(0,40)}...`); // Modal title limit
    const answerInput = new TextInputBuilder()
        .setCustomId('triviaUserAnswer')
        .setLabel(giveaway.triviaQuestion.substring(0,45)) // Text input label limit
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
    if (giveaway.participants.includes(interaction.user.id)) { // Already a participant
         if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "You have already successfully answered the trivia for this giveaway!", flags: MessageFlags.Ephemeral });
        return;
    }
    if (!giveaway.triviaAnswer) { // Should be caught earlier, but good check
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "The answer for this trivia is not set. Please contact an admin.", flags: MessageFlags.Ephemeral });
        return;
    }

    const userAnswer = interaction.fields.getTextInputValue('triviaUserAnswer');
    const maxAttempts = (giveaway.maxTriviaAttempts === undefined || giveaway.maxTriviaAttempts <= 0) ? -1 : giveaway.maxTriviaAttempts;
    let attemptsMadeAfterThisOne: number; // To store the count *after* this attempt

    if (userAnswer.toLowerCase() === giveaway.triviaAnswer.toLowerCase()) {
        giveawayManager.addParticipant(giveawayId, interaction.user.id); // This also updates the main giveaway object
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "Correct! You've entered the giveaway. 🎉", flags: MessageFlags.Ephemeral });
    } else {
        attemptsMadeAfterThisOne = giveawayManager.incrementUserTriviaAttempts(giveawayId, interaction.user.id);
        let replyContent = "Sorry, that's not the right answer. ";
        if (maxAttempts !== -1) {
            const attemptsLeft = maxAttempts - attemptsMadeAfterThisOne;
            if (attemptsLeft > 0) {
                replyContent += `You have **${attemptsLeft}** attempt(s) left.`;
            } else {
                replyContent += `You have no more attempts left.`;
            }
        } else { // Infinite attempts
            replyContent += "Try again!";
        }
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: replyContent, flags: MessageFlags.Ephemeral });
    }
}


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
    if (!giveaway.ended) { // Check if it actually ended
         await interaction.reply({ content: "This giveaway has not ended yet. Winners will be announced once it concludes.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (giveaway.cancelled) {
         await interaction.reply({ content: "This giveaway was cancelled, so no prizes can be claimed.", flags: MessageFlags.Ephemeral });
        return;
    }

    const memberPermissions = interaction.member?.permissions as PermissionsBitField | undefined;
    const isAdmin = memberPermissions?.has(PermissionsBitField.Flags.ManageGuild); // Or a more specific giveaway management perm
    const isCreator = interaction.user.id === giveaway.creatorId;
    const isWinner = giveaway.winners.includes(interaction.user.id);

    if (isWinner) {
        await interaction.reply({ content: `🎁 Congratulations! Your prize is: ||${giveaway.prize}||`, flags: MessageFlags.Ephemeral });
    } else if (isAdmin || isCreator) {
        // Allow admin/creator to see prize even if they didn't win, for verification.
        await interaction.reply({
            content: `You didn't win this one. As an admin/creator, you can see the prize details: ||${giveaway.prize}||. Winners: ${giveaway.winners.length > 0 ? giveaway.winners.map(id => `<@${id}>`).join(', ') : 'None'}.`,
            flags: MessageFlags.Ephemeral
        });
    } else {
        await interaction.reply({ content: "Nice try! But you are not a winner of this giveaway... Maybe next time!", flags: MessageFlags.Ephemeral });
    }
}


export = giveawayCommand;
