#!/bin/bash
# build, then mirror the muted build to the local folder the preview pane serves
cd "$(dirname "$0")/.." && bash tools/assemble.sh >/dev/null 2>&1 && rsync -a --delete public_deaf/ ~/Claude/am-preview/site/ && echo built+synced
