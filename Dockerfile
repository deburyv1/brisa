FROM node:22-alpine

WORKDIR /app

# Copy server files
COPY server/package*.json ./server/
RUN cd server && npm install --production

# Copy server code
COPY server/ ./server/

# Copy frontend files
COPY index.html ./server/public/
COPY css/ ./server/public/css/
COPY js/ ./server/public/js/
COPY icons/ ./server/public/icons/
COPY aero-backgrounds/ ./server/public/aero-backgrounds/
COPY brisa-icons/ ./server/public/brisa-icons/

EXPOSE 3000

CMD ["sh", "-c", "cd server && node setup-db.js && node index.js"]
