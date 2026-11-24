#!/usr/bin/env bash
set -euxo pipefail

export RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static
export RUSTUP_UPDATE_ROOT=https://mirrors.ustc.edu.cn/rust-static/rustup

if [ ! -x "$HOME/.cargo/bin/rustup" ]; then
  curl -sSf -o /tmp/rustup-init "$RUSTUP_UPDATE_ROOT/dist/x86_64-unknown-linux-gnu/rustup-init"
  chmod +x /tmp/rustup-init
  /tmp/rustup-init -y --profile minimal --default-toolchain 1.100.0
fi
. "$HOME/.cargo/env"
rustup component add clippy --toolchain 1.100.0 || true
rustup target add aarch64-linux-android --toolchain 1.100.0

mkdir -p "$HOME/.cargo"
cat > "$HOME/.cargo/config.toml" <<'EOF'
[source.crates-io]
replace-with = "rsproxy-sparse"

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[net]
git-fetch-with-cli = true
EOF

mkdir -p "$HOME/android"
if [ ! -d "$HOME/android/android-ndk-r29" ]; then
  curl -sL -o /tmp/ndk.zip https://mirrors.cloud.tencent.com/AndroidSDK/android-ndk-r29-linux.zip
  unzip -q /tmp/ndk.zip -d "$HOME/android"
  rm -f /tmp/ndk.zip
fi

cargo install cargo-ndk --locked

rsync -a --delete --exclude target --exclude .git /mnt/e/TB365FC_Recovery/xaga-skyward/ "$HOME/skyward/"

cd "$HOME/skyward"
export ANDROID_NDK_HOME="$HOME/android/android-ndk-r29"
rustc --version
cargo ndk --version
ls resources/fonts
echo SETUP_DONE
