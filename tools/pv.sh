#!/bin/bash
# build, then mirror the muted build to a throwaway local folder the preview pane can read
# (macOS blocks the preview server from reading the SSD). `pv.sh clean` deletes the local copy.
L=~/Claude/am-preview
if [ "$1" = clean ]; then rm -rf "$L" && echo cleaned; exit; fi
cd "$(dirname "$0")/.." && bash tools/assemble.sh >/dev/null 2>&1 && mkdir -p "$L" && cp tools/serve.py "$L/serve.py" && rsync -a --delete public_deaf/ "$L/site/" && echo built+synced
