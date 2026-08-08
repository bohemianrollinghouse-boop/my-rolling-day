#!/usr/bin/env bash
# Libère les ports des émulateurs Firebase après un Ctrl-C brutal sur `npm run emulators:start`.
#
# Ne tue QUE des process d'émulateur (java / node / firebase) : sur macOS des services
# système écoutent parfois sur ces ports (ControlCenter/AirPlay sur 5000), on les laisse
# tranquilles et on le signale.

set -euo pipefail

# auth, firestore, functions, hosting, UI — cf. bloc "emulators" de firebase.json
PORTS=(9099 8080 5001 5002 4000 4400 4500)

KILLABLE='^(java|node|firebase|firebase-tools|cloud_firestore|npm)'

to_kill=""
skipped=""

for port in "${PORTS[@]}"; do
  while read -r pid; do
    [ -z "${pid}" ] && continue
    cmd=$(ps -p "${pid}" -o comm= 2>/dev/null | xargs basename 2>/dev/null || true)
    if [[ "${cmd}" =~ ${KILLABLE} ]]; then
      to_kill+="${pid}"$'\n'
    else
      skipped+="  port ${port} → ${cmd} (pid ${pid})"$'\n'
    fi
  done < <(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)
done

if [ -n "${skipped}" ]; then
  echo "Process non-émulateur ignorés :"
  printf '%s' "${skipped}"
fi

pids=$(printf '%s' "${to_kill}" | sort -u | tr '\n' ' ')

if [ -z "${pids// /}" ]; then
  echo "Aucun émulateur à arrêter."
  exit 0
fi

echo "Arrêt des émulateurs : ${pids}"
kill ${pids}
