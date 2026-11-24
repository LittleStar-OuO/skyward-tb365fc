use anyhow::{bail, Context, Result};
use skyward_bootimg::{Ramdisk, VendorBootImage};
use std::fs;
use std::path::Path;

fn argval(s: &str) -> (String, String) {
    let (a, b) = s.split_once('=').expect("NAME=VALUE");
    (a.to_string(), b.to_string())
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() < 2 {
        bail!("usage: ramdisk-x <in> <out> [--props] [--replace NAME=PATH] [--add NAME=PATH] [--addx NAME=PATH] [--link NAME=TARGET]...");
    }
    let (input, out) = (&args[0], &args[1]);
    let img = VendorBootImage::read(Path::new(input))?;
    let mut rd = Ramdisk::decode(&img.ramdisk)?;
    let mut i = 2;
    while i < args.len() {
        match args[i].as_str() {
            "--props-fixed" => {
                let props = rd.find("prop.default").context("no prop.default")?.data.clone();
                const KEYS: [&str; 7] = [
                    "ro.build.version.release",
                    "ro.build.version.security_patch",
                    "ro.vendor.build.security_patch",
                    "ro.secure",
                    "ro.adb.secure",
                    "ro.debuggable",
                    "ro.ota.allow_downgrade",
                ];
                let mut kept = Vec::new();
                for line in props.split_inclusive(|b| *b == b'\n') {
                    let key = line.split(|b| *b == b'=').next().unwrap_or_default();
                    if !KEYS.iter().any(|k| k.as_bytes() == key) {
                        kept.extend_from_slice(line);
                    }
                }
                kept.extend_from_slice(
                    b"\nro.secure=0\nro.adb.secure=0\nro.debuggable=1\nro.ota.allow_downgrade=true\n",
                );
                rd.replace("prop.default", kept)?;
                i += 1;
            }
            "--props" | "--props-add" | "--props-remove" => {
                let mode = args[i].as_str();
                let props = rd.find("prop.default").context("no prop.default")?.data.clone();
                const KEYS: [&str; 3] = [
                    "ro.build.version.release",
                    "ro.build.version.security_patch",
                    "ro.vendor.build.security_patch",
                ];
                let mut kept = Vec::new();
                for line in props.split_inclusive(|b| *b == b'\n') {
                    let key = line.split(|b| *b == b'=').next().unwrap_or_default();
                    if mode == "--props-add" || !KEYS.iter().any(|k| k.as_bytes() == key) {
                        kept.extend_from_slice(line);
                    }
                }
                if mode != "--props-remove" {
                    kept.extend_from_slice(
                        b"\nro.secure=0\nro.adb.secure=0\nro.debuggable=1\nro.ota.allow_downgrade=true\n",
                    );
                }
                rd.replace("prop.default", kept)?;
                i += 1;
            }
            "--props-append" => {
                let mut props = rd.find("prop.default").context("no prop.default")?.data.clone();
                props.extend_from_slice(&fs::read(&args[i + 1]).with_context(|| format!("read {}", args[i + 1]))?);
                rd.replace("prop.default", props)?;
                i += 2;
            }
            "--replace" => {
                let (n, p) = argval(&args[i + 1]);
                rd.replace(&n, fs::read(&p).with_context(|| format!("read {p}"))?)?;
                i += 2;
            }
            "--add" => {
                let (n, p) = argval(&args[i + 1]);
                rd.add(&n, 0o644, fs::read(&p).with_context(|| format!("read {p}"))?)?;
                i += 2;
            }
            "--addx" => {
                let (n, p) = argval(&args[i + 1]);
                rd.add(&n, 0o755, fs::read(&p).with_context(|| format!("read {p}"))?)?;
                i += 2;
            }
            "--link" => {
                let (n, t) = argval(&args[i + 1]);
                rd.link(&n, &t)?;
                i += 2;
            }
            other => bail!("unknown op {other}"),
        }
    }
    let out_img = img.with_ramdisk(rd.encode()?)?;
    fs::write(out, out_img.to_bytes()?).with_context(|| format!("write {out}"))?;
    println!("wrote {out}");
    Ok(())
}
