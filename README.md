# Skyward for Lenovo Xiaoxin Pad 12.1 2025 (TB365FC)

[简体中文](README.md) | [English](README.en.md)

## 目录

```
crates/                  Skyward 源码（含本适配改动）
devices/tb365fc.toml     本机设备配置
resources/fonts/         UI 字体
resources/tb365fc/       rc / 包装脚本 / VINTF / prop 补丁等镜像资源
tools/                   辅助脚本（ramdisk 解析、整包打包、WSL 构建、MTP 测试）
README.md                简体中文说明（含排查记录）
README.en.md             English README
```

## 刷入方法

前置：bootloader 已解锁；仅操作**槽 a**（出厂包未写入槽 b）。

```sh
adb reboot bootloader
fastboot --disable-verification flash vbmeta_a vbmeta.img
fastboot flash vendor_boot_a skyward-tb365fc.img
fastboot reboot recovery
```

进入方式：`adb reboot recovery`（系统内），或 fastboot 的 `fastboot reboot recovery`。

回滚：

```sh
fastboot flash vendor_boot_a vendor_boot_stock.img
fastboot flash vbmeta_a vbmeta_stock.img
```

必要时用 SP Flash Tool + 原厂完整包恢复（Download Only，勿 Format All）。`misc` 分区若残留 `boot-recovery`，可刷入 512 KiB 全零镜像清除。

## 目标机型

