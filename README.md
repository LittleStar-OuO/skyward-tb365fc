# Skyward for Lenovo Xiaoxin Pad 12.1 2025 (TB365FC)

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
| 设备信息卡片 | √ | 部分字段因 SELinux 限制降级显示 |
| 重启到系统 / recovery | √ | `adb reboot` / `adb reboot recovery` 往返验证 |
| 正常 Android 启动不受影响 | √ | 刷着本 recovery 的 vendor_boot 时系统可正常启动 |
| 安装（zip / 分区镜像） | × | 尚未验证 |
| 备份 / 恢复 | × | 尚未验证 |
| 双系统 | × | 尚未验证 |
| MTP（连接电脑） | √ | 开机自动后台启动（`auto_transfer`），Windows 可直接拖入/拖出；双向大文件按 MD5 校验一致。MTU3 单请求上限 65532 字节，MTP 块取 512 对齐的 65024 字节 |
| recovery 内 `adb shell` | √ | adbd 以 `su` 域运行，root shell 可用 |
| recovery 内 adb root | √ | debug policy 下 adbd/su/shell 为 permissive，`adb shell id` 为 root |
| /data 解密（FBE） | √ | 开机后台静默解密（`auto_decrypt`），首屏保持主页；Beanpod TEE + KeyMint 2.0 (AIDL) + HIDL gatekeeper，metadata 与 FBE 解开后 /data 挂载为 dm-9 (f2fs rw) |
| WiFi | √ | 开机自动上电（wmt_loader/wmt_launcher/wlan_assistant + `wlan0`），连接成功后的网络保存在 persist，重启自动连回；扫描/连接/ DHCP 已验证 |
| 振动 | × | 未配置（MTK regulator-vibrator 无共振频率节点） |
| 在线更新 Skyward | × | 未配置发布仓库 |
| 侧键/电源键导航 | 未测 | 触摸已可用 |

图例：√ 已验证可用；× 未完成/不可用；未测 = 尚未在真机验证。

## 与原版的主要差异

本机 recovery 的 SELinux 策略比小米机型严格得多，直接运行 Skyward 会在多个点被拒绝。本仓库包含以下适配（均为通用、失败降级式改动）：

1. **无 recovery 分区**：打包 vendor_boot（VNDRBOOT v4）而不是 recovery 分区；`device.recovery_partition = "vendor_boot"`。
2. **运行目录改到 /tmp**：原版在 `/skyward/run` 建目录，rootfs 写入被 SELinux 拒绝；改为 `/tmp/skyward`（含 UI 日志/截图、WLAN、安装日志路径）。
3. **信息采集容错**：`/proc/meminfo`、`/proc/cpuinfo` 等读取被拒时使用空值，不再中断 UI 启动。
4. **uevent 监听容错**：netlink socket 被拒时跳过事件监听，界面照常刷新。
5. **`/sys/power/mem_sleep` 写入容错**：被拒时休眠线程按“被拒绝”处理，不退出。
6. **属性追加策略**：原厂 `prop.default` 已两次定义 `ro.secure/ro.adb.secure/ro.debuggable`，本机 init 拒绝再次定义；新增配置项 `device.adb_root`（默认 true），本机设为 `false`，保留原厂值。
7. **新设备配置** `devices/tb365fc.toml`：显示 1600×2560/320dpi、90Hz 不强制、`modules.sources=["vendor_boot","vendor_dlkm","vendor"]`、挂载 `persist`/`metadata`、MTK EFS 备份项等。
8. **MTP 绑定修复**：切到 `mtp,adb` 时先解绑 UDC 并清掉 configfs 里 adb 占用的 `f1`，再重新绑定双功能；返回 adb 时同样清理并重新绑定。xaga fork 原实现跳过 `none`，导致 MTP symlink 冲突而只有 ADB。另删除了重复的 adb 绑定 action（曾造成 gadget 反复重绑、USB 消失），并由 `auto_transfer` 在开机后自动启动。
9. **MTU3 传输块上限**：MediaTek MTU3 对超过 65532 字节的端点请求返回 `-EOPNOTSUPP`，而 FunctionFS 会把读缓冲向上对齐到整包，因此 MTP 块大小取 65024（127×512）。否则 Windows 一开始传输文件就会因请求失败而重置设备。
10. **调试/打包工具** `tools/` 与 `crates/skyward-pack/src/bin/ramdisk-x.rs`：用于检查/修改 vendor_boot ramdisk（非打包必需）。`tools/mtp-test.ps1` 可在 Windows 上无人值守地测 MTP 写入/读出；`tools/pack_tb365fc.sh` 把解密、USB/crypto 包装、VNDK 库与 AVB 尾部一次性打进镜像。
11. **WiFi 上电链**：MT6835 的 connac1x 由 `wmt_loader` → `wmt_launcher` → `wlan_assistant` 启动（不是 `conninfra_loader`）；`wmt_drv`/`connfem` 由 `[modules].load` 在开机时加载，`wlan_drv_gen4m_6835` 在 WLAN 拉起时加载，NVRAM 从只读挂载的 nvdata 读取。
12. **WiFi VNDK 库**：supplicant 依赖的 `libnl.so`、`libssl.so`、`libcrypto.so`、`android.hardware.wifi.supplicant-V1-ndk.so` 在 recovery 未挂载的 VNDK v33 APEX 里，已提取进 ramdisk 的 `/system/lib64/vndk33/`；`android.hardware.wifi.supplicant.ISupplicant/default` 必须写进镜像的 framework VINTF（servicemanager 只在启动时读 VINTF）。
13. **WiFi 凭据持久化**：连接成功（supplicant 已协商密钥）后写入 `/mnt/vendor/persist/skyward/wifi/`（0600）；`auto_join = true` 在开机时自动重连，`prewarm = false` 把校准放在后台 WLAN 线程里，不阻塞界面。密码为明文保存（仅 recovery root 可读），这是 recovery 环境下的取舍。

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

