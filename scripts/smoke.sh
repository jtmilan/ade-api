#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://127.0.0.1:8787}"
curl -sf "$BASE/health" | grep -q '"ok":true'
curl -sf "$BASE/v1/plans" | grep -q Hobby
curl -sf -H 'Authorization: Bearer dev' "$BASE/v1/me" | grep -q planId
curl -sf -H 'Authorization: Bearer dev' "$BASE/v1/entitlements" | grep -q '"sig"'
echo "smoke ok"
