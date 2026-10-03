// Hazır ikon PNG'sinden (saydamlıksız) uygulama.ico: karonun dışındaki köşeler yuvarlak maskeyle saydam yapılır,
// her boyut ayrı ölçeklenir (Lanczos), ICO'ya PNG giriş olarak konur.
//   SHARP_YOLU=... node png-den-ico.mjs <kaynak.png> <cikti-klasoru>
import { createRequire } from "module"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
const require = createRequire(import.meta.url)
const sharp = require(process.env.SHARP_YOLU ?? "sharp")

const [kaynak, cikti] = process.argv.slice(2)
mkdirSync(cikti, { recursive: true })
const { width: W } = await sharp(kaynak).metadata()
// Karonun köşe yarıçapı görselde ~%16; 1 px içeri çekilir ki dıştaki siyah şerit kalmasın
const R = Math.round(W * 0.16), ic = 2
const maske = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><rect x="${ic}" y="${ic}" width="${W - 2 * ic}" height="${W - 2 * ic}" rx="${R}" fill="#fff"/></svg>`)
const temiz = await sharp(kaynak).ensureAlpha().composite([{ input: maske, blend: "dest-in" }]).png().toBuffer()
writeFileSync(join(cikti, "uygulama-1024.png"), await sharp(temiz).resize(1024, 1024, { kernel: "lanczos3" }).png().toBuffer())

const boyutlar = [16, 20, 24, 32, 40, 48, 64, 128, 256]
const pngler = []
for (const n of boyutlar) {
  const buf = await sharp(temiz).resize(n, n, { kernel: "lanczos3" }).png().toBuffer()
  writeFileSync(join(cikti, `ikon-${n}.png`), buf)
  pngler.push({ n, buf })
}
const bas = Buffer.alloc(6); bas.writeUInt16LE(1, 2); bas.writeUInt16LE(pngler.length, 4)
const dizin = Buffer.alloc(16 * pngler.length)
let ofset = 6 + dizin.length
pngler.forEach(({ n, buf }, i) => {
  const o = i * 16
  dizin.writeUInt8(n >= 256 ? 0 : n, o); dizin.writeUInt8(n >= 256 ? 0 : n, o + 1)
  dizin.writeUInt16LE(1, o + 4); dizin.writeUInt16LE(32, o + 6)
  dizin.writeUInt32LE(buf.length, o + 8); dizin.writeUInt32LE(ofset, o + 12)
  ofset += buf.length
})
writeFileSync(join(cikti, "uygulama.ico"), Buffer.concat([bas, dizin, ...pngler.map((p) => p.buf)]))
console.log("tamam:", boyutlar.join(","))