基于 [kirklin/skyward](https://github.com/kirklin/skyward) 与 [BkaNeko/xaga-skyward](https://github.com/BkaNeko/xaga-skyward) 移植的第三方 recovery，目标机型：

| 项目 | 值 |
| --- | --- |
| 机型 | 联想小新 Pad 12.1 2025（Lenovo Xiaoxin Pad 12.1） |
| 型号 | TB365FC |
| SoC | 联发科 天玑 6400（MT6835） |
| 系统 | ZUXOS 1.1.10.122 / Android 15 |
| 分区 | A/B（出厂仅写入槽 a） |
| 屏幕 | 12.1" 2560×1600 90Hz，density 320 |
| 触摸 | Himax HX83122B（`himax-touchscreen`） |
| recovery 位置 | **vendor_boot**（无独立 recovery 分区） |

> GPL-3.0-or-later。Skyward 原作者为 Kirk Lin；MTK/vendor_boot/竖屏等改动来自 BkaNeko 的 xaga fork。

## 适配状态

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 进入 Skyward（UI） | √ | vendor_boot 重打包，原厂 recovery ramdisk 上替换恢复服务 |
| 显示 | √ | 1600×2560 @ 90Hz（DRM/KMS） |
| 触摸 | √ | 10 点，方向正确 |
| 中文界面 / 主题 | √ | 随系统语言 |
| 设备信息卡片 | √ | 型号、SoC、RAM、屏幕、存储、系统版本、电池等信息正常显示 |
| 重启到系统 / recovery | √ | `adb reboot` / `adb reboot recovery` 往返验证 |
| 正常 Android 启动不受影响 | √ | 刷着本 recovery 的 vendor_boot 时系统可正常启动 |
| 安装（zip / 分区镜像） | × | 待验证 |
| 备份 | √ | 全分区备份到 `/data/media/0/Skyward/backups/<时间>`，每项 SHA-256 校验；2026-11-28 实测 19 GB、21 项全部通过（boot/system/data/media/efs） |
| 恢复 | √ | 全分区恢复完成（2026-11-28 实测，含 data/media）；日志 `backup restored, all but []`，界面显示“恢复完成” |
| 双系统 | × | 待验证 |
| MTP（连接电脑） | √ | 开机自动后台启动（`auto_transfer`），Windows 可直接拖入/拖出；双向大文件按 MD5 校验一致。MTU3 单请求上限 65532 字节，MTP 块取 512 对齐的 65024 字节 |
| recovery 内 `adb shell` | √ | adbd 以 `su` 域运行，root shell 可用 |
| recovery 内 adb root | √ | debug policy 下 adbd/su/shell 为 permissive，`adb shell id` 为 root |
| /data 解密（FBE） | √ | 开机后台静默解密（`auto_decrypt`），首屏保持主页；Beanpod TEE + KeyMint 2.0 (AIDL) + HIDL gatekeeper，metadata 与 FBE 解开后 /data 挂载为 dm-9 (f2fs rw) |
| WiFi | √ | 开机自动上电（wmt_loader/wmt_launcher/wlan_assistant + `wlan0`），连接成功后的网络保存在 persist，重启自动连回；扫描/连接/ DHCP 已验证 |
| 在线更新 Skyward | × | 未配置发布仓库 |
| 侧键/电源键导航 | √ | 音量键/电源键导航已验证可用 |

图例：√ 已验证可用；× 未完成/不可用。

## 与原版的主要差异

本机 recovery 的 SELinux 策略比小米机型严格得多，直接运行 Skyward 会在多个点被拒绝。本仓库包含以下适配（均为通用、失败降级式改动）：

1. **无 recovery 分区**：打包 vendor_boot（VNDRBOOT v4）而不是 recovery 分区；`device.recovery_partition = "vendor_boot"`。
2. **运行目录改到 /tmp**：原版在 `/skyward/run` 建目录，rootfs 写入被 SELinux 拒绝；改为 `/tmp/skyward`（含 UI 日志/截图、WLAN、安装日志路径）。
3. **信息采集容错**：`/proc/meminfo`、`/proc/cpuinfo` 等读取被拒时使用空值，不再中断 UI 启动。
4. **uevent 监听容错**：netlink socket 被拒时跳过事件监听，界面照常刷新。
5. **`/sys/power/mem_sleep` 写入容错**：被拒时休眠线程按“被拒绝”处理，不退出。
6. **属性追加策略**：packer 写属性前先删除同名键，避免重复的 `ro.*` 导致 init 拒绝启动；本机 `device.adb_root = true`，debug policy 下 adbd/su/shell 为 permissive，`adb shell` 可直接以 root 运行。
7. **新设备配置** `devices/tb365fc.toml`：显示 1600×2560/320dpi、90Hz 不强制、`modules.sources=["vendor_boot","vendor_dlkm","vendor"]`、挂载 `persist`/`metadata`、MTK EFS 备份项等。
8. **MTP 绑定修复**：切到 `mtp,adb` 时先解绑 UDC 并清掉 configfs 里 adb 占用的 `f1`，再重新绑定双功能；返回 adb 时同样清理并重新绑定。xaga fork 原实现跳过 `none`，导致 MTP symlink 冲突而只有 ADB。另删除了重复的 adb 绑定 action（曾造成 gadget 反复重绑、USB 消失），并由 `auto_transfer` 在开机后自动启动。
9. **MTU3 传输块上限**：MediaTek MTU3 对超过 65532 字节的端点请求返回 `-EOPNOTSUPP`，而 FunctionFS 会把读缓冲向上对齐到整包，因此 MTP 块大小取 65024（127×512）。否则 Windows 一开始传输文件就会因请求失败而重置设备。
10. **调试/打包工具** `tools/` 与 `crates/skyward-pack/src/bin/ramdisk-x.rs`：用于检查/修改 vendor_boot ramdisk（非打包必需）。`tools/mtp-test.ps1` 可在 Windows 上无人值守地测 MTP 写入/读出；`tools/pack_tb365fc.sh` 把解密、USB/crypto 包装、VNDK 库与 AVB 尾部一次性打进镜像。
11. **WiFi 上电链**：MT6835 的 connac1x 由 `wmt_loader` → `wmt_launcher` → `wlan_assistant` 启动（不是 `conninfra_loader`）；`wmt_drv`/`connfem` 由 `[modules].load` 在开机时加载，`wlan_drv_gen4m_6835` 在 WLAN 拉起时加载，NVRAM 从只读挂载的 nvdata 读取。
12. **WiFi VNDK 库**：supplicant 依赖的 `libnl.so`、`libssl.so`、`libcrypto.so`、`android.hardware.wifi.supplicant-V1-ndk.so` 在 recovery 未挂载的 VNDK v33 APEX 里，已提取进 ramdisk 的 `/system/lib64/vndk33/`；`android.hardware.wifi.supplicant.ISupplicant/default` 必须写进镜像的 framework VINTF（servicemanager 只在启动时读 VINTF）。
13. **WiFi 凭据持久化**：连接成功（supplicant 已协商密钥）后写入 `/mnt/vendor/persist/skyward/wifi/`（0600）；`auto_join = true` 在开机时自动重连，`prewarm = false` 把校准放在后台 WLAN 线程里，不阻塞界面。密码为明文保存（仅 recovery root 可读），这是 recovery 环境下的取舍。
14. **恢复健壮性**：恢复前 detach 时，普通 umount 遇 EBUSY 自动降级为 lazy detach（init 启动的 HAL/服务占用 system_ext 等）；坏 pax 记录只跳过该条元数据、继续解文件；打包时不再写入含换行的 xattr。

## 构建

环境：WSL Ubuntu 24.04（或 Linux）、Rust 1.100.0、Android NDK r29、`cargo-ndk`、`lz4`。

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

`stock/vendor_boot.img` 为原厂 `TB365FC_ZUXOS_1.1.10.122` 刷机包中的 `vendor_boot.img`（整分区 64 MiB，末尾带 AVB footer）。产物应为 67,108,864 字节并以 `AVBf` 结尾。

解密、WiFi、USB/crypto 包装与 VNDK 库由 `tools/pack_tb365fc.sh` 继续注入，再用 `tools/mkfooter.js` 写回 AVB footer；当前验证镜像为 `out/dec117.img`：

| 文件 | SHA-256 |
| --- | --- |
| `dec117.img` | `e959af194f2ae02cb028f37ec6d04888d11b7e7a391f2dd0823297e16b2fc0f1` |

## 已知问题

- **安装（zip / 分区镜像）尚未验证**：入口可用，尚未在真机跑完整刷写与校验。
- **双系统切换尚未验证**：本机为 A/B，但未建立第二系统并验证切换。
- **在线更新 Skyward 未配置**：没有发布仓库/更新源。
- vendor_boot 的 vendor ramdisk 同时用于正常启动；已验证不影响系统启动，但请保留原厂镜像以便回滚。

## 排查记录（Troubleshooting）

以下记录移植过程中遇到的每个卡点：现象、原因、解决、验证方式。

记录本机（联想小新 Pad 12.1 2025，TB365FC，MT6835，ZUXOS 1.1.10.122）移植 Skyward 过程中遇到的每个卡点：现象、原因、解决、验证方式。持续更新。

---

### 1. 分区表没有 recovery 分区

**现象**：官方包 `MT6835_Android_scatter.txt` 中没有 `recovery`；`vendor_boot.img` 里却有完整的恢复用户空间（`/init`、`system/bin/recovery`、`res/`、`recovery.fstab`）。

**原因**：A/B + GKI 机型把 recovery 放进 vendor_boot 的 vendor ramdisk。

**解决**：使用支持 `recovery_partition = "vendor_boot"` 的 xaga fork（BkaNeko/xaga-skyward）；用原厂 `vendor_boot.img` 作为 `skyward-pack recovery --stock` 输入，输出仍是 VNDRBOOT v4 镜像。

**验证**：打包产物 64 MiB、末尾 `AVBf`、镜像内 ramdisk 含 Skyward；`fastboot flash vendor_boot_a` 后能进入。

---

### 2. 改过的 vendor_boot 与 AVB 不匹配

**现象**：直接刷修改后的 vendor_boot 可能被 bootloader 拒绝，或系统不启动。

**原因**：顶层 `vbmeta.img` 含 vendor_boot 的 hash 描述符；vendor_boot 自身也带未签名 vbmeta footer。

**解决**：`fastboot --disable-verification flash vbmeta_a vbmeta.img` 关闭校验后再刷 vendor_boot。启动器会改写 vbmeta flags（本机 fastboot 输出 `Rewriting vbmeta struct at offset: 0`）。

**注意**：保留原厂 `vendor_boot.img` / `vbmeta.img` 以便回滚；只操作槽 a。

---

### 3. 槽 b 出厂未写入

**现象**：scatter 中 `boot_b`、`init_boot_b`、`vbmeta*_b` 的 `file_name: NONE`。

**解决**：只用槽 a（`vendor_boot_a` / `vbmeta_a`），不要 `--set-active=b`。

---

### 4. 追加重复的只读属性导致无法启动

**现象**：只要在 `prop.default` 里再写一份 `ro.secure` / `ro.adb.secure` / `ro.debuggable`，设备就卡在联想 logo/黑屏，无 adb。

**原因**：原厂 `prop.default` 已两次定义这些键；本机 init 对重复的 `ro.*` 属性处理为致命。

**解决**：
- packer 写属性前先删除同名键（避免重复）；
- 本机最后配置 `device.adb_root = true`：debug policy 下 adbd/su/shell 为 permissive，`adb shell` 以 root 运行（见 9）。

**验证**：属性测试镜像（只改 props）能正常进原厂 recovery。

---

### 5. `/skyward/run` 无法创建（rootfs 写被拒）

**现象**：Skyward 启动即退出，日志：`Error: make /skyward/run — Permission denied`。

**原因**：联想 recovery 的 SELinux 不允许 recovery 域在 rootfs 的 `/skyward` 下建目录。

**解决**：运行目录改到 `/tmp/skyward`（`skyward-sys::RUN/LOG`、UI 日志/截图、WLAN、安装日志路径一并修改）。

**验证**：启动后不再报该错误，USB/adb 能起来。

---

### 6. `/proc/meminfo` 等读取被拒导致 UI 不启动

**现象**：日志 `Error: read /proc/meminfo — Permission denied`，UI 在首帧前退出，无 adb（此时 USB 尚未设置）。

**原因**：联想 recovery 的 SELinux 策略禁止 recovery 域读取某些 proc/sysfs 文件。

**解决**：`skyward-info` 的信息采集改为**容错降级**（读不到用空值），不再中断 UI；同类还有电池 sysfs 读取。

**验证**：UI 正常显示，设备信息卡片部分字段为空。

---

### 7. uevent netlink socket 被拒

**现象**：`Error: open the uevent socket — Permission denied`。

**解决**：`skyward-sys::uevent::Listener` 在 socket 创建/绑定失败时降级为不监听事件（`socket: Option<OwnedFd>`），界面按自身时钟刷新。

---

### 8. `/sys/power/mem_sleep` 写入被拒

**现象**：`Error: write s2idle to /sys/power/mem_sleep — Permission denied`。

**解决**：休眠线程把该写入视为尽力而为，失败后按“休眠被拒绝”处理，不影响 UI。

---

### 9. recovery 内 `adb shell` 崩溃（已解决）

**现象**：`adb devices` 能看到 `recovery`，但 `adb shell` 触发 adbd 崩溃：`Could not set SELinux context for subprocess`。

**原因**：本机 recovery 策略没有 shell 域/缺少上下文转换；`setexeccon` 失败使 adbd 中止。

**解决**：调试版 sepolicy 把 `adbd`/`su`/`shell` 置为 permissive，并放宽 `adb_root`，adbd 以 `su` 域直接提供 root shell（`adb shell id` → `uid=0(root) context=u:r:su:s0`）。

---

### 10. MTP 不枚举（只看到 ADB）

**现象**：`sys.usb.state=mtp,adb`、`sys.usb.ffs.mtp.ready=1`，Windows 却只有 Android Composite ADB Interface。

**原因**：xaga fork 的 `usb::switch` 为不重启 adbd，在 adb→mtp 时跳过 `none`；configfs 里 `f1` 仍被 adb 占用，MTP symlink 失败（EEXIST），最终只有 ADB 功能。

**解决（两处）**：
1. `mtp.rc`：进入 `mtp,adb` 时先 `write UDC ""` 解绑、`rm f1/f2`，再 symlink `ffs.mtp→f1`、`ffs.adb→f2`、写 UDC、置 state；返回 adb 时同样清理并重新绑定。补丁先保留 `f1/f2` 清理，再加回 symlink。
2. `usb.rs`：恢复 fast-path（adb↔mtp 不经过 `none`），避免 adbd 在 stop/start 后不恢复（本机 `none→mtp` 时 adbd 会停留在 stopped，USB 全无）。

**验证**：Windows 枚举出 `Lenovo Xiaoxin Pad 12.1 (2025)`（WPD/MTP，MI_00）与 ADB（MI_01）。

---

### 11. 调试与日志抓取手段（通用）

- **pstore 裸分区日志**：调试版把 stdout/stderr 以 `O_SYNC` 重定向到 `/dev/block/by-name/pstore` 偏移 4096，崩溃后回系统 `adb root; dd if=/dev/block/by-name/pstore bs=1M count=4` 提取。内核正常重启不清该分区，最可靠。
- **摄像头抓屏**：Iriun Webcam + ffmpeg（`-f dshow -i "video=Iriun Webcam"`）抓帧读 UI/终端内容，避免反复口述。
- **Skyward 终端**：设置→终端可跑 `tail -n 40 /tmp/skyward/recovery.log`、`getprop`；但受 SELinux 限制读不了 configfs/persist。
- **持久分区（persist）日志不可用**：recovery 域写 persist 被拒；系统侧 adbd 也因路径标签无法读取。

---

### 12. permissive 尝试无效（记录）

**尝试**：在 `init.rc`/`init.recovery.*.rc` 里 `write /sys/fs/selinux/enforce 0`、vendor_boot cmdline 加 `androidboot.selinux=permissive`。**均未生效**（Skyward 启动时读 enforce 仍为 1）。

**结论**：不依赖 permissive；改用容错/路径迁移解决各拒绝点。也尝试过去掉 `service recovery` 的 `seclabel`（以 init 域运行），Exec 被拒、无 adb，已回退。

---

### 13. recovery 的 binderfs 缺 hwbinder/vndbinder 节点

**现象**：解密报 `point /dev/vndbinder at /dev/binderfs/vndbinder: File exists`；`/dev/vndbinder` 是悬空 symlink。

**原因**：原厂 init 只在正常系统里建这两个节点；recovery 的 binderfs 里没有，init 先建了指向不存在目标的 symlink。

**解决**：Skyward 自己通过 binderfs 的 `binder-control` ioctl（`BINDER_CTL_ADD`）创建 hwbinder/vndbinder 节点，并清理悬空链接；只有 `/dev/binder` 是硬性要求，其余失败仅记录。

**验证**：`/dev/binder` 可打开，后续 KeyMint 查找能走到 servicemanager。

---

### 14. `/dev/pts` 不可读导致 `devices not brought up`

**现象**：`devices not brought up: read /dev/pts: Permission denied`，bring_up 中止。

**原因**：`ueventd::apply()` 递归遍历 /dev 时被 SELinux 拒绝。

**解决**：遍历时跳过不可读目录，赋权失败只记录（尽力而为），不再中止。

---

### 15. 接管版本属性被 init 拒绝

**现象**：`init refused ro.build.version.release=15`。

**解决**：在 init.rc 早期直接 `setprop ro.build.version.release/security_patch/vendor.security_patch`；Skyward 的接管失败仅记录。

---

### 16. 固件 fallback sysctl 被拒

**现象**：`write 1 to /proc/sys/kernel/firmware_config/force_sysfs_fallback: Permission denied`。

**解决**：容错，驱动缺固件时自行报错。

---

### 17. servicemanager 检测误判

**现象**：`ctl.start servicemanager` 被属性权限拒绝；`init.svc.*` 和 `/proc/*/exe` 在 recovery 里都不可读。

**解决**：优先读 `init.svc.servicemanager` 属性判断；无法启动时不中断，改为配置内第一个服务（后改为 init 启动）。

---

### 18. 本机没有 odm 逻辑分区

**现象**：`odm_a is not mounted`，keys 读取中止。

**解决**：`keys::read` 跳过缺失分区，继续读 system_ext/vendor。

---

### 19. recovery 域不能执行 vendor 程序（teei/keymint）

**现象**：`/vendor/bin/teei_daemon: start ... Operation not permitted`；keymint `Permission denied`。文件权限为 0755，排除 DAC；是 SELinux 域限制。

**尝试**：permissive（init.rc 写 enforce、vendor_boot/boot cmdline 的 `androidboot.selinux=permissive`）均未生效。

**当前方案**：改由 **init 启动**这些服务（init 域有执行与域转换权限），Skyward 仅作客户端（`device.keys_from_init = true`）；init.rc 注入：
- `teei_daemon`（原厂参数、用户/组、SYS_RAWIO）
- `hwservicemanager`（安装系统的 `/mnt/system_ext/bin/hwservicemanager`）
- `vendor.keymint-beanpod`（AIDL 2.0）
- `gatekeeper@1.0-service`、`boot@1.2-service`
- TEE/RPMB 节点 chown、`hwservicemanager.disabled=false`

**关键发现**：
1. `/dev/teei_client` 等 TEE 节点**其实存在**（内核日志里标签为 `teei_client_device`），只是 recovery 域 `getattr` 被拒 → Skyward 误报“节点不存在”。由 init 启动服务时它们就在 init 侧可见。
2. `class_start hal` 在 `on boot`（约 8.09 s）执行，而 system/system_ext/vendor 在 8.2 s 后才挂载，所以 init 报 `Cannot find '/vendor/bin/teei_daemon'`。服务必须在分区挂载后启动。
3. 因此改为：Skyward 在挂载完成后设置属性 `skyward.keys=1`，init 的触发器再 `start` 这些服务（而不是 `class_start hal`）。

**验证计划**：dec23（显式 `start` 触发）为下一候选；dec22（`class keys` + `class_start`）在真机上黑屏且无 adb，先回刷已知可用镜像再验证 dec23。

---

### 20. 调试手段（无需用户手动输入）

- **pstore 分区分段镜像**（调试版）：stderr 4 KiB；Skyward 日志 1 MiB；init 服务状态 2 MiB；`/dev/kmsg` 转储 3 MiB。重启进系统后用 root `dd if=/dev/block/by-name/pstore` 读取。
- **init marker 存在性判定**：在 init.rc 各段后 `write /tmp/mk-N 1`，在 recovery 直接用 `adb pull` 判断（`Permission denied` = 存在）。
- **自动 KeyMint 探测**：调试版启动 25 秒后尝试 `Binder::open` + `KeyMint::open`，结果写 stderr→pstore，无需密码。
- **摄像头抓屏**：Iriun Webcam + ffmpeg 抓帧读 UI/终端。

---

### 21. HAL 域的 linker 问题（最终根因）

**现象**：init 以原生 HAL 域启动 teei/keymint/gatekeeper 后，程序 SIGSEGV（signal 11）或退出 127/1。

**原因**：
- 不设 seclabel 时，init 自动进入原生域（`tee`、`hal_keymint_default`、`hwservicemanager`），但这些域**无权 map recovery 的 rootfs 版 `/system/bin/linker64`**（avc: `map ... rootfs`）。
- 设 `seclabel u:r:recovery:s0` 时被 **entrypoint** 规则拒绝（`entrypoint ... tee_exec`）。
- 安装系统的 `/system/bin/linker64` 是指向 `/apex/com.android.runtime/bin/linker64` 的符号链接；recovery 未挂载 runtime apex（loop 设备被拒），因此没有带正确标签的 linker。

**可行的解决路径**：
1. 在启动 HAL 前挂载 `com.android.runtime` apex（需 loop 或以 init 域运行一个同步 helper），让原生域用带正确标签的 linker。
2. 离线修补 ramdisk 的 `sepolicy`（已定位到根目录 `sepolicy`，1.09 MB），对 `tee` / `hwservicemanager` / `hal_keymint_default` / `hal_gatekeeper_default` 设 permissive 或补 rootfs/apex 访问规则。

---

### 当前状态

- 已验证：显示、触摸、adb root/shell、MTP（开机自动启动、双向传输）、`/data` 静默解密、WiFi（开机自动连接、凭据持久化）、侧键/电源键导航、全分区备份（SHA-256 逐项校验）、全分区恢复（含 data/media）。
- 未验证/未完成：安装（zip/分区镜像）、双系统、在线更新。

### 22. recovery 的 servicemanager 与 KeyMint 查找（已解决，见 25）

**现象**：解密界面报 `look up android.hardware.security.keymint.IKeyMintDevice/default: the directory answered no method this recovery knows`；而 TEE/KeyMint/Gatekeeper/hwservicemanager 均已运行（`vendor.soter.teei.km.init=finish`）。

**证据**：对 stock recovery servicemanager 用方法码 1–4（带头/不带头两种 parcel 布局）全部得到 `EX_TRANSACTION_FAILED (-2147483647)`，即每次都有回包但被目录以异常拒绝；这与“接口令牌/方法编号与该 recovery 目录不匹配”一致。

**已做的容错**：`crates/skyward-binder` 现在对 `find/add/declared/names` 同时尝试 `SYST` 头布局与“仅接口令牌”布局，并尝试两套方法编号（33/36 世代），失败时 `declared` 按已声明继续。

**参考**：联想 TB336ZA（同为 MT6835、vendor_boot 恢复、Android 15）TWRP 树已实现解密（github.com/9cb14c1ec0/android_device_lenovo_sycamore_row_5G）：
- crypto 服务全部以 `u:r:recovery:s0` 运行（原版 vendor 二进制 + recovery 自带 linker/库，VNDK v33 的 keymint-V2/secureclock/sharedsecret 放在库路径里）。
- TEE 起来后（dmesg “Keymaster Unlocked”、`vendor.soter.teei.init=INIT_OK`）再启动 KeyMint。
- `hwservicemanager` 需要 recovery 框架清单里声明 `android.hidl.manager@1.2::IServiceManager`，否则判定“不支持 HIDL”自行退出；HIDL 设备 HAL（gatekeeper）必须在 /vendor 清单声明。
- `plat_hwservice_contexts` 必须完整（含 `android.hidl.base::IBase`），否则 gatekeeper 注册被拒。
- device 型 VINTF fragment 不能放在 `/system/etc/vintf/manifest/` 框架目录，否则 libvintf 组装失败；该目录的 health 示例已替换为空框架清单。
- 他们直接以 recovery 域跑原版 `servicemanager`/`keystore2`；本移植由 Skyward 直接调用 KeyMint。

**当前状态**：dec67 开机四件套（TEE/KeyMint/Gatekeeper/hwsvc）全部正常；仅剩 Skyward 对 stock recovery servicemanager 的 AIDL 方法编号/令牌仍不匹配，继续用 1..12 全码探测定位。

**续（同一天）**：进一步实测表明：
- 对 stock recovery servicemanager 的 **方法码 1–12 × 9 种 parcel 头部布局（含 SYST 两种字节序、0x40/-1、无头）** 全部返回 `EX_TRANSACTION_FAILED (-2147483647)`；即它每次都有回包但一律以异常拒绝，方法编号并非原因。
- 自写的 `libbinder_ndk` 小客户端在同一时刻 `AServiceManager_checkService` 会**阻塞**（10s 超时），说明该目录对新客户端也不响应；而开机时 libbinder 的 addService（health、KeyMint）是成功的（`vendor.soter.teei.km.init=finish`）。
- 用 v35 的完整 servicemanager 替换后，KeyMint 反而 `addService` 失败（`Check failed: status == STATUS_OK`），说明 VINTF/目录语义又不同。

**结论**：基础 recovery 与整套 TEE/KeyMint/Gatekeeper/hwservicemanager 已稳定；decrypt 最后一步卡在 **Skyward 的裸 binder 客户端与该 recovery 目录的 AIDL 互操作**。下一步两条路线：
1) 按参考 TB336ZA 的做法改走 **keystore2 + vold in-process**（服务全部 recovery 域，目录用完整实现）；
2) 让 Skyward 的 service 查找改用 **libbinder_ndk**（需引入其 NDK API 与 KeyMint AIDL 头）或修正 parcel/事务细节。

