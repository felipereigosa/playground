#!/bin/sh
# Starts (or stops, with `stop`) a headless Chromium on the laptop for
# scripts/emulator.mjs, with its devtools tunnelled to localhost:9223 here.
# Headless because a normal window stops drawing while it is covered, which
# it is whenever Felipe uses the laptop; this one never shows on his screen.
# Run from the Linode.
if [ "$1" = stop ]; then
  ssh laptop 'pkill -f "user-data-dir=$HOME/snap/chromium/common/claude-headless"'
  pkill -f "ssh -f -N -o ExitOnForwardFailure=yes -L 9223" 
  exit 0
fi
if ! ssh laptop 'curl -s -m 2 localhost:9223/json/version >/dev/null'; then
  ssh laptop 'setsid nohup chromium --headless=new --remote-debugging-port=9223 \
    --no-first-run --enable-unsafe-swiftshader --use-angle=swiftshader \
    --ignore-gpu-blocklist --window-size=1280,800 \
    --user-data-dir=$HOME/snap/chromium/common/claude-headless \
    >/tmp/claude-headless.log 2>&1 </dev/null & sleep 4'
fi
curl -s -m 2 localhost:9223/json/version >/dev/null ||
  ssh -f -N -o ExitOnForwardFailure=yes -L 9223:localhost:9223 laptop
curl -s -m 2 localhost:9223/json/version | grep -q Browser &&
  echo "Headless Chromium ready on localhost:9223"