当前已验证镜像（显示/触摸/adb/解密；MTP 暂关）：

| 文件 | SHA-256 |
| --- | --- |
| `skyward-tb365fc-mtp2.img` | `b3b21b309eb129ff299cc564dcb98ce3c7561746360138c448acdc45e87f7234` |

## 刷入 / 回滚

前置：bootloader 已解锁；仅操作**槽 a**（出厂包未写入槽 b）。

```sh
adb reboot bootloader
fastboot --disable-verification flash vbmeta_a vbmeta.img
fastboot flash vendor_boot_a skyward-tb365fc.img
fastboot reboot-recovery
```

进入方式：`adb reboot recovery`（系统内），或 fastboot 的 `fastboot reboot-recovery`。

回滚：

```sh
fastboot flash vendor_boot_a vendor_boot_stock.img
fastboot flash vbmeta_a vbmeta_stock.img
```

必要时用 SP Flash Tool + 原厂完整包恢复（Download Only，勿 Format All）。`misc` 分区若残留 `boot-recovery`，可刷入 512 KiB 全零镜像清除。

## 已知问题

- **recovery 内 adb shell 不可用**：adbd 设置 shell 子进程 SELinux 上下文失败（策略无 shell 域）。ADB 接口可见，但 `adb shell` 会触发 adbd 崩溃。可使用 Skyward 内置终端。
- **MTP 存储浏览需先解密 /data**：MTP 设备已能枚举；内部存储（/sdcard）在 /data 解密后才可浏览。
- **adb root 被禁用**：本机 init 对重复/覆盖只读属性敏感，`adb_root = false` 保留原厂属性。
- 未包含 /data 解密、WiFi、振动、双系统适配（见状态表）。
- vendor_boot 的 vendor ramdisk 同时用于正常启动；本适配已使其不影响系统启动，但请保留原厂镜像以便回滚。

## 目录

```
crates/                  Skyward 源码（含本适配改动）
devices/tb365fc.toml     本机设备配置
resources/fonts/         UI 字体
tools/                   辅助脚本（ramdisk 解析/打包校验/WSL 构建）
README.upstream*.md      上游说明（备份）
```

## 致谢

- [kirklin/skyward](https://github.com/kirklin/skyward)：Skyward 本体
- [BkaNeko/xaga-skyward](https://github.com/BkaNeko/xaga-skyward)：MTK / vendor_boot / 竖屏 / 驱动适配参考
- 酷安移植经验（realme X7 Pro 至尊版）与 Skyward 上游 PR #83（黑屏排查思路）

本移植为非官方个人项目，与联想、小米及原作者无关。刷机有风险，请自行备份并确认机型与固件匹配。