### 23. USB/adb 消失的两个真正原因（已修）

1. **重复的 adb 绑定动作**：stock `init.rc` 与 `skyward-mtp.rc` 各有一段 `on property:sys.usb.config=adb && ffs.ready && configfs` 动作，互相写 UDC 造成 gadget 反复重绑（内核日志可见 pullup D-/D+ 约 10Hz 跳动），Windows 永远枚举不出设备。删除 `skyward-mtp.rc` 里的 adb-only 绑定段即可。
2. **packer 的 include_bytes 陈旧**：`tools/skyward-pack` 是手工拷贝的旧二进制，`wsl_build.sh` 不更新它，导致改了 `mtp.rc` 也不会进镜像。修法：构建后 `cp target/release/skyward-pack tools/`（本次已做），或让脚本自动拷贝。

现在 USB 由 `zz-tb365-usb.rc` 在 `on boot` 启动 adbd、在 `sys.usb.ffs.ready=1 && tb365.usb.bound=0` 时一次性绑定 adb，Skyward 的 `usb::set/switch` 全为空操作，端口不再被改动；实测 `tb365.usb.bound=1`、`sys.usb.state=adb` 稳定。

### 24. KeyMint AIDL 的最后互操作细节（已解决，见 25）

- KeyMint beanpod 是 **AIDL NDK 后端**（NEEDED `libbinder_ndk.so`，接口库 `-V2-ndk.so`），事务码已核对：`begin = 10`、`getHardwareInfo = 1`、`upgradeKey = 6`、`convertStorageKeyToEphemeral = 13`、`getKeyCharacteristics = 14`，与 Skyward 常量一致。
- NDK 的 `AParcel_writeString` 反汇编确认为 `int32 UTF-16 单元数 + 单元 + NUL`，与 Skyward `string()` 相同；`AIBinder_transact` 的接口令牌布局仍与 Skyward 的裸事务存在差异，`begin` 仍返回 `EX_TRANSACTION_FAILED (-2147483647)`。
- 下一步建议：为 KeyMint 写一个 **libbinder_ndk C shim**（`AServiceManager_getService` + `AIBinder_prepareTransaction`/`AParcel_write*`/`AIBinder_transact`），由 Rust 通过 FFI 调用；或按参考树改走 **keystore2 + vold**。

