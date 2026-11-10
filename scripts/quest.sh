#!/bin/sh
# Serves Playground from the Linode to the laptop and the Quest.
#   Linode localhost:3000 (webpack dev server, started separately: npm start)
#   -> laptop localhost:8300 (ssh -R; the laptop's own 3000 is taken)
#   -> Quest localhost:3000 (adb reverse, Quest on wireless adb via the laptop)
# Also forwards the Quest browser's devtools to localhost:9333 here.
# Usage: scripts/quest.sh [gadget]   opens ?gadget=<gadget> in the Quest browser
ADB="$HOME/Android/Sdk/platform-tools/adb"
export ADB_SERVER_SOCKET=tcp:localhost:5038
QUEST=$("$ADB" devices | awk '/Quest|:5555/ && $2=="device" {print $1; exit}')
[ -z "$QUEST" ] && QUEST=$("$ADB" devices -l | awk '/model:Quest/ {print $1; exit}')
[ -z "$QUEST" ] && { echo "No Quest on the laptop's adb"; exit 1; }
ssh laptop 'curl -s -m 2 -o /dev/null localhost:8300' ||
  ssh -f -N -o ExitOnForwardFailure=yes -R 8300:localhost:3000 laptop
"$ADB" -s "$QUEST" reverse tcp:3000 tcp:8300 >/dev/null
"$ADB" -s "$QUEST" forward tcp:9333 localabstract:chrome_devtools_remote >/dev/null
curl -s -m 2 -o /dev/null localhost:9333/json ||
  ssh -f -N -o ExitOnForwardFailure=yes -L 9333:localhost:9333 laptop
if [ -n "$1" ]; then
  "$ADB" -s "$QUEST" shell am start -a android.intent.action.VIEW \
    -d "http://localhost:3000/?gadget=$1" com.oculus.browser >/dev/null
fi
echo "Quest $QUEST: http://localhost:3000/?gadget=${1:-calculator}"
