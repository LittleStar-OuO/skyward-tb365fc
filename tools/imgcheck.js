// Validates a packed vendor_boot image against the stock one it was built on.
// Usage: node tools/imgcheck.js <packed.img> <stock.img>
const fs = require('fs');

function lz4BlockDecompress(src, dstSize) {
  const dst = Buffer.alloc(dstSize);
  let si = 0, di = 0;
  while (si < src.length) {
    const token = src[si++];
    let litLen = token >> 4;
    if (litLen === 15) { let b; do { b = src[si++]; litLen += b; } while (b === 255); }
    src.copy(dst, di, si, si + litLen); si += litLen; di += litLen;
    if (si >= src.length) break;
    const off = src[si] | (src[si + 1] << 8); si += 2;
    let matchLen = token & 15;
    if (matchLen === 15) { let b; do { b = src[si++]; matchLen += b; } while (b === 255); }
    matchLen += 4;
    let mp = di - off;
    for (let i = 0; i < matchLen; i++) dst[di++] = dst[mp++];
  }
  return dst.subarray(0, di);
}

function parseVendor(file) {
  const b = fs.readFileSync(file);
  if (b.toString('latin1', 0, 8) !== 'VNDRBOOT') throw new Error(`${file}: not a vendor boot image`);
  const h = {
    hdrver: b.readUInt32LE(8), page: b.readUInt32LE(12), ramdiskSize: b.readUInt32LE(24),
    hdrSize: b.readUInt32LE(2096), dtbSize: b.readUInt32LE(2100),
    tblSize: b.readUInt32LE(2112), tblNum: b.readUInt32LE(2116), tblEntry: b.readUInt32LE(2120),
    bcSize: b.readUInt32LE(2124),
  };
  const align = (x) => Math.ceil(x / h.page) * h.page;
  const ramdiskPos = align(h.hdrSize);
  const ramdisk = b.subarray(ramdiskPos, ramdiskPos + h.ramdiskSize);
  const dtbPos = align(ramdiskPos + h.ramdiskSize);
  const dtb = b.subarray(dtbPos, dtbPos + h.dtbSize);
  const tblPos = align(dtbPos + h.dtbSize);
  const entries = [];
  for (let i = 0; i < h.tblNum; i++) {
    const o = tblPos + i * h.tblEntry;
    entries.push({ size: b.readUInt32LE(o), offset: b.readUInt32LE(o + 4), kind: b.readUInt32LE(o + 8) });
  }
  const bcPos = align(tblPos + h.tblSize);
  return { b, h, ramdisk, dtb, entries, bootconfig: b.subarray(bcPos, bcPos + h.bcSize), ramdiskPos, dtbPos, tblPos, bcPos };
}

function decompressRamdisk(v) {
  const magic = v.readUInt32LE(0);
  if (magic !== 0x184C2102) throw new Error('ramdisk is not LZ4 legacy framing');
  let p = 4; const chunks = [];
  while (p + 4 <= v.length) {
    const sz = v.readUInt32LE(p); p += 4;
    if (sz === 0) break;
    chunks.push(lz4BlockDecompress(v.subarray(p, p + sz), 8 * 1024 * 1024 + 65536));
    p += sz;
  }
  return Buffer.concat(chunks);
}

function cpioNames(buf) {
  const names = new Map();
  let p = 0;
  while (p + 110 <= buf.length) {
    if (buf.toString('latin1', p, p + 6) !== '070701') break;
    const hex = (o, n) => parseInt(buf.toString('latin1', p + o, p + o + n), 16);
    const mode = hex(14, 8), filesize = hex(54, 8), namesize = hex(94, 8);
    const name = buf.toString('utf8', p + 110, p + 110 + namesize - 1);
    p += 110 + namesize; p = (p + 3) & ~3;
    names.set(name, { mode, size: filesize, data: buf.subarray(p, p + filesize) });
    p += filesize; p = (p + 3) & ~3;
    if (name === 'TRAILER!!!') break;
  }
  return names;
}

const [packedPath, stockPath] = process.argv.slice(2);
const packed = parseVendor(packedPath);
const stock = parseVendor(stockPath);
const failures = [];
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failures.push(msg); };

console.log('header');
ok(packed.h.hdrver === stock.h.hdrver, `header version ${packed.h.hdrver}`);
ok(packed.h.page === stock.h.page, `page size ${packed.h.page}`);
ok(packed.h.tblNum === stock.h.tblNum, `ramdisk table entries ${packed.h.tblNum}`);
ok(packed.entries[0] && packed.entries[0].kind === stock.entries[0].kind, `ramdisk kind ${packed.entries[0]?.kind}`);
ok(packed.entries[0] && packed.entries[0].size === packed.h.ramdiskSize, 'table entry size matches ramdisk size');
ok(packed.b.length === stock.b.length, `image size ${packed.b.length} (stock ${stock.b.length})`);
ok(packed.b.toString('latin1', packed.b.length - 64, packed.b.length - 60) === 'AVBf', 'ends in an AVB footer');
ok(packed.b.subarray(packed.dtbPos, packed.dtbPos + packed.h.dtbSize).equals(stock.b.subarray(stock.dtbPos, stock.dtbPos + stock.h.dtbSize)), 'dtb unchanged');
ok(packed.bootconfig.equals(stock.bootconfig), 'bootconfig unchanged');

console.log('ramdisk');
const cpio = decompressRamdisk(packed.ramdisk);
const entries = cpioNames(cpio);
console.log(`  ${entries.size} entries, ${cpio.length} bytes unpacked`);
const recovery = entries.get('system/bin/recovery');
ok(!!recovery, 'system/bin/recovery present');
if (recovery) ok(recovery.data[0] === 0x7f && recovery.data.toString('latin1', 1, 4) === 'ELF' && recovery.data[18] === 0xb7, 'recovery is a 64-bit little-endian ELF');
ok(entries.has('skyward/device.toml'), 'skyward/device.toml present');
ok(entries.has('skyward/MiSansVF.ttf'), 'skyward/MiSansVF.ttf present');
ok(entries.has('skyward/KirkMono-Regular.ttf'), 'skyward/KirkMono-Regular.ttf present');
for (const cmd of ['7za', 'avbctl', 'resetprop', 'unzip', 'zstd']) {
  const e = entries.get(`system/bin/${cmd}`);
  ok(!!e && (e.mode & 0o170000) === 0o120000 && e.data.toString() === 'recovery', `system/bin/${cmd} links to recovery`);
}
const props = entries.get('prop.default');
ok(!!props && props.data.toString().includes('ro.secure=0') && props.data.toString().includes('ro.debuggable=1'), 'prop.default carries the recovery properties');
if (packedPath !== stockPath && entries.has('skyward/device.toml')) {
  console.log('packed device config:');
  console.log(entries.get('skyward/device.toml').data.toString().split('\n').slice(0, 6).join('\n'));
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
