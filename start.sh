#!/bin/sh

echo "Starting Discord bot..."

# **Ensure smdb-source exists** (Recover if missing or if it's empty)
if [ ! -d "/app/smdb-source" ] || [ ! "$(ls -A /app/smdb-source)" ]; then
    echo "--> Initializing source folder (/app/smdb-source)..."
    mkdir -p /app/smdb-source
    cp -r /app/src/* /app/smdb-source/
fi

# **Create a clean dist folder to ensure removed files are deleted**
if [ -d "/app/dist" ]; then
    echo "Removing old compiled files..."
    rm -rf /app/dist
    sleep 0.1
fi
mkdir -p /app/dist

# **Ensure correct TypeScript config** (force production config)
echo "Applying production TypeScript configuration..."
cp /app/tsconfigprod.json /app/tsconfig.json

# **Compile TypeScript**
echo "Compiling TypeScript..."
npm run build

# **Copy JavaScript files from smdb-source to dist** (Preserves folders)
echo "Copying JavaScript files..."
cd /app/smdb-source && find . -name "*.js" -exec cp --parents {} /app/dist/ \;

# **Start the bot**
cd /app
node dist/index.js
