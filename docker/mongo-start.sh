#!/bin/sh

set -eu

replica_set_name="${MONGO_REPLICA_SET_NAME:-rs0}"

# mongod's replica-set coordinator does a DNS isSelf() lookup shortly after
# startup. If the Docker network alias for 'mongodb' hasn't propagated yet the
# lookup times out, mongod marks itself REMOVED, and exits with code 1.
# Waiting here ensures the alias is resolvable before mongod touches the
# replica-set config.
until getent hosts mongodb >/dev/null 2>&1; do
  sleep 1
done

mongod --quiet --replSet "$replica_set_name" --bind_ip_all --dbpath /data/db &
mongo_pid=$!

cleanup() {
  kill "$mongo_pid" >/dev/null 2>&1 || true
  wait "$mongo_pid" >/dev/null 2>&1 || true
}

trap cleanup INT TERM

until mongosh --quiet --eval 'quit(db.adminCommand({ ping: 1 }).ok === 1 ? 0 : 1)' >/dev/null 2>&1; do
  sleep 1
done

mongosh --quiet /docker/mongo-init.js

wait "$mongo_pid"