**续 2**：用 libbinder_ndk 真机对照，得到关键结论：
- v35（/mnt/system）的 libbinder_ndk 在 recovery 里 `AServiceManager_checkService` 会**挂起**；
- **recovery 自带 v33 的 libbinder_ndk 工作正常**，能查到 KeyMint（`FOUND`），且与开机时 health/KeyMint 注册用的库一致；
- KeyMint V2 的 `BpKeyMintDevice::begin` 反汇编显示 `AIBinder_prepareTransaction` 后**直接写参数**（无接口令牌）；`begin` 失败更可能在 **KeyParameter/byteArray 的序列化细节**（AIDL NDK 的数组/可分段编码与 Skyward 现有 C++ 风格布局的差异）。
- 下一步：使用 **v33 libbinder_ndk 的 AParcel C API** 写一个 KeyMint C shim（getHardwareInfo/begin/update/finish/abort），Rust 通过 FFI 调用；或继续逐项对齐 begin 的参数编码。

**续 3（重大进展）**：给 HAL 的 AIDL 事务改成 **recovery 头（0x5245434F "RECO"）+ 接口令牌**（与目录调用同一格式）。logd 里 KeyMint 接收端曾明确报 `Expecting header 0x5245434f but found ... Mixing copies of libbinder?`。之后：
- `convertStorageKeyToEphemeral`（只带一个 byte[]）已被 TEE 处理，返回 KeyMint 业务错误 **-33（version mismatch，符合假 key）**——说明事务、TEE、keymint 全链路通了；
- `begin` 仍被服务端以 **-22（EX_ILLEGAL_ARGUMENT）** 拒绝，参数序列化还差最后一点（已按 NDK 的 size-prefixed parcelable、无 presence 调整参数与令牌；`optional<HardwareAuthToken>` 的写法仍待对齐）；
- 无头探针（开机 20s 自动跑 convert/begin/abort）已加入调试版，不再需要点屏测试；pstore 可直接读结果。
- 设备上 `libbinder_ndk`：**v33（/system/lib64）正常**，v35（/mnt/system）会挂起；因此后续 C 侧对照要用 v33。

