// src/index.ts

// Load environment variables
import 'dotenv/config';

// Import the client initializer to start the bot.
// This will scan for events and commands, create the Discord client with required intents, and log in.
import './initializers/clientInitializer';
