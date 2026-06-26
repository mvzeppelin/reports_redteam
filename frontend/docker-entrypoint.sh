#!/bin/sh
set -e

HTTPS_PORT="${HTTPS_PORT:-443}"

if [ "${HTTPS_ENABLED:-false}" = "true" ] && [ -f /etc/nginx/certs/cert.pem ]; then
    envsubst '${HTTPS_PORT}' < /etc/nginx/nginx-https.conf.template > /etc/nginx/conf.d/default.conf
else
    cp /etc/nginx/nginx-http.conf.template /etc/nginx/conf.d/default.conf
fi

exec "$@"
