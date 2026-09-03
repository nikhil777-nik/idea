const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Helper to create CRC32 checksum table
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

function generatePNG(width, height, drawPixelFn) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;  // bit depth
  header[9] = 6;  // color type RGBA
  header[10] = 0; // compression
  header[11] = 0; // filter
  header[12] = 0; // interlace

  const ihdr = createChunk('IHDR', header);

  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixelFn(x, y, width, height);
      rawData.push(r, g, b, a);
    }
  }

  const compressed = zlib.deflateSync(Buffer.from(rawData));
  const idat = createChunk('IDAT', compressed);
  const iend = createChunk('IEND', Buffer.alloc(0));

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function drawCursorIcon(x, y, width, height) {
  const nx = x / width;
  const ny = y / height;

  // Background gradient: dark slate to deep cyan-violet
  let r = Math.round(15 + ny * 20);
  let g = Math.round(23 + nx * 20);
  let b = Math.round(42 + ny * 30);
  let a = 255;

  // Check if pixel is inside mouse cursor arrow shape
  // Cursor triangle coordinates (scaled 0-1)
  const p1 = [0.25, 0.2];
  const p2 = [0.45, 0.8];
  const p3 = [0.55, 0.55];
  const p4 = [0.8, 0.55];

  // Simple bounding test for cursor arrow
  if (nx >= 0.2 && nx <= 0.8 && ny >= 0.2 && ny <= 0.8) {
    if (nx <= ny + 0.05 && ny <= 0.85 && (nx + ny <= 1.35)) {
      // Glow/Highlight
      r = 56;
      g = 189;
      b = 248;
      a = 255;
    }
  }

  // Rounded border
  const cornerDist = Math.hypot(nx - 0.5, ny - 0.5);
  if (cornerDist > 0.48) {
    a = 0; // Rounded transparent corners
  }

  return [r, g, b, a];
}

const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const pngBuf = generatePNG(size, size, drawCursorIcon);
  const filePath = path.join(assetsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, pngBuf);
  console.log(`Generated ${filePath}`);
});
