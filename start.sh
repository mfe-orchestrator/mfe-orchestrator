#!/bin/sh

# Start the backend in the background
cd /var/www/backend
node ./src & 

# Start Nginx in the foreground
exec nginx -g 'daemon off;'
