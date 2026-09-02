#!/usr/bin/env bash
# The real build gate: simtest N times and require every run to pass.
#
# simtest is NOT deterministic -- sim.js and rails.js call unseeded Math.random()
# for spawns, aim jitter and wave composition -- so a single green run proves
# very little. This was not academic: the gate sat at 7 passes in 12 while every
# commit message in the session quoted one green run, and three real softlocks
# were hiding behind that noise.
#
# v13.11: the game forks twice. After the truce you fly the Huey OR the
# Skyraider, and at the end of the river you put the boat over the wreck's fin
# (into the jungle) OR around it (onto the surfboard). Four routes. The gate
# rotates all four, so no branch is ever certified by a run that never took it.
#
#   bash tools/gate.sh        # 12 runs, branches alternating
#   bash tools/gate.sh 25     # 25 runs
set -u
N="${1:-12}"
cd "$(dirname "$0")/.."
pass=0; fail=0; firstfail=""
for i in $(seq 1 "$N"); do
  case $((i % 4)) in
    0) br=heli; bt=around ;;
    1) br=heli; bt=ramp   ;;
    2) br=sky;  bt=around ;;
    3) br=sky;  bt=ramp   ;;
  esac
  out="$(node tools/simtest.mjs --branch=$br --boat=$bt 2>&1)"
  if echo "$out" | grep -q "^RESULT: VICTORY"; then
    pass=$((pass + 1)); printf "."
  else
    fail=$((fail + 1)); printf "X(%s/%s)" "$br" "$bt"
    [ -z "$firstfail" ] && firstfail="$out"
  fi
done
echo
echo "simtest: $pass/$N passed"
if [ "$fail" -gt 0 ]; then
  echo "--- first failure ---"
  echo "$firstfail" | tail -14
  exit 1
fi
echo "GATE GREEN"
