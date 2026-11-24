//! The functions the USB port offers, which init sets up as
//! `sys.usb.config` asks: adb while the recovery waits, with files over MTP
//! beside it while file transfer is on.

use crate::{prop, set_prop, wait_prop};
use anyhow::{ensure, Result};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

static MTP: AtomicBool = AtomicBool::new(false);

/// What the port offers while nothing else has it.
pub fn resting() -> &'static str {
    if MTP.load(Ordering::Relaxed) {
        "mtp,adb"
    } else {
        "adb"
    }
}

/// Whether MTP goes beside adb while the port rests: from when its function
/// has its descriptors until it goes.
pub fn set_mtp(on: bool) {
    MTP.store(on, Ordering::Relaxed);
}

/// Ask init for `config` and wait until it is in place. Going to "none"
/// also waits for adbd to be gone, so its function is free.
pub fn set(config: &str, timeout: Duration) -> Result<()> {
    set_prop("sys.usb.config", config)?;
    if let Err(e) = wait_prop("sys.usb.state", config, timeout) {
        // The port goes to what was asked of it only once every program
        // behind the functions has said it is ready; which of them has not
        // is what the phone cannot say for itself.
        let said = ["sys.usb.state", "sys.usb.ffs.ready", "sys.usb.ffs.mtp.ready", "init.svc.adbd"]
            .map(|name| format!("{name}={:?}", prop(name)))
            .join(" ");
        let _ = crate::kmsg(&format!("{config} was asked of the port, and after {} ms: {said}", timeout.as_millis()));
        return Err(e);
    }
    if config == "none" {
        let start = Instant::now();
        while !matches!(prop("init.svc.adbd").as_deref(), None | Some("stopped")) {
            ensure!(start.elapsed() < timeout, "adbd still runs {} ms after the port went to none", timeout.as_millis());
            thread::sleep(Duration::from_millis(10));
        }
    }
    Ok(())
}

/// Hand the port to `config` through "none", which stops the programs
/// serving it and takes every function off; init then sets the port up
/// once the programs behind the new configuration are ready.
///
/// File transfer comes and goes beside adb without that, and adbd need not
/// be stopped for it: the configuration rules take the old function links
/// off and put the new ones back as the port is rebound (see mtp.rc), so a
/// recovery whose adbd will not come back after a stop keeps its adb.
pub fn switch(config: &str, timeout: Duration) -> Result<()> {
    if matches!((prop("sys.usb.state").as_deref(), config), (Some("adb"), "mtp,adb" | "sideload") | (Some("mtp,adb" | "sideload"), "adb")) {
        return set(config, timeout);
    }
    set("none", timeout)?;
    match set(config, timeout) {
        Ok(()) => Ok(()),
        Err(e) => {
            // A port left at nothing has no adb either, so the phone cannot
            // be reached to say why it is that way; adb alone is asked for
            // again, and the reason is still the caller's to say.
            let _ = set("adb", timeout);
            Err(e)
        }
    }
}
