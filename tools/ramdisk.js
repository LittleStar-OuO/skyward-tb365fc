// LZ4 frame + cpio newc lister, used to inspect Android boot/init_boot ramdisks.
const fs = require('fs');

function lz4BlockDecompress(src, dstSize) {
  const dst = Buffer.alloc(dstSize);
  let si = 0, di = 0;
  while (si < src.length) {
    const token = src[si++];
    let litLen = token >> 4;
    if (litLen === 15) {
      let b;
      do { b = src[si++]; litLen += b; } while (b === 255);
    }
    src.copy(dst, di, si, si + litLen);
    si += litLen; di += litLen;
    if (si >= src.length) break;
    const off = src[si] | (src[si + 1] << 8); si += 2;
    let matchLen = token & 15;
    if (matchLen === 15) {
      let b;
      do { b = src[si++]; matchLen += b; } while (b === 255);
    }
    matchLen += 4;
    let mp = di - off;
    for (let i = 0; i < matchLen; i++) dst[di++] = dst[mp++];
  }
  return dst.subarray(0, di);
}

function lz4LegacyDecompress(buf) {
  let p = 4;
  const chunks = [];
  while (p + 4 <= buf.length) {
    const sz = buf.readUInt32LE(p); p += 4;
    if (sz === 0) break;
    const block = buf.subarray(p, p + sz); p += sz;
    chunks.push(lz4BlockDecompress(block, 8 * 1024 * 1024 + 65536));
  }
  return Buffer.concat(chunks);
}

function lz4FrameDecompress(buf) {
  const magic = buf.readUInt32LE(0);
  if (magic === 0x184C2102) return lz4LegacyDecompress(buf);
  if (magic !== 0x184D2204) throw new Error('not lz4 frame: ' + magic.toString(16));
  const flg = buf[4], bd = buf[5];
  let p = 6;
  if (flg & 0x08) p += 8; // content size
  if (flg & 0x01) p += 4; // dict id
  p += 1; // header checksum
  const blockChecksum = (flg >> 4) & 1;
  const contentChecksum = (flg >> 2) & 1;
  const chunks = [];
  for (;;) {
    if (p + 4 > buf.length) break;
    const sz = buf.readUInt32LE(p); p += 4;
    if (sz === 0) break;
    const uncompressed = (sz & 0x80000000) !== 0;
    const len = sz & 0x7fffffff;
    const block = buf.subarray(p, p + len); p += len;
    chunks.push(uncompressed ? block : lz4BlockDecompress(block, Math.max(len * 8, 1 << 20)));
    if (blockChecksum) p += 4;
  }
  if (contentChecksum) p += 4;
  return Buffer.concat(chunks);
}

function parseCpio(buf, wantExtractDir) {
  let p = 0;
  const entries = [];
  while (p + 110 <= buf.length) {
    const magic = buf.toString('latin1', p, p + 6);
    if (magic !== '070701' && magic !== '070702') break;
    const hex = (o, n) => parseInt(buf.toString('latin1', p + o, p + o + n), 16);
    const ino = hex(6, 8), mode = hex(14, 8), filesize = hex(54, 8), namesize = hex(94, 8);
    const name = buf.toString('utf8', p + 110, p + 110 + namesize - 1);
    p += 110 + namesize;
    p = (p + 3) & ~3;
    const data = buf.subarray(p, p + filesize);
    p += filesize;
    p = (p + 3) & ~3;
    entries.push({ name, mode, size: filesize, data });
    if (name === 'TRAILER!!!') break;
  }
  return entries;
}

const [file, mode, outDir] = process.argv.slice(2);
let data = fs.readFileSync(file);
let start = 0;
if (file.endsWith('.img')) {
  start = 4096; // header is page aligned; ramdisk follows
  const hdr = data.readUInt32LE(40);
  if (data.toString('latin1', 0, 8) === 'VNDRBOOT') start = 4096;
  const magic = data.readUInt32LE(start);
  if (magic === 0x184D2204 || magic === 0x184C2102) data = lz4FrameDecompress(data.subarray(start));
  else if (data[start] === 0x1f && data[start + 1] === 0x8b) {
    data = require('zlib').gunzipSync(data.subarray(start));
  } else data = data.subarray(start);
}
const entries = parseCpio(data);
for (const e of entries) {
  const isDir = (e.mode & 0o170000) === 0o040000;
  if (mode === 'list') console.log((isDir ? 'd' : '-') + ' ' + String(e.size).padStart(8) + ' ' + e.name);
  else if (mode === 'extract' && outDir && e.name !== 'TRAILER!!!') {
    const dest = require('path').join(outDir, e.name);
    if (isDir) fs.mkdirSync(dest, { recursive: true });
    else { fs.mkdirSync(require('path').dirname(dest), { recursive: true }); fs.writeFileSync(dest, e.data); }
  }
}
if (mode === 'list') console.error('total entries:', entries.length);
