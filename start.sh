#!/bin/sh

echo "Starting Discord bot..."

# If the mounted volume (/app/smdb-source) is empty, copy the default src files
if [ ! "$(ls -A /app/smdb-source 2>/dev/null)" ]; then
    echo "Copying default source files to /app/smdb-source..."
    cp -r /app/src/* /app/smdb-source/
fi

# **Delete existing dist/ folder to reflect script removals**
if [ -d "/app/dist" ]; then
    echo "Removing old compiled files..."
    rm -rf /app/dist
fi

# Compile TypeScript
echo "Compiling TypeScript... in directory: $(pwd)"
npm run build

# Copy JavaScript files from smdb-source to dist (to allow raw JS files)
echo "Copying JavaScript files..."
cd /app/smdb-source && find . -name "*.js" -exec cp --parents {} /app/dist/ \;

cd /app

# Start the bot
node dist/index.js
