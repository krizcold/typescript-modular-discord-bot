# Use official Node.js image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json tsconfigprod.json ./ 
RUN npm install

# Create necessary directories
RUN mkdir -p /app/smdb-source /app/dist

# Grant full permissions to the smdb-source directory
RUN chmod -R 777 /app/smdb-source

# Copy the initial src/ directory
COPY src /app/src

# Copy start script and give execution permissions
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Default command: run the start script
CMD ["/app/start.sh"]
