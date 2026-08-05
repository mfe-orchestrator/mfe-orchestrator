#!/bin/sh
# Starts MongoDB, as a single node replica set unless MONGO_REPLICA_SET is empty.
#
# The replica set is not there for redundancy: it is what makes MongoDB accept
# transactions, which the backend uses for every write that touches more than
# one collection. On a standalone MongoDB those writes still work, but they lose
# their atomicity.
set -eu

set -- --config /etc/mongod.conf

if [ -n "${MONGO_REPLICA_SET:-}" ]; then
    set -- "$@" --replSet "${MONGO_REPLICA_SET}"
fi

exec /usr/bin/mongod "$@"
