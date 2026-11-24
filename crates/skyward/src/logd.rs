//! Starting the phone's log daemon where its own recovery starts one that
//! stops at what a recovery has not: init starts it as the logd account,
//! and the daemon sets its own scheduling cgroup as it starts, which only
//! root may write.
//!
//! init hands it three sockets it made; one it made here is bound the same
//! way, and the daemon is told of it the way init tells it, then run as
//! root, as nothing in a recovery runs as anyone else.

use anyhow::{Context, Result};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::{Child, Command as Process};

/// The sockets init makes for logd, and the mode it gives each: the one the
/// daemon listens on, the one readers read, and the one programs write to,
/// which the daemon is passed the credentials of their writers through.
const SOCKETS: [(&str, i32, u32, bool); 3] = [
    ("logd", libc::SOCK_STREAM, 0o666, false),
    ("logdr", libc::SOCK_SEQPACKET, 0o666, false),
    ("logdw", libc::SOCK_DGRAM, 0o222, true),
];

/// Where the sockets are made.
const SOCKETS_DIR: &str = "/dev/socket";

/// The program the phone's recovery carries, and the folder its libraries
/// are in.
const PROGRAM: &str = "/system/bin/logd";
const ROOT: &str = "/system";

/// The log daemon running, which is kept for as long as the recovery runs.
pub struct Logd {
    child: Child,
    /// The sockets, held open: a socket with no descriptor open would be
    /// gone from every program that writes to it. They outlive the daemon
    /// itself, so that one started again is reached by the same ones.
    _sockets: Vec<OwnedFd>,
    /// What init tells the daemon of those sockets.
    env: Vec<(String, String)>,
}

impl Logd {
    /// Make the sockets init would have made and start the daemon on them.
    pub fn start() -> Result<Logd> {
        let folder = Path::new(SOCKETS_DIR);
        std::fs::create_dir_all(folder).with_context(|| format!("make {}", folder.display()))?;
        let mut sockets = Vec::new();
        let mut names = Vec::new();
        for (name, kind, mode, credentials) in SOCKETS {
            let path = folder.join(name);
            // One an earlier run left answers nothing.
            let _ = std::fs::remove_file(&path);
            let socket = bind(&path, kind).with_context(|| format!("make {}", path.display()))?;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode))
                .with_context(|| format!("give {} the mode {mode:o}", path.display()))?;
            if credentials {
                let one: libc::c_int = 1;
                if unsafe { libc::setsockopt(socket.as_raw_fd(), libc::SOL_SOCKET, libc::SO_PASSCRED, (&one as *const libc::c_int).cast(), std::mem::size_of_val(&one) as libc::socklen_t) } != 0 {
                    return Err(std::io::Error::last_os_error()).with_context(|| format!("have {} take credentials", path.display()));
                }
            }
            sockets.push(socket);
            names.push(format!("ANDROID_SOCKET_{name}={}", sockets.last().expect("just made").as_raw_fd()));
        }
        let env: Vec<(String, String)> = names
            .into_iter()
            .map(|pair| pair.split_once('=').map(|(k, v)| (k.to_string(), v.to_string())).expect("each holds a name"))
            .collect();
        let child = start(&env)?;
        Ok(Logd { child, _sockets: sockets, env })
    }

    /// Start the daemon again where it has ended: init does as much for the
    /// one it starts, and a daemon nothing restarts takes the phone's own
    /// programs' logs with it for the rest of the boot. What ended it is said
    /// in the kernel log.
    pub fn still_running(&mut self) -> Result<()> {
        let Some(status) = self.child.try_wait().context("look at the log daemon")? else { return Ok(()) };
        skyward_sys::kmsg(&format!("logd ended ({status}); starting it again"))?;
        self.child = start(&self.env)?;
        Ok(())
    }
}

/// Run the daemon on the sockets the environment names, and see that it is
/// still there once it has had a moment to fail in.
fn start(env: &[(String, String)]) -> Result<Child> {
    let mut child = Process::new(PROGRAM)
        .env("ANDROID_ROOT", ROOT)
        .envs(env.iter().map(|(name, value)| (name.as_str(), value.as_str())))
        .spawn()
        .with_context(|| format!("start {PROGRAM}"))?;
    std::thread::sleep(std::time::Duration::from_millis(200));
    if let Some(status) = child.try_wait().context("look at the log daemon")? {
        anyhow::bail!("the log daemon ended as it started: {status}");
    }
    Ok(child)
}

/// A socket of `kind` bound at `path`, as init binds the ones it hands on.
fn bind(path: &Path, kind: i32) -> Result<OwnedFd> {
    use std::os::unix::ffi::OsStrExt;
    let fd = unsafe { libc::socket(libc::AF_UNIX, kind, 0) };
    if fd < 0 {
        return Err(std::io::Error::last_os_error()).context("make a socket");
    }
    let socket = unsafe { OwnedFd::from_raw_fd(fd) };
    let mut address: libc::sockaddr_un = unsafe { std::mem::zeroed() };
    address.sun_family = libc::AF_UNIX as libc::sa_family_t;
    let bytes = path.as_os_str().as_bytes();
    anyhow::ensure!(bytes.len() < address.sun_path.len(), "{} is too long for a socket", path.display());
    for (to, from) in address.sun_path.iter_mut().zip(bytes) {
        *to = *from as libc::c_char;
    }
    let length = (std::mem::size_of::<libc::sa_family_t>() + bytes.len() + 1) as libc::socklen_t;
    if unsafe { libc::bind(socket.as_raw_fd(), (&address as *const libc::sockaddr_un).cast(), length) } != 0 {
        return Err(std::io::Error::last_os_error()).with_context(|| format!("bind {}", path.display()));
    }
    Ok(socket)
}
