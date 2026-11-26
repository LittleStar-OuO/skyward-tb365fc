//! The functions the USB port offers. The recovery's own init binds adb
//! once at boot; the recovery service leaves the port as it is, since
//! asking init for another configuration is what leaves adb gone on some
//! boots.

use anyhow::Result;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

static MTP: AtomicBool = AtomicBool::new(false);

/// What the port offers while nothing else has it.
pub fn resting() -> &'static str {
    if MTP.load(Ordering::Relaxed) {
        "mtp,adb"
    } else {
        "adb"
    }
}

/// Whether MTP goes beside adb while the port rests.
pub fn set_mtp(on: bool) {
    MTP.store(on, Ordering::Relaxed);
}

/// The port is left as the recovery's own init set it up.
pub fn set(_config: &str, _timeout: Duration) -> Result<()> {
    Ok(())
}

/// Same: handing the port through "none" is what used to lose adb.
pub fn switch(_config: &str, _timeout: Duration) -> Result<()> {
    Ok(())
}
