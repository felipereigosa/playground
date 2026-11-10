#!/bin/sh
# Opens Playground on the Quest and forwards its browser's devtools here.
#
# The server runs on the laptop as the user service `playground`
# (~/.config/systemd/user/playground.service there): webpack dev server over
# https on port 8300, with the self-signed cert.pem/key.pem made for the
# laptop's address. The Quest opens https://<laptop LAN IP>:8300 directly.
# As a fallback when the IP is wrong or the Wi-Fi blocks it, adb reverse also
# makes https://localhost:3000 on the Quest lead to the laptop's 8300.
#
# The Quest browser's devtools come back to localhost:9333 on the Linode.
#
# Usage: scripts/quest.sh [gadget]   also opens ?gadget=<gadget> on the Quest
ADB="$HOME/Android/Sdk/platform-tools/adb"
export ADB_SERVER_SOCKET=tcp:localhost:5038
QUEST=$("$ADB" devices -l | awk '/model:Quest/ {print $1; exit}')
[ -z "$QUEST" ] && { echo "No Quest on the laptop's adb"; exit 1; }
LAPTOP_IP=$(ssh laptop "ip -4 -o addr show scope global | awk '{print \$4}' | cut -d/ -f1 | head -1")
ssh laptop 'systemctl --user is-active --quiet playground' ||
  echo "Warning: the playground service on the laptop is not running"
"$ADB" -s "$QUEST" reverse tcp:3000 tcp:8300 >/dev/null
"$ADB" -s "$QUEST" forward tcp:9333 localabstract:chrome_devtools_remote >/dev/null
curl -s -m 2 -o /dev/null localhost:9333/json ||
  ssh -f -N -o ExitOnForwardFailure=yes -L 9333:localhost:9333 laptop
URL="https://$LAPTOP_IP:8300/?gadget=${1:-calculator}"
if [ -n "$1" ]; then
  "$ADB" -s "$QUEST" shell am start -a android.intent.action.VIEW \
    -d "$URL" com.oculus.browser >/dev/null
fi
echo "Quest $QUEST: $URL"
