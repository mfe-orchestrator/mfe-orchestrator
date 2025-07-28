# Production Image with Nginx
FROM nginx:alpine

# Install Node.js and pnpm for the backend
RUN apk add --update nodejs npm && \
    npm install -g pnpm

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