### 25. 解密打通：KeyMint 的 AIDL 报文格式（已解决）

最终可用组合：
1. **RECO 头 + 接口令牌**（0x5245434F "RECO"；logd 证实接收端 `Expecting header 0x5245434f`）。
2. 结构化 parcelable 用 **C++ 风格**：可空结构前写 presence=1、再写 size；`KeyParameter`/`Timestamp`/`HardwareAuthToken` 同理。
3. `byte[]` 在 Parcel 中 **4 字节对齐**。
4. 可空 `HardwareAuthToken` 用 presence 0/1。

结果：无头探针中 `convertStorageKeyToEphemeral` 与 `begin/abort` 都进入 TEE（假 key 得到 KeyMint 业务错误 -33）；真实 PIN 下 Skyward 成功解密并挂载 `/data`（dm-9，f2fs rw），文件管理可浏览。

同时确认：**v33 的 /system/lib64/libbinder_ndk 在 recovery 可用，v35 会挂起**（因此 HAL 都使用 recovery 自带库）。

### 26. 最终状态与复现说明

**已验证镜像**：`out/dec115.img`（vendor_boot，64 MiB）。开机后：
- `zz-tb365-usb.rc` 启动 adbd 并一次性绑定 adb（`tb365.usb.bound=1`）；Skyward 的 `usb::set/switch` 负责后续 adb↔`mtp,adb` 切换，`auto_transfer` 自动启动文件传输；
- `zz-tb365-crypto.rc` 在 `tb365.usb.bound=1` 时启动 `tb365_teei / tb365_hwsvc / tb365_keymint / tb365_gatekeeper`（全部 recovery 域、root，使用 recovery 自带的 linker/库）；
- 开机静默解密（`auto_decrypt`），metadata+FBE 解开后 `/data` 挂载为 dm-9（f2fs rw）；WiFi 自动连接并可从 persist 恢复网络。

