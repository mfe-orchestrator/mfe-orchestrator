#!/bin/sh
# Entrypoint of the all-in-one image: prepares the /data volume, makes sure the
# installation has a real JWT secret and hands over to supervisor, which starts
# MongoDB, Redis, the backend and Nginx.
set -eu

log() {
    echo "[entrypoint] $*"
}

MICROFRONTEND_HOST_FOLDER="${MICROFRONTEND_HOST_FOLDER:-/data/microfrontends}"
SECRETS_DIR=/data/secrets
JWT_SECRET_FILE="${SECRETS_DIR}/jwt_secret"

# The volume is empty on the very first run, and may be owned by root when the
# user mounts a host directory. Only the directories are chowned, not their
# content: the files inside are already owned by the service that wrote them,
# and a recursive chown on a large database would slow down every start.
mkdir -p /data/db /data/redis "${MICROFRONTEND_HOST_FOLDER}" "${SECRETS_DIR}"
chown mongodb:mongodb /data/db
chown redis:redis /data/redis
chown mfe:mfe "${MICROFRONTEND_HOST_FOLDER}" "${SECRETS_DIR}"
chmod 700 "${SECRETS_DIR}"
export MICROFRONTEND_HOST_FOLDER

# Without a JWT secret the backend falls back to a hardcoded one, which means
# anybody could forge a token for this installation. A random secret is
# generated once and kept in the volume, so that the tokens issued before a
# restart stay valid.
if [ -z "${JWT_SECRET:-}" ]; then
    if [ ! -f "${JWT_SECRET_FILE}" ]; then
        node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("hex"))' > "${JWT_SECRET_FILE}"
        chmod 600 "${JWT_SECRET_FILE}"
        chown mfe:mfe "${JWT_SECRET_FILE}"
        log "generated a random JWT secret in ${JWT_SECRET_FILE}"
    fi
    JWT_SECRET="$(cat "${JWT_SECRET_FILE}")"
    export JWT_SECRET
fi

# `docker run <image> <command>` stays usable for troubleshooting.
if [ "$#" -gt 0 ]; then
    exec "$@"
fi

log "starting MongoDB, Redis, backend and Nginx"
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
