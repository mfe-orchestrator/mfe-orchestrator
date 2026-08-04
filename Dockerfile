# Production Image with Nginx
FROM nginx:alpine

# Install Node.js and pnpm for the backend.
# pnpm must be pinned to the same version as the "packageManager" field of the
# workspace: an unpinned install now resolves to pnpm 11, which tries to
# self-switch to the pinned 10.x release and fails on Alpine, because
# @pnpm/exe@10.x publishes no musl platform binary ("Cannot verify the identity
# of the @pnpm/exe.linux-x64 native binary: it is missing from pnpm-lock.yaml").
ARG PNPM_VERSION=10.19.0
RUN apk add --update nodejs npm && \
    npm install -g pnpm@${PNPM_VERSION}

# Create application directories
RUN mkdir -p /var/www/frontend /var/www/backend

# Copy Nginx configuration
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built frontend
COPY frontend/dist/ /var/www/frontend/

# Copy built backend
COPY backend/dist/ /var/www/backend/

WORKDIR /var/www/backend
RUN pnpm i

# Expose port 80
EXPOSE 80
EXPOSE 27017
EXPOSE 8443

WORKDIR /var/www/

# Start script that will run both backend and nginx
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Start the application
CMD ["/start.sh"]