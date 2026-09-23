#!/bin/sh
# Record the X/Twitter clip set (1920x1080, 30 fps, 12 s each), then a trailer from their best parts.
set -e
cd "$(dirname "$0")/.."
node scripts/record.mjs species=blue      seed=609693 turn=4 out=media/x-blue.mp4
node scripts/record.mjs species=orca      seed=42     turn=4 out=media/x-orca.mp4
node scripts/record.mjs species=manta     seed=42     turn=4 out=media/x-manta.mp4
node scripts/record.mjs species=whaleshark seed=7     turn=4 out=media/x-whaleshark.mp4
node scripts/record.mjs species=squid     seed=609693 turn=4 time=night out=media/x-squid-night.mp4
