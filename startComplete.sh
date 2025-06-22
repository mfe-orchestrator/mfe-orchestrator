#!/bin/sh

# Start Redis
echo "Starting Redis..."
redis-server --daemonize yes

# Start MongoDB
echo "Starting MongoDB..."
mongod --fork --logpath /var/log/mongod.log

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 5

# Start the backend
echo "Starting Backend..."
cd /var/www/backend
node ./src &

# Start Nginx in the background
echo "Starting Nginx..."
nginx -g 'daemon off;'