# Skyward for Lenovo Xiaoxin Pad 12.1 2025 (TB365FC)

[简体中文](README.md) | [English](README.en.md)

## Directory

```
crates/                  Skyward sources, with this port's changes
devices/tb365fc.toml     device configuration
resources/fonts/         UI fonts
resources/tb365fc/       rc files, wrappers, VINTF and prop patches
tools/                   helpers: ramdisk, image packing, WSL build, MTP test
README.md                Chinese README, with the full troubleshooting log
README.en.md             this file
```

## Flashing

Prerequisites: the bootloader is unlocked; only **slot a** is used (the factory package never wrote slot b). **Do not flash the Release zip directly**: unzip it first. The `.img` inside is a complete vendor_boot partition image (64 MiB, ending in an AVB footer) and can be flashed with fastboot.

### From a GitHub Release (recommended)

1. Download the latest release, e.g. `skyward-v0.5.0-tb365fc-....zip`;
2. Unzip it to get one `.img`; in the 0.5.0 package this is `dec122.img` (you may rename it to `skyward-tb365fc.img`);
3. Check that it is exactly **67,108,864 bytes** and ends in `AVBf`;
4. Flash it:

```sh
adb reboot bootloader
fastboot devices
fastboot --disable-verification flash vbmeta_a vbmeta_stock.img
fastboot flash vendor_boot_a dec122.img
fastboot reboot recovery
```

- `vbmeta_stock.img` comes from the stock firmware package. Use it the first time (or to restore verification) to disable vendor_boot verification. If this page was already followed and verification is still off, flashing `vendor_boot_a` alone is enough.
- Do not flash the Release zip, and do not write the image to slot b.

### From a source build

The build output `out/skyward-tb365fc.img` is flashed the same way; replace `dec122.img` above with it, or with whatever `tools/pack_tb365fc.sh` produced.

Enter recovery with `adb reboot recovery`, or `fastboot reboot recovery`.

Roll back with:

```sh
fastboot flash vendor_boot_a vendor_boot_stock.img
fastboot flash vbmeta_a vbmeta_stock.img
```

SP Flash Tool with the full stock package (Download Only, never Format All) is the last resort. If `misc` still holds `boot-recovery`, flash 512 KiB of zeros there.

## Target device

| Item | Value |
| --- | --- |
| Device | Lenovo Xiaoxin Pad 12.1 2025 |
| Model | TB365FC |
| SoC | MediaTek Dimensity 6400 (MT6835) |
| System | ZUXOS 1.1.10.122 / Android 15 |
| Partitions | A/B; only slot a was written at the factory |
| Display | 12.1" 2560×1600 90 Hz, density 320 |
| Touch | Himax HX83122B (`himax-touchscreen`) |
| Recovery | lives in **vendor_boot**; there is no recovery partition |

## Status

| Feature | Status | Notes |
| --- | --- | --- |
| Skyward UI | √ | repacked vendor_boot, recovery service replaced on the stock ramdisk |
| Display | √ | 1600×2560 @ 90 Hz (DRM/KMS) |
| Touch | √ | 10 points, correct orientation |
| Chinese UI / themes | √ | follows the system language |
| Device info card | √ | model, SoC, RAM, panel, storage, OS version and battery are shown |
| Reboot to system / recovery | √ | both directions verified |
| Normal Android boot | √ | the system still boots with this vendor_boot |
| Install (zip / partition image) | × | to be verified |
| Backup | √ | full-partition backup to `/data/media/0/Skyward/backups/<stamp>` with per-item SHA-256; 19 GB / 21 items verified on 2026-11-28 |
| Restore | √ | full restore including data/media verified on 2026-11-28 (`backup restored, all but []`) |
| Dual boot | × | to be verified |
| MTP | √ | starts automatically (`auto_transfer`); large files copied both ways with matching MD5. MTU3 caps an endpoint request at 65532 bytes, so MTP uses 65024-byte (127×512) chunks |
| `adb shell` in recovery | √ | adbd runs in the `su` domain; root shell works |
| adb root in recovery | √ | adbd/su/shell are permissive under the debug policy; `adb shell id` is root |
| /data decryption (FBE) | √ | silent background decryption (`auto_decrypt`); Beanpod TEE + KeyMint 2.0 (AIDL) + HIDL gatekeeper; /data mounts as dm-9 (f2fs rw) |
| WiFi | √ | chip is powered at boot (wmt_loader/wmt_launcher/wlan_assistant, `wlan0`); the joined network is kept on persist and rejoined after a reboot |
| Online Skyward update | √ | working |
| Side / power key navigation | √ | volume and power keys verified |

Legend: √ verified; × not done or not available.

## Main differences from upstream

The recovery SELinux policy on this device is much stricter than on Xiaomi phones, so Skyward is refused at several points unless adapted. All changes degrade gracefully:

