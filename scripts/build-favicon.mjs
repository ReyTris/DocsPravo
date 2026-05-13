// Renders apps/web/src/app/icon.svg into a multi-size favicon.ico (PNG-in-ICO).
// Run: node scripts/build-favicon.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require(path.resolve("node_modules/.pnpm/sharp@0.33.5/node_modules/sharp"));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = path.join(root, "apps/web/src/app/icon.svg");
const outIco = path.join(root, "apps/web/public/favicon.ico");
const outApple = path.join(root, "apps/web/public/apple-icon.png");
const outAppleLegacy = path.join(root, "apps/web/public/apple-touch-icon.png");

const svg = await readFile(svgPath);
const sizes = [16, 32, 48, 64];

const pngs = await Promise.all(
  sizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png({ compressionLevel: 9 }).toBuffer()),
);

// ICO header
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);          // reserved
header.writeUInt16LE(1, 2);          // type = icon
header.writeUInt16LE(sizes.length, 4);

const entries = Buffer.alloc(16 * sizes.length);
let offset = 6 + entries.length;
sizes.forEach((s, i) => {
  const buf = pngs[i];
  const e = i * 16;
  entries.writeUInt8(s >= 256 ? 0 : s, e + 0);  // width
  entries.writeUInt8(s >= 256 ? 0 : s, e + 1);  // height
  entries.writeUInt8(0, e + 2);                 // palette
  entries.writeUInt8(0, e + 3);                 // reserved
  entries.writeUInt16LE(1, e + 4);              // planes
  entries.writeUInt16LE(32, e + 6);             // bpp
  entries.writeUInt32LE(buf.length, e + 8);     // size
  entries.writeUInt32LE(offset, e + 12);        // offset
  offset += buf.length;
});

const ico = Buffer.concat([header, entries, ...pngs]);
await writeFile(outIco, ico);

const apple = await sharp(svg, { density: 384 }).resize(180, 180).png({ compressionLevel: 9 }).toBuffer();
await writeFile(outApple, apple);
await writeFile(outAppleLegacy, apple);

console.log(`favicon.ico (${sizes.join("/")}) -> ${path.relative(root, outIco)}`);
console.log(`apple-icon.png 180x180 -> ${path.relative(root, outApple)}`);
console.log(`apple-touch-icon.png 180x180 -> ${path.relative(root, outAppleLegacy)}`);
