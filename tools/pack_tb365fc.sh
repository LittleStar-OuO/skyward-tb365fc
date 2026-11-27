#!/usr/bin/env bash
# Assemble a flashable vendor_boot from Skyward's packer output: the
# decryption assets, the USB/crypto rc wrappers, the VNDK libraries the
# key and WLAN programs need, and the unsigned AVB footer.
#   usage: pack_tb365fc.sh <name>   (writes work/<name>_raw.img)
set -euo pipefail

name=${1:?usage: pack_tb365fc.sh <name>}
w=/mnt/e/TB365FC_Recovery
x=/home/builder/skyward/tools/ramdisk-x

"$x" "$w/out/skyward-tb365fc.img" "$w/work/${name}_raw.img" \
  --replace sepolicy="$w/work/sepolicy_final9" --replace prop.default="$w/work/prop.final3" \
  --add system/etc/vintf/manifest.xml="$w/work/framework_manifest_full.xml" \
  --replace system/etc/vintf/manifest/android.hardware.health-service.example.xml="$w/work/empty_framework.xml" \
  --addx system/etc/init/zz-tb365-usb.rc="$w/work/zz-tb365-usb.rc" \
  --addx system/etc/init/zz-tb365-crypto.rc="$w/work/zz-tb365-crypto.rc" \
  --addx skyld="$w/work/apex_runtime/bin/linker64" \
  --addx skyware/bin/hwservicemanager="$w/work/skyware/bin/hwservicemanager" \
  --addx system/bin/tb365_teei.sh="$w/work/tb365_teei.sh" \
  --addx system/bin/tb365_hwservice.sh="$w/work/tb365_hwservice.sh" \
  --addx system/bin/tb365_keymint.sh="$w/work/tb365_keymint.sh" \
  --addx system/bin/tb365_gatekeeper.sh="$w/work/tb365_gatekeeper.sh" \
  --add system/lib64/vndk33/android.hardware.security.keymint-V2-ndk.so="$w/work/apex_vndk/lib64/android.hardware.security.keymint-V2-ndk.so" \
  --add system/lib64/vndk33/android.hardware.security.secureclock-V1-ndk.so="$w/work/apex_vndk/lib64/android.hardware.security.secureclock-V1-ndk.so" \
  --add system/lib64/vndk33/android.hardware.security.sharedsecret-V1-ndk.so="$w/work/apex_vndk/lib64/android.hardware.security.sharedsecret-V1-ndk.so" \
  --add system/lib64/vndk33/libnl.so="$w/work/wlan_libs/libnl.so" \
  --add system/lib64/vndk33/libssl.so="$w/work/wlan_libs/libssl.so" \
  --add system/lib64/vndk33/libcrypto.so="$w/work/wlan_libs/libcrypto.so" \
  --add system/lib64/vndk33/android.hardware.wifi.supplicant-V1-ndk.so="$w/work/wlan_libs/android.hardware.wifi.supplicant-V1-ndk.so" \
  --add system/etc/selinux/plat_hwservice_contexts="$w/work/plat_hwservice_contexts"

echo "raw: $w/work/${name}_raw.img"
echo "now: node tools/mkfooter.js work/${name}_raw.img vendor_boot 67108864 out/${name}.img"