**复现要点**：
1. 构建后必须把 `target/release/skyward-pack` 复制到 `tools/skyward-pack`（脚本曾遗漏，导致 `mtp.rc` 改动不进镜像，也是 USB 反复消失的间接原因）。
2. KeyMint 报文 = **RECO 头 + token**，参数用 C++ 结构化 parcelable（presence+size），`byte[]` 对齐；不要用 NDK 的无信封布局。
3. HAL 全部使用 recovery 自带的 v33 `libbinder_ndk`/linker；v35 在 recovery 会挂起。
4. 资源：`resources/tb365fc/` 存放 rc、wrapper 脚本、VINTF 清单与 prop 补丁文件。

**已知限制**：recovery 的 SELinux 策略含 permissive 域（开发镜像）；调试版含开机探针；安装（zip/分区镜像）、双系统、在线更新尚未验证或未配置。

### 29. WiFi 上电与 supplicant（已解决）

**硬件/模块**：MT6835 内置 connac1x；`ro.vendor.wlan.gen=gen4m_6835`。模块在 `/vendor_dlkm/lib/modules`：`connadp`、`btif_drv`、`wmt_drv`、`connfem`、`wmt_chrdev_wifi`、`wlan_drv_gen4m_6835`（6 MB，固件内嵌），`/vendor/lib/modules` 是符号链接。

