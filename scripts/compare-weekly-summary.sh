#!/usr/bin/env bash
set -euo pipefail

DEV_URL="${DEV_URL:-http://localhost:5000}"
PROD_URL="${PROD_URL:-https://mealplanai.replit.app}"
COOKIE_FILE="${COOKIE_FILE:-}"
BEARER_TOKEN="${BEARER_TOKEN:-}"
WEEK_START="${WEEK_START:-}"

usage() {
  cat <<EOF
Usage: $0 [options]

Compare /api/weekly-summary responses between dev and production.

Options:
  --dev-url URL        Dev base URL (default: http://localhost:5000)
  --prod-url URL       Prod base URL (default: https://mealplanai.replit.app)
  --cookie FILE        Path to Netscape cookie file for session auth
  --token TOKEN        JWT Bearer token for auth
  --week-start DATE    YYYY-MM-DD week start (default: auto-calculated)
  -h, --help           Show this help

Auth: Provide either --cookie or --token. Without auth, endpoints return 401.

Examples:
  $0 --token "eyJhbG..." --week-start 2026-02-16
  $0 --cookie /tmp/cookies.txt
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev-url)   DEV_URL="$2"; shift 2 ;;
    --prod-url)  PROD_URL="$2"; shift 2 ;;
    --cookie)    COOKIE_FILE="$2"; shift 2 ;;
    --token)     BEARER_TOKEN="$2"; shift 2 ;;
    --week-start) WEEK_START="$2"; shift 2 ;;
    -h|--help)   usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

AUTH_ARGS=()
if [[ -n "$BEARER_TOKEN" ]]; then
  AUTH_ARGS=(-H "Authorization: Bearer $BEARER_TOKEN")
elif [[ -n "$COOKIE_FILE" ]]; then
  AUTH_ARGS=(-b "$COOKIE_FILE")
fi

QS=""
if [[ -n "$WEEK_START" ]]; then
  QS="?weekStart=$WEEK_START"
fi

echo "========================================"
echo "Weekly Summary Comparison"
echo "========================================"
echo "Dev:  $DEV_URL"
echo "Prod: $PROD_URL"
echo "Week: ${WEEK_START:-auto}"
if [[ -n "$BEARER_TOKEN" ]]; then
  echo "Auth: Bearer token"
elif [[ -n "$COOKIE_FILE" ]]; then
  echo "Auth: Cookie file"
else
  echo "Auth: none"
fi
echo "----------------------------------------"

if [[ ${#AUTH_ARGS[@]} -gt 0 ]]; then
  DEV_RESP=$(curl -sf "${AUTH_ARGS[@]}" "${DEV_URL}/api/weekly-summary${QS}" 2>&1 || curl -s "${AUTH_ARGS[@]}" "${DEV_URL}/api/weekly-summary${QS}" 2>&1)
  PROD_RESP=$(curl -sf "${AUTH_ARGS[@]}" "${PROD_URL}/api/weekly-summary${QS}" 2>&1 || curl -s "${AUTH_ARGS[@]}" "${PROD_URL}/api/weekly-summary${QS}" 2>&1)
else
  DEV_RESP=$(curl -sf "${DEV_URL}/api/weekly-summary${QS}" 2>&1 || curl -s "${DEV_URL}/api/weekly-summary${QS}" 2>&1)
  PROD_RESP=$(curl -sf "${PROD_URL}/api/weekly-summary${QS}" 2>&1 || curl -s "${PROD_URL}/api/weekly-summary${QS}" 2>&1)
fi

echo ""
echo "DEV response:"
echo "$DEV_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch{console.log(d)}})" 2>/dev/null || echo "$DEV_RESP"
echo ""
echo "PROD response:"
echo "$PROD_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch{console.log(d)}})" 2>/dev/null || echo "$PROD_RESP"
echo ""

json_parse() {
  echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j[$2]??'MISSING')}catch{console.log('ERROR')}})" 2>/dev/null || echo "ERROR"
}

is_json() {
  local result
  result=$(echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{JSON.parse(d);console.log('yes')}catch{console.log('no')}})" 2>/dev/null || echo "no")
  [[ "$result" == "yes" ]]
}

is_html() {
  echo "$1" | grep -qi "<!doctype\|<html" 2>/dev/null
}

