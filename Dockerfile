# Use Node.JS official image for building and running
FROM node:23.7-bullseye-slim AS builder

WORKDIR /app

# Install dependencies and build the app
COPY package.json .env ./
RUN npm install
COPY . .
RUN npm run build

# Production image
FROM node:23-bullseye AS runner
WORKDIR /app

# Copy built app and dependencies
COPY --from=builder /app .

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables (override in deployment as needed)
ENV NODE_ENV=production

# Start the app
CMD ["npm", "start"]
