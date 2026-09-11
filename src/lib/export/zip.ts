// Dependency-free, deterministic ZIP writer (§42 ZIP export). Uses the "store"
// method (no compression) so the output is fully reproducible from the input
// files — no native binary or third-party supply chain. Suitable for the
// serverless Node runtime on Vercel.
//
// Only the minimum ZIP structure is emitted: local file headers, the central
// directory, and the end-of-central-directory record.

import { Buffer } from "node:buffer";

// Precomputed CRC32 table (IEEE 802.3 / zlib, reflected, polynomial
// 0xEDB88320). Must match node:zlib / python:zlib exactly, or standard
// unzip tools reject the archive with "Bad CRC-32".
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Build a valid ZIP archive from a map of filename -> text content.
 * Returns the raw bytes (as a Buffer) ready to be sent as a download.
 */
export function makeZip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8");
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);

    // Local file header.
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01 baseline)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed
    local.writeUInt32LE(data.length, 22); // uncompressed
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len

    const localBlock = Buffer.concat([local, nameBuf, data]);
    parts.push(localBlock);

    // Central directory header.
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // made by
    cd.writeUInt16LE(20, 6); // needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(0, 10); // method
    cd.writeUInt16LE(0, 12); // time
    cd.writeUInt16LE(0x21, 14); // date
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20); // comp
    cd.writeUInt32LE(data.length, 24); // uncomp
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra len
    cd.writeUInt16LE(0, 32); // comment len
    cd.writeUInt16LE(0, 34); // disk num
    cd.writeUInt16LE(0, 36); // internal attr
    cd.writeUInt32LE(0, 38); // external attr
    cd.writeUInt32LE(offset, 42); // local header offset
    central.push(Buffer.concat([cd, nameBuf]));

    offset += localBlock.length;
  }

  const cdBuffer = Buffer.concat(central);
  const cdOffset = offset;

  // End of central directory.
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cdBuffer.length, 12);
  end.writeUInt32LE(cdOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, cdBuffer, end]);
}
