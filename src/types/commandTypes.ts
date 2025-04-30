import {
  Client,
  CommandInteraction,
  UserContextMenuCommandInteraction,
  MessageContextMenuCommandInteraction,
  GatewayIntentBits,
  ApplicationCommandType,
  ApplicationCommandOptionData,
  Locale,
  Collection,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  Message,
  PermissionResolvable // Keep PermissionResolvable
} from 'discord.js';

// --- Special User Rule Definition ---
export type SpecialUserRule =
  | { type: 'user'; id: string; value: number } // Match specific user ID
  | { type: 'permission'; id: PermissionResolvable; value: number }; // Match permission

/**
 * Interface for defining standard Slash Commands (Type 1)
 * using the bot's custom format.
 */
export interface CommandOptions {
  name: string;
  description: string;
  type?: ApplicationCommandType.ChatInput;

  devOnly?: boolean;
  testOnly?: boolean;
  permissionsRequired?: PermissionResolvable[];
  botPermissions?: PermissionResolvable[];
  requiredIntents?: GatewayIntentBits[];

  options?: ApplicationCommandOptionData[];
  default_member_permissions?: string | null;
  dm_permission?: boolean;
  nsfw?: boolean;
  name_localizations?: Partial<Record<Locale, string | null>>;
  description_localizations?: Partial<Record<Locale, string | null>>;

  initialize?: (client: Client) => void;
  callback: (client: Client, interaction: CommandInteraction) => void;
  handleModalSubmit?: (client: Client, interaction: ModalSubmitInteraction) => Promise<void>;
  messageCallback?: (client: Client, message: Message) => Promise<void>;
}


/**
 * Generic Interface for defining Context Menu Commands (User or Message)
 * using the bot's custom format.
 */
export interface ContextMenuCommandOptions<TInteraction extends UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction> {
  name: string;
  type: TInteraction extends UserContextMenuCommandInteraction ? ApplicationCommandType.User : ApplicationCommandType.Message;

  devOnly?: boolean;
  testOnly?: boolean;
  permissionsRequired?: PermissionResolvable[];
  botPermissions?: PermissionResolvable[];
  requiredIntents?: GatewayIntentBits[];

  default_member_permissions?: string | null;
  dm_permission?: boolean;
  nsfw?: boolean;
  name_localizations?: Partial<Record<Locale, string | null>>;

  initialize?: (client: Client) => void;
  callback: (client: Client, interaction: TInteraction) => void;
  handleModalSubmit?: (client: Client, interaction: ModalSubmitInteraction) => Promise<void>;
}


// --- Handler Info Interfaces ---

export interface RegisteredButtonInfo {
    // Update handler signature to accept userLevel
    handler: (client: Client, interaction: ButtonInteraction, userLevel: number) => Promise<void>;
    timeoutMs: number | null;
    permissionsRequired?: PermissionResolvable[]; // For access denial
    specialUsers?: SpecialUserRule[]; // Optional ordered list for varied responses
}

export interface RegisteredDropdownInfo<TInteraction extends StringSelectMenuInteraction = StringSelectMenuInteraction> {
    handler: (client: Client, interaction: TInteraction) => Promise<void>; // Keep original signature for now
    timeoutMs: number | null;
}

export interface RegisteredModalInfo {
    handler: (client: Client, interaction: ModalSubmitInteraction) => Promise<void>; // Keep original signature for now
}

// --- Augmentation for Discord.js Client ---

declare module 'discord.js' {
  interface Client {
    buttonHandlers: Map<string, RegisteredButtonInfo>;
    dropdownHandlers: Map<string, RegisteredDropdownInfo>;
    modalHandlers: Map<string, RegisteredModalInfo>;
  }
}


// --- ChatReact Config Types ---
export interface ChatReactConfig {
  [key: string]: ChatReactInstanceConfig;
}
export interface ChatReactInstanceConfig {
  enabled?: boolean;
  reactMode: 'react' | 'reply' | 'respond' | 'command';
  triggerListKey?: string;
  reactListKey: string;
  matchMode?: 'exact' | 'word' | 'contains' | 'startsWith';
  allowedChannelsKey?: string;
  reloadMinutes?: number;
  maxCharges?: number;
  maxPerUser?: number;
  resetUserMinutes?: number;
  scope?: 'guild' | 'global';
}