1. **No recovery partition**: pack vendor_boot (VNDRBOOT v4); `device.recovery_partition = "vendor_boot"`.
2. **Run directory on /tmp**: writes under `/skyward/run` are denied; Skyward uses `/tmp/skyward` for logs, screenshots, WLAN and install logs.
3. **Tolerant device info**: reads of `/proc/meminfo`, `/proc/cpuinfo` and similar use empty values instead of aborting the UI.
4. **Tolerant uevent listener**: a refused netlink socket skips events; the pages keep refreshing.
5. **Tolerant `/sys/power/mem_sleep`**: a refused write is treated as "refused", not fatal.
6. **Property strategy**: the packer removes duplicate `ro.*` keys before writing; `device.adb_root = true` with a debug policy that makes adbd/su/shell permissive, so `adb shell` is root.
7. **Device config** `devices/tb365fc.toml`: 1600×2560/320 dpi, no forced high refresh, `modules.sources=["vendor_boot","vendor_dlkm","vendor"]`, `persist`/`metadata` mounted, MTK EFS backup entries.
8. **MTP binding**: when switching to `mtp,adb`, unbind the UDC, remove the adb function links in configfs, then bind both functions; rebind adb alone on the way back. The xaga fork skipped the `none` step, so the MTP symlink conflicted and only ADB appeared. The duplicate adb binding action was removed, and `auto_transfer` starts MTP at boot.
9. **MTU3 transfer size**: MediaTek MTU3 returns `-EOPNOTSUPP` for endpoint requests over 65532 bytes, and FunctionFS rounds reads up to a whole packet. MTP therefore uses 65024-byte chunks; 1 MiB chunks reset the device as soon as Windows transfers a file.
10. **Tools**: `tools/pack_tb365fc.sh` injects decryption assets, USB/crypto wrappers, VNDK libraries and the AVB footer; `tools/mtp-test.ps1` tests MTP in both directions unattended.
11. **WiFi power chain**: connac1x is started by `wmt_loader` → `wmt_launcher` → `wlan_assistant`, not `conninfra_loader`. `wmt_drv`/`connfem` load at boot, `wlan_drv_gen4m_6835` when WLAN comes up, and NVRAM is read from a read-only nvdata mount.
12. **WiFi VNDK libraries**: the vendor supplicant needs `libnl.so`, `libssl.so`, `libcrypto.so` and `android.hardware.wifi.supplicant-V1-ndk.so` from the VNDK v33 APEX, which recovery does not mount. They are embedded in `/system/lib64/vndk33/`; `android.hardware.wifi.supplicant.ISupplicant/default` must be in the image's framework VINTF because servicemanager reads VINTF only at startup.
13. **WiFi persistence**: after a successful join the SSID/security/password are written to `/mnt/vendor/persist/skyward/wifi/` (0600); `auto_join = true` rejoins at boot and `prewarm = false` keeps calibration off the first screen. The PSK is plain text readable only by recovery root.
14. **Restore robustness**: a mount kept busy by init-started services is lazily detached instead of failing; an unreadable pax record only loses that record's metadata; the packer no longer writes xattr values containing newlines.
15. **Online Skyward update**: `[skyward] releases = "LittleStar-OuO/skyward-tb365fc"`. The updater asks the stock HIDL boot HAL (`android.hardware.boot@1.2-service`) which slot starts next, and falls back to HIDL when the AIDL `IBootControl` is only declared but not running. Release assets are named `skyward-<tag>-tb365fc-<stock build>.zip` and hold the whole vendor_boot image.

## Building

Environment: WSL Ubuntu 24.04 (or Linux), Rust 1.100.0, Android NDK r29, `cargo-ndk`, `lz4`.

```sh
export ANDROID_NDK_HOME=$HOME/android/android-ndk-r29
cargo ndk -t arm64-v8a --platform 30 build --release -p skyward
RUSTFLAGS="-C target-feature=+crt-static" cargo ndk -t arm64-v8a --platform 30 \
  build --release -p skyward-system-init --target-dir target/system-init
cargo build --release -p skyward-pack

target/release/skyward-pack recovery \
  --stock stock/vendor_boot.img \
  --binary target/aarch64-linux-android/release/skyward \
  --system-init target/system-init/aarch64-linux-android/release/system-init \
  --config devices/tb365fc.toml \
  --font resources/fonts/MiSansVF.ttf \
  --mono resources/fonts/KirkMono-Regular.ttf \
  --mono-license resources/fonts/KirkMono-OFL.txt \
  --out out/skyward-tb365fc.img
```

`stock/vendor_boot.img` is the 64 MiB partition image from the stock `TB365FC_ZUXOS_1.1.10.122` package; the output must be 67,108,864 bytes and end in `AVBf`.

`tools/pack_tb365fc.sh` then adds the decryption and WiFi assets and `tools/mkfooter.js` writes the AVB footer back. The verified image is `out/dec122.img` (0.5.0), SHA-256 `ac5b9996c7552f512e54b8264a50ec9895aa46c446136e434faa58d475a050f0`.

## Known issues

- **Install (zip / partition image) is not verified**; the entry points exist but no full flash-and-check run has been done.
- **Dual-boot switching is not verified**; the device is A/B but no second system has been installed.
- The vendor_boot vendor ramdisk is shared with normal boot. It has been verified not to break the system, but keep the stock images for rollback.

## Troubleshooting notes