PASS=0
FAIL=0
WARN=0

check() {
  local label="$1" result="$2"
  if [[ "$result" == "PASS" ]]; then
    echo "  [PASS] $label"
    PASS=$((PASS + 1))
  elif [[ "$result" == "WARN" ]]; then
    echo "  [WARN] $label"
    WARN=$((WARN + 1))
  else
    echo "  [FAIL] $label"
    FAIL=$((FAIL + 1))
  fi
}

echo "========================================"
echo "Checks"
echo "========================================"

if is_html "$DEV_RESP"; then
  check "DEV returns JSON (not HTML)" "FAIL"
else
  check "DEV returns JSON (not HTML)" "PASS"
fi

if is_html "$PROD_RESP"; then
  check "PROD returns JSON (not HTML)" "FAIL"
else
  check "PROD returns JSON (not HTML)" "PASS"
fi

if is_json "$DEV_RESP"; then
  check "DEV response is valid JSON" "PASS"
else
  check "DEV response is valid JSON" "FAIL"
fi

if is_json "$PROD_RESP"; then
  check "PROD response is valid JSON" "PASS"
else
  check "PROD response is valid JSON" "FAIL"
fi

DEV_MSG=$(json_parse "$DEV_RESP" "'message'")
PROD_MSG=$(json_parse "$PROD_RESP" "'message'")

if [[ "$DEV_MSG" == "Not authenticated" ]] || [[ "$PROD_MSG" == "Not authenticated" ]]; then
  echo ""
  echo "  Note: One or both endpoints returned 'Not authenticated'."
  echo "  Provide --token or --cookie to compare actual data."
  echo ""
fi

if [[ "$DEV_MSG" == "MISSING" ]] && [[ "$PROD_MSG" == "MISSING" ]]; then
  FIELDS="weekStart weekEnd score scheduledMeals completedMeals scheduledWorkouts completedWorkouts mealPct workoutPct overallScore"

  for field in $FIELDS; do
    DEV_VAL=$(json_parse "$DEV_RESP" "'$field'")
    PROD_VAL=$(json_parse "$PROD_RESP" "'$field'")

    if [[ "$DEV_VAL" == "$PROD_VAL" ]]; then
      check "$field: dev=$DEV_VAL == prod=$PROD_VAL" "PASS"
    elif [[ "$DEV_VAL" == "MISSING" ]] || [[ "$PROD_VAL" == "MISSING" ]]; then
      check "$field: dev=$DEV_VAL / prod=$PROD_VAL (field missing in one)" "WARN"
    else
      check "$field: dev=$DEV_VAL != prod=$PROD_VAL" "FAIL"
    fi
  done
fi

echo ""
echo "========================================"
echo "Also checking /api/week-data and /api/day-data"
echo "========================================"

TODAY=$(date +%Y-%m-%d)
for route in "/api/week-data${QS}" "/api/day-data/${TODAY}"; do
  if [[ ${#AUTH_ARGS[@]} -gt 0 ]]; then
    DEV_R=$(curl -sf "${AUTH_ARGS[@]}" "${DEV_URL}${route}" 2>&1 || curl -s "${AUTH_ARGS[@]}" "${DEV_URL}${route}" 2>&1)
    PROD_R=$(curl -sf "${AUTH_ARGS[@]}" "${PROD_URL}${route}" 2>&1 || curl -s "${AUTH_ARGS[@]}" "${PROD_URL}${route}" 2>&1)
  else
    DEV_R=$(curl -sf "${DEV_URL}${route}" 2>&1 || curl -s "${DEV_URL}${route}" 2>&1)
    PROD_R=$(curl -sf "${PROD_URL}${route}" 2>&1 || curl -s "${PROD_URL}${route}" 2>&1)
  fi

  if is_html "$DEV_R"; then
    check "DEV ${route} returns JSON" "FAIL"
  else
    check "DEV ${route} returns JSON" "PASS"
  fi

  if is_html "$PROD_R"; then
    check "PROD ${route} returns JSON" "FAIL"
  else
    check "PROD ${route} returns JSON" "PASS"
  fi
done

echo ""
echo "========================================"
echo "Summary: $PASS passed, $FAIL failed, $WARN warnings"
echo "========================================"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
