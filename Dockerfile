FROM node:current-alpine3.21

WORKDIR /home/node

# Gerekli derleyici ve araçları yükle
RUN  apk add --no-cache make gcc g++ python3

# Paketleri yükle
RUN npm install express bcryptjs jsonwebtoken sqlite3 dotenv node-telegram-bot-api axios nodemailer node-cron

COPY package*.json ./


# (Opsiyonel) Derleyici araçları kaldır, imajı küçült
RUN apk del make gcc g++ python3

COPY . .

ENV TZ="Europe/Istanbul"

EXPOSE 80

CMD ["node", "app.js"]