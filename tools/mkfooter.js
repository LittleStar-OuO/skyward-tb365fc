// Rebuilds an unsigned AVB footer over an image, as skyward-pack's avb.rs does.
// Usage: node tools/mkfooter.js <image.bin> <partition-name> <partition-size> <out.img>
const fs = require('fs');
const crypto = require('crypto');

const sha256 = (b) => crypto.createHash('sha256').update(b).digest();
const align = (n, a) => Math.ceil(n / a) * a;

function hashDescriptor(imageSize, partition, salt, digest) {
  const chunk = Buffer.alloc(16 + 8 + 32 + 16 + 60 + partition.length + salt.length + digest.length + 8);
  let p = 0;
  chunk.writeBigUInt64BE(2n, p); p += 8; // tag: hash
  const followingAt = p; p += 8;          // num bytes following
  chunk.writeBigUInt64BE(BigInt(imageSize), p); p += 8;
  chunk.write('sha256', p, 32, 'latin1'); p += 32;
  chunk.writeUInt32BE(partition.length, p); p += 4;
  chunk.writeUInt32BE(salt.length, p); p += 4;
  chunk.writeUInt32BE(digest.length, p); p += 4;
  chunk.writeUInt32BE(0, p); p += 4;      // flags
  p += 60;                                // reserved
  chunk.write(partition, p, 'latin1'); p += partition.length;
  salt.copy(chunk, p); p += salt.length;
  digest.copy(chunk, p); p += digest.length;
  const total = align(p, 8);
  const out = chunk.subarray(0, total);
  out.writeBigUInt64BE(BigInt(total - 16), followingAt);
  return Buffer.from(out);
}

function vbmeta(descriptors) {
  const aux = align(descriptors.length, 64);
  const v = Buffer.alloc(256 + aux);
  let p = 0;
  v.write('AVB0', p, 'latin1'); p += 4;
  v.writeUInt32BE(1, p); p += 4;  // major
  v.writeUInt32BE(0, p); p += 4;  // minor
  v.writeBigUInt64BE(0n, p); p += 8;                 // auth block
  v.writeBigUInt64BE(BigInt(aux), p); p += 8;        // aux block
  v.writeUInt32BE(0, p); p += 4;                     // algorithm: none
  const n = descriptors.length;
  for (const field of [0, 0, 0, 0, n, 0, n, 0, 0, n, 0]) {
    v.writeBigUInt64BE(BigInt(field), p); p += 8;
  }
  v.writeUInt32BE(0, p); p += 4; // flags
  v.writeUInt32BE(0, p); p += 4; // rollback index location
  v.write('skyward-pack', p, 'latin1');
  descriptors.copy(v, 256);
  return v;
}

const [imagePath, partition, sizeArg, outPath] = process.argv.slice(2);
const partitionSize = Number(sizeArg);
const image = fs.readFileSync(imagePath);
const salt = sha256(image);
const digest = sha256(Buffer.concat([salt, image]));
const vb = vbmeta(hashDescriptor(image.length, partition, salt, digest));
const offset = align(image.length, 4096);
const end = offset + align(vb.length, 4096);
if (end + 4096 > partitionSize) throw new Error('image and vbmeta do not fit the partition');
const out = Buffer.alloc(partitionSize);
image.copy(out, 0);
vb.copy(out, offset);
const f = partitionSize - 64;
out.write('AVBf', f, 'latin1');
out.writeUInt32BE(1, f + 4);
out.writeUInt32BE(0, f + 8);
out.writeBigUInt64BE(BigInt(image.length), f + 12);
out.writeBigUInt64BE(BigInt(offset), f + 20);
out.writeBigUInt64BE(BigInt(vb.length), f + 28);
fs.writeFileSync(outPath, out);
console.log(`wrote ${outPath}: image ${image.length}, vbmeta ${vb.length}, partition ${partitionSize}`);
