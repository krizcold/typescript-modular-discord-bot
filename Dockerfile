# Use an official lightweight Node.js image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json tsconfig.json ./
RUN npm install

# Copy the entire project into the container
COPY . .

# Make the start script executable
RUN chmod +x start.sh

# Set the command to start the bot
CMD ["sh", "start.sh"]
