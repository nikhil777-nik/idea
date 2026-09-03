const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function generatePNG(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const ihdr = createChunk('IHDR', header);

  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0);
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const ny = y / height;
      let r = 15, g = 23, b = 42, a = 255;
      if (nx >= 0.2 && nx <= 0.8 && ny >= 0.2 && ny <= 0.8) {
        if (nx <= ny + 0.05 && ny <= 0.85 && (nx + ny <= 1.35)) {
          r = 56; g = 189; b = 248;
        }
      }
      if (Math.hypot(nx - 0.5, ny - 0.5) > 0.48) a = 0;
      rawData.push(r, g, b, a);
    }
  }

  const compressed = zlib.deflateSync(Buffer.from(rawData));
  const idat = createChunk('IDAT', compressed);
  const iend = createChunk('IEND', Buffer.alloc(0));

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, ihdr, idat, iend]);
}

const assetsDir = path.join(__dirname, '..', 'extension', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const pngBuf = generatePNG(size, size);
  fs.writeFileSync(path.join(assetsDir, `icon${size}.png`), pngBuf);
  console.log(`Generated extension icon${size}.png`);
});
