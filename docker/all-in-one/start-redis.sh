#!/bin/sh
# Starts Redis, protecting it with REDIS_PASSWORD when the variable is set.
#
# The backend reads the same variable, so setting it is enough to have both ends
# agree. Redis listens on the loopback only, so leaving it empty is fine too.
set -eu

set -- /etc/redis/redis.conf

if [ -n "${REDIS_PASSWORD:-}" ]; then
    set -- "$@" --requirepass "${REDIS_PASSWORD}"
fi

exec /usr/bin/redis-server "$@"
