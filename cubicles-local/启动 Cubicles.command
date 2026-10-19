#!/bin/zsh
cd -- "$(dirname -- "$0")"
if command -v node >/dev/null 2>&1; then
  task_node="$(command -v node)"
elif [[ -x /opt/homebrew/bin/node ]]; then
  task_node=/opt/homebrew/bin/node
else
  print 'Please install Node.js 20 or newer, then open this file again.'
  read '?Press Return to close.'
  exit 1
fi
if [[ ! -d node_modules/three ]]; then
  print 'Run npm install in this folder first.'
  read '?Press Return to close.'
  exit 1
fi
if /usr/bin/curl -fsS http://127.0.0.1:4173/api/world >/dev/null 2>&1; then
  open http://127.0.0.1:4173
  exit 0
fi
(sleep 1; open http://127.0.0.1:4173) &
"$task_node" server.mjs
