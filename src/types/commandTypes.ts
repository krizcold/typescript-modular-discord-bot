import {
  Client,
  CommandInteraction,
  UserContextMenuCommandInteraction,
  MessageContextMenuCommandInteraction,
  GatewayIntentBits,
  ApplicationCommandType,
  ApplicationCommandOptionData, // More specific type for options
  Locale, // Import Locale for localization types
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction
} from 'discord.js';

/**
 * Interface for defining standard Slash Commands (Type 1)
 * using the bot's custom format.
 */
export interface CommandOptions {
  name: string; // 1-32 lowercase characters, no spaces
  description: string; // 1-100 characters
  type?: ApplicationCommandType.ChatInput; // Explicitly ChatInput or omitted

  // Optional fields for custom handling
  devOnly?: boolean;
  testOnly?: boolean;
  permissionsRequired?: string[]; // Array of permission names (e.g., 'SendMessages')
  botPermissions?: string[];    // Array of permission names bot needs
  requiredIntents?: GatewayIntentBits[];

  // Optional fields matching Discord API structure (passed through if defined)
  options?: ApplicationCommandOptionData[]; // Use specific Option type
  default_member_permissions?: string | null; // If defining raw permissions directly
  dm_permission?: boolean;
  nsfw?: boolean;
  name_localizations?: Partial<Record<Locale, string | null>>;
  description_localizations?: Partial<Record<Locale, string | null>>;

  // Core functions (initialize is optional and comes first)
  initialize?: (client: Client) => void; // One-time setup
  callback: (client: Client, interaction: CommandInteraction) => void; // Execution logic
  handleModalSubmit?: (client: Client, interaction: ModalSubmitInteraction) => Promise<void>;
}


/**
 * Generic Interface for defining Context Menu Commands (User or Message)
 * using the bot's custom format.
 * @template TInteraction The specific interaction type (UserContextMenuCommandInteraction or MessageContextMenuCommandInteraction).
 */
export interface ContextMenuCommandOptions<TInteraction extends UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction> {
  name: string; // 1-32 characters, MUST be lowercase, no spaces for API registration
  // Type is inferred from the interaction type TInteraction, but can be explicitly set
  type: TInteraction extends UserContextMenuCommandInteraction ? ApplicationCommandType.User : ApplicationCommandType.Message;

  // Optional fields for custom handling
  devOnly?: boolean;
  testOnly?: boolean;
  permissionsRequired?: string[];
  botPermissions?: string[];
  requiredIntents?: GatewayIntentBits[];

  // Optional fields matching Discord API structure (passed through if defined)
  default_member_permissions?: string | null;
  dm_permission?: boolean;
  nsfw?: boolean;
  name_localizations?: Partial<Record<Locale, string | null>>;
  // description_localizations are NOT valid for context menus
  // options are NOT valid for context menus

  // Core functions (initialize is optional and comes first)
  initialize?: (client: Client) => void; // One-time setup
  // Use the generic interaction type TInteraction
  callback: (client: Client, interaction: TInteraction) => void;
  handleModalSubmit?: (client: Client, interaction: ModalSubmitInteraction) => Promise<void>;
}

/**
 * Interface for defining Button Commands using the bot's custom format.
 */
export interface RegisteredButtonInfo {
  handler: (client: Client, interaction: ButtonInteraction) => Promise<void>;
  timeoutMs: number | null;
}

export interface RegisteredDropdownInfo<TInteraction extends StringSelectMenuInteraction = StringSelectMenuInteraction> {
  handler: (client: Client, interaction: TInteraction) => Promise<void>;
  timeoutMs: number | null;
}

export interface RegisteredModalInfo {
  handler: (client: Client, interaction: ModalSubmitInteraction) => Promise<void>;
  // Timeouts usually don't apply to modal submissions in the same way
}

// Augment the discord.js Client type within this file
declare module 'discord.js' {
  interface Client {
    /** Map/Collection to store button handlers. Key: customId prefix, Value: handler info. */
    buttonHandlers: Map<string, RegisteredButtonInfo>;

    /** Map/Collection to store dropdown handlers. Key: customId prefix, Value: handler info. */
    dropdownHandlers: Map<string, RegisteredDropdownInfo>;

    /** Map to store modal submit handlers. Key: customId, Value: handler info. */
    modalHandlers: Map<string, RegisteredModalInfo>; // Added modal handlers map
  }
}