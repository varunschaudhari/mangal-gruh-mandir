# Built from the repo root (docker-compose.yml: context ".") so /shared is included.
FROM node:22-alpine AS builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY shared /app/shared
COPY client .
RUN npm run build

# Production — serve with nginx
FROM nginx:alpine AS production
COPY --from=builder /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
