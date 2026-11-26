#!/system/bin/sh
export LD_LIBRARY_PATH=/vendor/lib64:/vendor/lib64/hw:/system/lib64/vndk33:/system/lib64
i=0
while [ "$i" -lt 120 ]; do
    [ "$(getprop vendor.soter.teei.init)" = "INIT_OK" ] && break
    dmesg 2>/dev/null | grep -q "Keymaster Unlocked" && break
    sleep 0.5
    i=$((i + 1))
done
exec /vendor/bin/hw/android.hardware.security.keymint@2.0-service.beanpod
