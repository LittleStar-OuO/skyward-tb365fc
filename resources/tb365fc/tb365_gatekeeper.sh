#!/system/bin/sh
export LD_LIBRARY_PATH=/vendor/lib64:/vendor/lib64/hw:/system/lib64/vndk33:/system/lib64
i=0
while [ "$i" -lt 80 ]; do
    [ "$(getprop hwservicemanager.ready)" = "true" ] && break
    sleep 0.25
    i=$((i + 1))
done
exec /vendor/bin/hw/android.hardware.gatekeeper@1.0-service
