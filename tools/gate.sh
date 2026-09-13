#!/usr/bin/env bash
# The real build gate: simtest N times and require every run to pass.
#
# simtest is NOT deterministic -- sim.js and rails.js call unseeded Math.random()
# for spawns, aim jitter and wave composition -- so a single green run proves
# very little. This was not academic: the gate sat at 7 passes in 12 while every
# commit message in the session quoted one green run, and three real softlocks
# were hiding behind that noise.
#
# v13.13: the game used to fork twice (Huey/Skyraider after the truce, ramp/surf
# at the end of the river), and this gate rotated all four combinations. Both
# forks are gone now -- one route, Huey then surf-out -- so it just runs N times.
#
#   bash tools/gate.sh        # 12 runs
#   bash tools/gate.sh 25     # 25 runs
set -u
N="${1:-12}"
cd "$(dirname "$0")/.."
pass=0; fail=0; firstfail=""
for i in $(seq 1 "$N"); do
  # v13.15: with AM_BRANCHES=1 the game forks twice, so rotate all four routes
  # (no branch is ever certified by a run that never took it)
  args=""
  if [ -n "${AM_BRANCHES:-}" ]; then
    case $((i % 4)) in
      0) args="--branch=heli --boat=around" ;;
      1) args="--branch=heli --boat=ramp" ;;
      2) args="--branch=sky --boat=around" ;;
      3) args="--branch=sky --boat=ramp" ;;
    esac
  fi
  out="$(node tools/simtest.mjs $args 2>&1)"
  if echo "$out" | grep -q "^RESULT: VICTORY"; then
    pass=$((pass + 1)); printf "."
  else
    fail=$((fail + 1)); printf "X(%s)" "$args"
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
