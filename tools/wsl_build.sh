#!/usr/bin/env bash
set -euo pipefail
cd /home/builder/skyward
export ANDROID_NDK_HOME=/home/builder/android/android-ndk-r29
export PATH=/home/builder/.cargo/bin:$PATH

cargo ndk -t arm64-v8a --platform 30 build --locked --release -p skyward
RUSTFLAGS="-C target-feature=+crt-static" cargo ndk -t arm64-v8a --platform 30 build --locked --release -p skyward-system-init --target-dir target/system-init
cargo build --locked --release -p skyward-pack --bins

mkdir -p tools stock out
cp target/release/skyward-pack tools/skyward-pack
cp target/release/ramdisk-x tools/ramdisk-x
cp target/aarch64-linux-android/release/skyward tools/
cp target/system-init/aarch64-linux-android/release/system-init tools/
cp /mnt/e/TB365FC_Recovery/stock/vendor_boot_stock.img stock/vendor_boot.img

tools/skyward-pack recovery --stock stock/vendor_boot.img \
  --binary tools/skyward --system-init tools/system-init \
  --config devices/tb365fc.toml \
  --font resources/fonts/MiSansVF.ttf --mono resources/fonts/KirkMono-Regular.ttf \
  --mono-license resources/fonts/KirkMono-OFL.txt \
  --out out/skyward-tb365fc.img

cp out/skyward-tb365fc.img /mnt/e/TB365FC_Recovery/out/skyward-tb365fc.img
ls -l out/skyward-tb365fc.img
echo BUILD_DONE
