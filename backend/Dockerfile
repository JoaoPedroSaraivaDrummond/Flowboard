FROM node:20-alpine

# Prisma engines need OpenSSL
RUN apk add --no-cache openssl

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .
RUN npx prisma generate

EXPOSE 3333

CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npm run dev"]
