#!/bin/sh
# Waits for MongoDB and Redis, initialises the replica set the first time, then
# starts the backend.
#
# The wait is not a nicety: the backend gives up when it cannot reach MongoDB
# while its plugins are loading, so it must not be started before the database
# answers. Every wait is bounded, and a timeout exits non zero so that
# supervisor retries the whole sequence.
set -eu

WAIT_TIMEOUT="${SERVICES_WAIT_TIMEOUT:-120}"

log() {
    echo "[backend] $*"
}

mongo_eval() {
    mongosh --quiet --host 127.0.0.1 --port 27017 --eval "$1"
}

redis_ping() {
    if [ -n "${REDIS_PASSWORD:-}" ]; then
        redis-cli -h 127.0.0.1 -p 6379 -a "${REDIS_PASSWORD}" --no-auth-warning ping
    else
        redis-cli -h 127.0.0.1 -p 6379 ping
    fi
}

# Repeats a command until it succeeds, giving up after WAIT_TIMEOUT seconds.
wait_for() {
    description="$1"
    shift

    elapsed=0
    while ! "$@" > /dev/null 2>&1; do
        if [ "${elapsed}" -ge "${WAIT_TIMEOUT}" ]; then
            log "${description} is still not available after ${WAIT_TIMEOUT}s, giving up"
            return 1
        fi
        elapsed=$((elapsed + 1))
        sleep 1
    done

    log "${description} is ready"
}

wait_for "MongoDB" mongo_eval 'db.adminCommand({ ping: 1 })'

if [ -n "${MONGO_REPLICA_SET:-}" ]; then
    # rs.status() throws while the replica set has never been initiated, which is
    # exactly how the first start is detected.
    if mongo_eval 'rs.status()' > /dev/null 2>&1; then
        log "replica set ${MONGO_REPLICA_SET} already initialised"
    else
        log "initialising the single node replica set ${MONGO_REPLICA_SET}"
        mongo_eval "rs.initiate({ _id: '${MONGO_REPLICA_SET}', members: [{ _id: 0, host: '127.0.0.1:27017' }] })"
    fi

    # An election still has to happen before the node accepts writes.
    wait_for "the MongoDB primary" sh -c \
        "mongosh --quiet --host 127.0.0.1 --port 27017 --eval 'db.hello().isWritablePrimary' | grep -q true"
fi

wait_for "Redis" redis_ping

log "starting the MFE Orchestrator backend"
exec node /var/www/backend/src/index.js
