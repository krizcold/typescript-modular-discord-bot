#!/bin/sh

echo "Starting Discord bot..."

# Compile TypeScript (if needed)
npm run build

# Start the bot
node dist/index.js