**原厂启动链**（实测 Android 进程）：`wmt_loader`（oneshot）→ `wmt_launcher -p /vendor/firmware/ -o 1`（常驻，置 `vendor.connsys.driver.ready=yes`）→ 加载 `wmt_chrdev_wifi` + `wlan_drv` → `wlan_assistant`（wifi 用户，读 nvdata 的 APCFG/APRDEB/WIFI，写驱动后置 `vendor.mtk.nvram.ready=1`）→ 写 `/dev/wmtWifi=1` → `wlan0`。**本机没有 `conninfra_loader` 进程**，不要照搬 xaga 的配置。

**节点**：`/dev/wmtWifi`（wifi:wifi 660，`[wlan].nodes` 在模块加载后移交）、`/dev/wmtdetect`、`/dev/stpwmt`（root，wmt_loader/launcher 以 root 运行即可）。

**坑与修复**：
1. `wlan_assistant` 配 `groups=["system","gps","inet"]` 会失败：recovery 的账户表没有 `inet`。去掉 `inet`。
2. supplicant 链接失败：VNDK v33 APEX 在 recovery 未挂载。从原厂 Android 的 `/apex/com.android.vndk.v33/lib64/` 提取 `libnl.so`、`libssl.so`、`libcrypto.so`、`android.hardware.wifi.supplicant-V1-ndk.so`，放进 ramdisk `/system/lib64/vndk33/`，并在 `[wlan].libraries` 首位加入该目录。
3. supplicant 退出 255：servicemanager 报 `Could not find android.hardware.wifi.supplicant.ISupplicant/default in the VINTF manifest`。servicemanager 只在启动时读 VINTF，Skyward 启动后写的 `phone.xml` 太晚。把该 AIDL HAL 写进镜像的 framework manifest（`work/framework_manifest_full.xml`）即可。

**验证**：无头扫描 `Cmd::Wlan` 扫到 23 个网络；UI 连接成功，DHCP 得到 192.168.0.180。

### 30. WiFi 凭据持久化（已解决）

连接成功（收到 `CTRL-EVENT-CONNECTED`）后，Skyward 把 SSID/安全类型/密码写入 `/mnt/vendor/persist/skyward/wifi/wifi.conf`（目录 0700、文件 0600，明文 PSK，仅 recovery root 可读）。`[wlan] auto_join = true` 让 WLAN 在开机时自动拉起并加入保存的网络；`prewarm = false`，把芯片校准放在 WLAN 线程里，不阻塞首屏。密码错误（`WRONG_KEY`）不会保存。

**验证**：连接后出现 `joining TP-LINK_20DE-5G again, as it was kept`，随后 `wlan0 has 192.168.0.180 ...`；重启后无需再输入密码。

### 31. 测试 WLAN 时不要把 USB 弄丢

**根因**：直接执行 `/system/bin/recovery wlan --config ...` 时，程序按 `argv[0]` 判断自己是 `recovery`，会忽略子命令、启动**第二个 recovery 实例**。它启动时会把 USB 先切到 `none` 再切 `adb`，导致原实例的 adb/MTP 消失，且两个实例抢 WLAN/supplicant。

