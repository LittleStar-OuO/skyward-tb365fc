const fs = require('fs');
const path = require('path');

const root = process.cwd();
let initSrc = fs.readFileSync(path.join(root, 'work/init.rc.dec'), 'utf8');

const teeiArgs = [
  '-r', '020b0000000000000000000000000000',
  '-r', '020f0000000000000000000000000000',
  '-r', '06090000000000000000000000000000',
  '-r', '05120000000000000000000000000000',
  '-r', '40188311faf343488db888ad39496f9a',
  '-r', '07060000000000000000000000007169',
  '-r', '4be4f7dc1f2c11e5b5f7727283247c7f',
  '-r', '9073f03a9618383bb1856eb3f990babd',
  '-r', '08050000000000000000000000003419',
  '-r', '5020170115e016302017012521300000',
  '-r', '0f5eed3c3b5a47afacca69a84bf0efad',
  '-r', '07407000000000000000000000000000',
  '-r', '05160000000000000000000000000000',
  '-r', '91dba524a6e24909acc48abd7163121a',
  '-r', '08070000000000000000000000008270',
  '-r', '09080000000000000000000000009381',
  '-t', '08030000000000000000000000000000',
  '-t', '85f630e0f0964c5fa2cc268ce04e3da3',
  '-t', '98fb95bcb4bf42d26473eae48690d7ea',
  '-t', '7b66512021214487ba710a51d7ea78fe',
  '-t', '09010000000000000000000000000000',
];
const teeiPairs = [];
for (let i = 0; i < teeiArgs.length; i += 2) teeiPairs.push(`    ${teeiArgs[i]} ${teeiArgs[i + 1]}`);
// Keep every line short: init's parser gives a line a limited room, and the
// whole arguments of the daemon on one line come close to it.
const teeiCmd = `service teei_daemon /vendor/bin/teei_daemon \\\n${teeiPairs.join(' \\\n')}`;

const services = ['teei_daemon', 'vendor.keymint-beanpod', 'hwservicemanager', 'vendor.gatekeeper-1-0', 'vendor.boot-1-2'];
const statusTriggers = services
  .map((s) => `on property:init.svc.${s}=running\n    write /tmp/svc-${s} running\non property:init.svc.${s}=stopped\n    write /tmp/svc-${s} stopped\non property:init.svc.${s}=restarting\n    write /tmp/svc-${s} restarting\n`)
  .join('');

const appended = `
# The phone's own key programs are started here, by init, whose policy alone
# lets them run: a recovery service running as the recovery user cannot
# execute them on this phone. Order matters: the TrustZone daemon, then the
# two service directories, then the key services that register with them.
on init
    write /tmp/init-our-init yes

on boot
    write /tmp/init-our-boot yes

${teeiCmd}
    user 1000
    group 1000
    capabilities SYS_RAWIO
on boot
    write /tmp/mk-1 1

service hwservicemanager /mnt/system_ext/bin/hwservicemanager
    user 1000
    group 1000 3009
on boot
    write /tmp/mk-2 1

service vendor.keymint-beanpod /vendor/bin/hw/android.hardware.security.keymint@2.0-service.beanpod
    user 999
    group 999
on boot
    write /tmp/mk-3 1

service vendor.gatekeeper-1-0 /vendor/bin/hw/android.hardware.gatekeeper@1.0-service
    interface android.hardware.gatekeeper@1.0::IGatekeeper default
    user 1000
    group 1000
on boot
    write /tmp/mk-4 1

service vendor.boot-1-2 /mnt/system_ext/bin/android.hardware.boot@1.2-service
    user 0
    group 0
on boot
    write /tmp/mk-5 1

on boot
    write /tmp/init-our-boot yes
    chown system system /dev/teei_client
    chmod 0660 /dev/teei_client
    chown system system /dev/teei_config
    chmod 0660 /dev/teei_config
    chown system system /dev/tz_vfs
    chmod 0660 /dev/tz_vfs
    chown system drmrpc /dev/isee_tee0
    chmod 0666 /dev/isee_tee0
    chown system system /dev/0:0:0:49476
    chmod 0660 /dev/0:0:0:49476
    chown system system /dev/rpmb0
    chmod 0660 /dev/rpmb0
    setprop hwservicemanager.disabled false


# The key services start once the recovery has mounted the partitions that
# hold their programs: it says so through this property.
on property:skyward.keys=1
    setprop hwservicemanager.disabled false
    start teei_daemon
    start hwservicemanager
    start vendor.keymint-beanpod
    start vendor.gatekeeper-1-0
    start vendor.boot-1-2

${statusTriggers}`;

fs.writeFileSync(path.join(root, 'work/init.rc.dec2'), initSrc + appended);
console.log('wrote work/init.rc.dec2');

// Remove the service blocks from the device config: init starts them now.
const cfgPath = path.join(root, 'xaga-skyward/devices/tb365fc.toml');
let cfg = fs.readFileSync(cfgPath, 'utf8');
const start = cfg.indexOf('# The directory the phone\'s own programs register with');
const end = cfg.indexOf('# The nodes the TEE\'s programs open');
if (start >= 0 && end > start) {
  cfg = cfg.slice(0, start) + cfg.slice(end);
  fs.writeFileSync(cfgPath, cfg);
  console.log('removed service blocks from devices/tb365fc.toml');
} else {
  console.log('service blocks already removed');
}

