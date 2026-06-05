#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPENLIME_DIR="$ROOT_DIR/frontend/openlime"

cd "$OPENLIME_DIR"
npm run build-types
npm run rollup
