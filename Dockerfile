FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN apk add --no-cache git
RUN npm install --omit=dev

COPY . .

EXPOSE 8091
CMD ["node", "server.js"]
