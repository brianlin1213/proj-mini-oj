FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    python3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN if [ -f package-lock.json ]; then \
        npm ci --omit=dev; \
    else \
        npm install --omit=dev; \
    fi

COPY . .

RUN mkdir -p /app/data /app/runner/jobs \
    && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=3000
ENV APP_ENV=release
ENV APP_LABEL="Docker Version"

EXPOSE 3000
EXPOSE 3001

CMD ["npm", "start"]