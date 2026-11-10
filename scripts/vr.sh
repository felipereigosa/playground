#!/bin/sh
# Run on the laptop (npm run vr [gadget]): opens Playground in the Quest
# browser, leaving Moonlight. Click anywhere on the page to enter VR; click
# both thumbsticks together to come back to Moonlight.
ADB=${ADB:-$HOME/Android/platform-tools/adb}
QUEST=$("$ADB" devices -l | awk '/model:Quest/ {print $1; exit}')
[ -z "$QUEST" ] && { echo "The Quest is not connected to adb"; exit 1; }
IP=$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | head -1)
URL="https://$IP:8300/?gadget=${1:-calculator}"
# Moonlight's VR view hides any app opened over it, so close it first. The
# laptop keeps the Desktop session, and leaving VR resumes it.
"$ADB" -s "$QUEST" shell am force-stop com.gilleece.moonlightxr.debug
"$ADB" -s "$QUEST" shell am start -a android.intent.action.VIEW -d "$URL" \
  com.oculus.browser >/dev/null && echo "Opened $URL on the Quest"
