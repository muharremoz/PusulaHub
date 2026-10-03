// Pusula Connect uygulama ikonu: koyu kare zemin + turuncu pusula dairesi + beyaz ok + sağ altta zincir halkası.
// Çıktı: onizleme.png (büyük), ikon-<n>.png, uygulama.ico (16–256, PNG gömülü girişler)
import { createRequire } from "module"
import { writeFileSync } from "fs"
const require = createRequire(import.meta.url)
const sharp = require("sharp")

const ZEMIN = "#1A1A1A", TURUNCU = "#F26A1B", BEYAZ = "#FFFFFF"

// Zincir halkası: iki kapsül (stadyum) çerçeve, -45° eğik, sağ altta. Önce kalın koyu kontur (zeminden ayırır), üstüne beyaz.
function halka(cx, cy, w, h, kalin, renk) {
  return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="none" stroke="${renk}" stroke-width="${kalin}"/>`
}
function zincir(renk, kalin) {
  // eksen boyunca ±64 kaydırılmış iki halka, (735,735) etrafında -45°
  return `<g transform="rotate(-45 745 745)">${halka(745 - 82, 745, 236, 120, kalin, renk)}${halka(745 + 82, 745, 236, 120, kalin, renk)}</g>`
}

function svg({ zincirli = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="228" fill="${ZEMIN}"/>
  <circle cx="${zincirli ? 470 : 512}" cy="${zincirli ? 470 : 512}" r="${zincirli ? 300 : 330}" fill="${TURUNCU}"/>
  ${(() => {
    // Navigasyon oku: uç yukarıda, alt kenar içe girintili; köşeler yuvarlak (aynı renkte kontur)
    const ox = zincirli ? 470 : 512, oy = zincirli ? 470 : 512, k = zincirli ? 1 : 1.1
    const p = (x, y) => `${ox + x * k},${oy + y * k}`
    return `<polygon points="${p(0, -190)} ${p(140, 170)} ${p(0, 95)} ${p(-140, 170)}" fill="${BEYAZ}" stroke="${BEYAZ}" stroke-width="${28 * k}" stroke-linejoin="round"/>`
  })()}
  ${zincirli ? zincir(ZEMIN, 112) + zincir(BEYAZ, 52) : ""}
</svg>`
}

const DIZIN = new URL(".", import.meta.url)
const boyutlar = [16, 20, 24, 32, 40, 48, 64, 128, 256]
const pngler = []
for (const n of boyutlar) {
  // 16–20 px'te zincir çamurlaşır: yalnız pusula (daha büyük daire)
  const buf = await sharp(Buffer.from(svg({ zincirli: n > 20 }))).resize(n, n).png().toBuffer()
  writeFileSync(new URL(`ikon-${n}.png`, DIZIN), buf)
  pngler.push({ n, buf })
}
writeFileSync(new URL("onizleme.png", DIZIN), await sharp(Buffer.from(svg())).resize(512, 512).png().toBuffer())
writeFileSync(new URL("ikon.svg", DIZIN), svg())

// ICO: başlık + dizin + PNG gövdeleri (Vista+ PNG girişlerini her boyutta okur)
const bas = Buffer.alloc(6); bas.writeUInt16LE(0, 0); bas.writeUInt16LE(1, 2); bas.writeUInt16LE(pngler.length, 4)
const dizin = Buffer.alloc(16 * pngler.length)
let ofset = 6 + dizin.length
pngler.forEach(({ n, buf }, i) => {
  const o = i * 16
  dizin.writeUInt8(n >= 256 ? 0 : n, o); dizin.writeUInt8(n >= 256 ? 0 : n, o + 1)
  dizin.writeUInt8(0, o + 2); dizin.writeUInt8(0, o + 3)
  dizin.writeUInt16LE(1, o + 4); dizin.writeUInt16LE(32, o + 6)
  dizin.writeUInt32LE(buf.length, o + 8); dizin.writeUInt32LE(ofset, o + 12)
  ofset += buf.length
})
writeFileSync(new URL("uygulama.ico", DIZIN), Buffer.concat([bas, dizin, ...pngler.map((p) => p.buf)]))
console.log("tamam:", boyutlar.join(","), "→ uygulama.ico")
