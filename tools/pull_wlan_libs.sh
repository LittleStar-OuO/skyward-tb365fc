#!/usr/bin/env bash
# Pull the VNDK v33 libraries the vendor wpa_supplicant needs from a
# booted phone into work/wlan_libs, where pack_tb365fc.sh takes them from.
#   usage: pull_wlan_libs.sh [serial]
set -euo pipefail
adb=${ADB:-adb}
serial=${1:-}
[ -n "$serial" ] && adb="$adb -s $serial"
out=/mnt/e/TB365FC_Recovery/work/wlan_libs
mkdir -p "$out"
for lib in libnl.so libssl.so libcrypto.so android.hardware.wifi.supplicant-V1-ndk.so; do
  "$adb" pull "/apex/com.android.vndk.v33/lib64/$lib" "$out/$lib"
done
ls -l "$out"