// Debug main: pstore logging, its log mirror, service states, KeyMint probe.
let main = fs.readFileSync(path.join(root, 'xaga-skyward/crates/skyward/src/main.rs'), 'utf8');
const servicesList = JSON.stringify(services);
const probe = [
  '        std::thread::spawn(|| {',
  '            std::thread::sleep(std::time::Duration::from_secs(20));',
  '            // The kernel buffer as it stands once the recovery is up: what the',
  '            // TEE drivers and init said of themselves while it came up.',
  '            let mut buf = vec![0u8; 1024 * 1024];',
  '            let n = unsafe { libc::syscall(libc::SYS_syslog, 3, buf.as_mut_ptr(), buf.len() as libc::c_int) };',
  '            let text = if n > 0 { String::from_utf8_lossy(&buf[..n as usize]).into_owned() } else { format!("syslog read_all: {}", std::io::Error::last_os_error()) };',
  '            if let Ok(mut o) = std::fs::OpenOptions::new().write(true).custom_flags(libc::O_SYNC).open("/dev/block/by-name/pstore") {',
  '                use std::io::{Seek, Write};',
  '                let _ = o.seek(std::io::SeekFrom::Start(3145728));',
  '                let _ = o.write_all(text.as_bytes());',
  '            }',
  '            eprintln!("PROBE syslog: {n} bytes");',
  '            match skyward_binder::driver::Binder::open() {',
  '                Ok(binder) => match skyward_crypto::keymint::KeyMint::open(&binder) {',
  '                    Ok(_) => eprintln!("PROBE keymint: open ok"),',
  '                    Err(e) => eprintln!("PROBE keymint: {e:#}"),',
  '                },',
  '                Err(e) => eprintln!("PROBE binder: {e:#}"),',
  '            }',
  '            match skyward_binder::driver::Binder::hardware() {',
  '                Ok(_) => eprintln!("PROBE hwbinder: open ok"),',
  '                Err(e) => eprintln!("PROBE hwbinder: {e:#}"),',
  '            }',
  '        });',
].join('\n');
const block = `fn main() -> Result<()> {
    #[cfg(target_os = "android")]
    unsafe {
        use std::io::Seek;
        use std::os::unix::fs::OpenOptionsExt;
        use std::os::unix::io::AsRawFd;
        // Clear the regions this debug build mirrors into; a block device
        // keeps what an earlier boot wrote past the end of a shorter log.
        if let Ok(mut f) = std::fs::OpenOptions::new().write(true).custom_flags(libc::O_SYNC).open("/dev/block/by-name/pstore") {
            use std::io::Write;
            let _ = f.seek(std::io::SeekFrom::Start(4096));
            libc::dup2(f.as_raw_fd(), 1);
            libc::dup2(f.as_raw_fd(), 2);
            let zeros = vec![0u8; 1024 * 1024];
            let _ = f.seek(std::io::SeekFrom::Start(1048576));
            let _ = f.write_all(&zeros);
        }
        // Files init writes its service states into are made here first, under
        // the recovery's own label, so that the recovery may read them back.
        for name in ${servicesList} {
            let _ = std::fs::write(format!("/tmp/svc-{name}"), b"");
        }
        std::thread::spawn(|| loop {
            std::thread::sleep(std::time::Duration::from_secs(5));
            let names: [&str; 5] = ${servicesList};
            let mut said = String::new();
            let marker = std::fs::read_to_string("/tmp/init-our-boot").map(|s| s.trim().to_string()).ok();
            let init_marker = std::fs::read_to_string("/tmp/init-our-init").map(|s| s.trim().to_string()).ok();
            said.push_str(&format!("init-marker={init_marker:?} boot-marker={marker:?}\\n"));
            for name in names {
                let state = std::fs::read_to_string(format!("/tmp/svc-{name}")).map(|s| s.trim().to_string()).ok();
                let prop = skyward_sys::prop(&format!("init.svc.{name}"));
                said.push_str(&format!("{name}: file={state:?} prop={prop:?}\\n"));
            }
            if let Ok(mut f) = std::fs::OpenOptions::new().write(true).custom_flags(libc::O_SYNC).open("/dev/block/by-name/pstore") {
                use std::io::Write;
                let _ = f.seek(std::io::SeekFrom::Start(2097152));
                let _ = f.write_all(said.as_bytes());
            }
            let Ok(text) = std::fs::read("/tmp/skyward/recovery.log") else { continue };
            let start = text.len().saturating_sub(200 * 1024);
            if let Ok(mut f) = std::fs::OpenOptions::new().write(true).custom_flags(libc::O_SYNC).open("/dev/block/by-name/pstore") {
                use std::io::Write;
                let _ = f.seek(std::io::SeekFrom::Start(1048576));
                let _ = f.write_all(&text[start..]);
            }
        });
${probe}
        eprintln!("skyward: start (dec debug)");
    }`;
main = main.replace('fn main() -> Result<()> {', block);
fs.writeFileSync(path.join(root, 'work/main_debug.rs'), main);
console.log('wrote work/main_debug.rs with service states and KeyMint probe');