**正确做法**：为 CLI 建一个改名的副本/符号链接（如 `/tmp/skyward-cli`），用 `argv[0]` ≠ `recovery` 运行：
```sh
ln -sf /system/bin/recovery /tmp/skyward-cli
/tmp/skyward-cli wlan --config /skyward/device.toml
```

**看输出**：该调试版在 `main()` 开头把 stdout/stderr 重定向到 pstore，并被后台线程覆盖。测试时临时把 pstore 符号链接挪开即可看到输出，结束后恢复：
```sh
mv /dev/block/by-name/pstore /tmp/pstore-link
/tmp/skyward-cli wlan --config /skyward/device.toml; echo RC=$?
mv /tmp/pstore-link /dev/block/by-name/pstore
```

### 27. MTP 一传文件就断：MTU3 的 64K 端点请求上限（已解决）

**现象**：MTP 枚举正常、能列目录；Windows 拖入或拖出文件时提示驱动崩溃/设备消失，一两秒后恢复，操作被取消。Skyward 日志里先是
`mtp: 0x1016 given up: Operation not supported on transport endpoint (os error 95)`，
随后 `mtp: ... Identifier removed (os error 43)` 导致 MTP 线程退出。

**原因**：MT6835 使用 `mtu3` UDC。`mtu3_gadget_queue()` 对 `request->length > GPD_BUF_SIZE`（65532）的请求直接返回 `-EOPNOTSUPP`；而 Skyward 原实现按 1 MiB 分块，Windows 一发数据（SEND_OBJECT/SET_DEVICE_PROP_VALUE）就失败。
第二个坑：FunctionFS 会把 OUT 读缓冲向上对齐到整包。`65532` 不是 512 的倍数，内核会按 65536 入队并超出 MTU3 上限，或在读回时丢掉多出的字节。

**解决**：
1. `skyward-mtp` 的 `CHUNK`/`FILE_CHUNK` 改为 **65024（127×512）**：既 ≤65532，又保持整包对齐。
2. 合并上游 PR #47（`fix(mtp): keep the completions that end early...`）：保留传输期间提前完成的 completion、处理 suspend/resume、`ECONNRESET`。
3. ep0 读写在事务被主机取消时返回 `EIDRM`，这是正常路径；现在映射为 `Control::Cancel`，不再把 MTP 线程打死。

**验证**：Windows 写入 5 MiB、读出 6 MiB，设备侧/主机侧 MD5 均一致，MTP 线程保持运行（`sys.usb.state=mtp,adb`）。无人值守测试脚本：`tools/mtp-test.ps1`。

### 28. 开机静默解密与静默 MTP（已实现）

**需求**：开机不要直接显示解密页；文件传输也不要每次手动打开。

**实现**：
- 配置新增顶层 `auto_decrypt` / `auto_transfer`（`devices/tb365fc.toml`）。
- `auto_decrypt`：`ui::run` 首屏固定 `Home`，`Pages::begin()` 在后台启动 `Decryptor::Job::Open`，同时把 `Data` 置为 `Opening`；解密完成自动 `offer_storage()`。KeyMint 未注册时主流程仍先等待（最多 60 s）。
- `auto_transfer`：`Pages::open()` 强制本次启动打开文件传输并 `Transfer::start()`，随后 `begin()` 把端口切到 `mtp,adb`；开关仍可随时关闭。

**验证镜像**：`out/dec117.img`。日志应出现：
`skyward: run auto_decrypt true starting on Home`、`opening the data partition behind the pages`，随后 `mtp: the computer opened a session`。

### 33. 恢复失败：忙挂载与坏 pax 记录（已解决）

**症状 1**：恢复在写入前失败：`take the slot's partitions off before writing over them: unmount /mnt/system_ext: Device or resource busy (os error 16)`，界面显示“未写入任何内容”。init 启动的 HAL/服务占用 `system_ext`，而 Skyward 的 busy 列表只覆盖配置内的程序。

**修复 1**：`skyward-vab::release_partitions` 在普通 umount 返回 EBUSY 时降级为 `umount_detach_over`（lazy detach），设备保持映射、恢复继续；非 EBUSY 错误照常上报。

**症状 2**：data 恢复报 `restore the data partition's files: read what the archive holds of ai: malformed pax extension`。备份 tar 中 `/data/ai` 的某条 xattr 值含换行，tar-rs 的 pax 读取按换行切分，整条恢复中止，media 因此没有轮到。

**修复 2**：恢复时坏 pax 记录只跳过该条元数据，文件内容继续解包（旧备份也能恢复）；打包时跳过含换行的 xattr，避免再生成这种记录。media 的备份/恢复会跳过 `*/Skyward`，不会覆盖备份自身。

**验证**：`out/dec117.img` 全分区恢复完成，日志 `restored data`、`restored media`、`backup restored, all but []`，界面显示“恢复完成”。


## 致谢

- [kirklin/skyward](https://github.com/kirklin/skyward)：Skyward 本体
- [BkaNeko/xaga-skyward](https://github.com/BkaNeko/xaga-skyward)：MTK / vendor_boot / 竖屏 / 驱动适配参考
- [酷安@黑橘火龙果的移植经验](https://www.coolapk.com/feed/75132513?s=ODQxYjkxOWQxZmQwMzhnNmIwOWUyYmF6a1591)：realme X7 Pro 至尊版与 Skyward 上游 PR #83（黑屏排查思路）

本仓库为非官方移植项目，刷机有风险，请自行备份并确认机型与固件匹配。
