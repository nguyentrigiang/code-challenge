#!/usr/bin/env sh
# Renders every diagrams/*.mmd (Mermaid source) to an SVG next to it.
# Usage: sh diagrams/render.sh   (needs Node.js; downloads mermaid-cli on first run)
set -e
cd "$(dirname "$0")"
for source in *.mmd; do
  npx -y @mermaid-js/mermaid-cli@11.4.2 -i "$source" -o "${source%.mmd}.svg" -b white -q
  echo "rendered ${source%.mmd}.svg"
done