The Chinese README keeps the full chronological log of every blocker, symptom, cause and verification. The notes below cover the same findings in short form.

### Packaging and boot

- **vendor_boot instead of a recovery partition**: pack with `skyward-pack recovery --stock stock/vendor_boot.img`; the result still ends in an unsigned AVB footer and fills 64 MiB.
- **AVB mismatch**: the top-level vbmeta has a hash descriptor for vendor_boot. Flash with `fastboot --disable-verification flash vbmeta_a vbmeta.img` before writing vendor_boot.
- **Slot b is empty** in the factory package; never switch active slots.
- **Duplicate `ro.*` keys** in `prop.default` make init refuse to boot. The packer deletes existing keys before appending.
- **SELinux denials** for writes to `/skyward/run`, `/proc`, the uevent socket or `/sys/power/mem_sleep` are tolerated and logged; none of them stops the UI.

### Binder, TEE and decryption

- recovery's binderfs lacks `hwbinder`/`vndbinder`; Skyward mounts and prepares them. `/dev/pts` must be usable before vendor programs start.
- The installed system's build properties are read from the mounted build.prop files; where that fails the info card leaves fields empty instead of aborting.
- MediaTek TEE order: `teei_daemon` → kernel `Keymaster Unlocked`/`TEEI_BOOT_OK` → `vendor.soter.teei.init=INIT_OK` → KeyMint. The TEE service must run in the recovery domain with recovery's own linker and libraries.
- **KeyMint AIDL wire format**: recovery's libbinder writes a `0x5245434F` ("RECO") header and the interface token. Structured parcelables use the C++ layout (presence marker + size), and `byte[]` is padded to 4 bytes. The v33 `libbinder_ndk` from /system works; v35 hangs in recovery.
- servicemanager only reads VINTF at startup. Services that register later (KeyMint, WiFi supplicant) must be declared in the image's manifest; the recovery-written `phone.xml` alone is too late.

### USB and MTP

- Two causes of disappearing USB were found: a duplicate adb binding action rebinding the gadget in a loop, and a stale `tools/skyward-pack` that never copied the edited `mtp.rc` into the image. The one-shot bind with `tb365.usb.bound` fixed the loop; the build script now always refreshes the packer.
- MTP needs the UDC unbound and `f1`/`f2` cleared before binding `mtp,adb`; the stock `f1` link otherwise blocks the MTP symlink.
- Windows transfers reset the device with 1 MiB chunks. MTU3 rejects requests over 65532 bytes and FunctionFS pads reads to a packet, so the chunk is 65024 bytes (127×512).
- A second recovery instance is fatal to USB: never run the installed `/system/bin/recovery` with a subcommand. Its `argv[0]` makes it enter the recovery service, which switches USB to `none`. Use a renamed copy such as `/tmp/skyward-cli` for the CLI. The debug build also redirects stdout to pstore; temporarily move `/dev/block/by-name/pstore` aside to see CLI output.

### WiFi

- Use `wmt_loader`, `wmt_launcher -p /vendor/firmware/ -o 1` and `wlan_assistant`; there is no `conninfra_loader` process on this device.
- Do not put `inet` in the assistant's groups: the recovery account table has no `inet`.
- Extract the VNDK v33 supplicant libraries into `/system/lib64/vndk33/`; the VNDK APEX is not mounted in recovery.
- servicemanager rejects the supplicant AIDL name unless it is declared in the framework VINTF baked into the image; otherwise wpa_supplicant exits with status 255.
- The joined network is stored on persist and rejoined at boot; `auto_join` starts the chip from the WLAN thread and `prewarm` is off so the pages are not blocked.

### Backup and restore

- A full backup (19 GB, 21 items) and a full restore were verified. Backups go to `/data/media/0/Skyward/backups/<stamp>` with a `backup.toml` carrying per-item size and SHA-256.
- Restore can hit `EBUSY` on `/mnt/system_ext` because init-started HALs keep it in use; Skyward now falls back to lazy detach and keeps the device mapped.
- A pax extension with a newline in an xattr value made tar-rs abort the whole data restore. Restore now skips only that record's metadata; the packer no longer writes such xattrs.
- Media backup/restore skips `*/Skyward`, so the backup directory is never overwritten by its own restore.

### Vibration

- TB365FC has no vibration motor. The DT node, `regulator_vibrator`, the HAL and the factory config are generic templates; switching the regulator is visible in the kernel log but nothing moves. The `[haptics]` entry, the LED backend and the settings row were removed.

## Credits

- [kirklin/skyward](https://github.com/kirklin/skyward): Skyward itself
- [BkaNeko/xaga-skyward](https://github.com/BkaNeko/xaga-skyward): MTK, vendor_boot, portrait and driver adaptation reference
- [Coolapk @黑橘火龙果's porting notes](https://www.coolapk.com/feed/75132513?s=ODQxYjkxOWQxZmQwMzhnNmIwOWUyYmF6a1591): realme X7 Pro Ultra and Skyward upstream PR #83 (black-screen debugging)

This repository is an unofficial port. Flashing is at your own risk; back up first and verify the model and firmware match.
