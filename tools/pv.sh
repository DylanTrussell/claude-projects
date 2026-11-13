#!/bin/bash
# build; the preview pane serves public_deaf straight off the SSD (launch config apocalypse-meow-ssd)
cd "$(dirname "$0")/.." && bash tools/assemble.sh >/dev/null 2>&1 && echo built
