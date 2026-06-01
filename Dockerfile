FROM node:20

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/db

ENV PORT=8080

EXPOSE 8080

CMD ["node", "server/index.js"]
