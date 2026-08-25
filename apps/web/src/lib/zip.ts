/**
 * Bağımlılıksız minimal ZIP yazıcı — yalnız "store" (sıkıştırmasız) yöntemi.
 *
 * Neden kütüphane değil: paketlenen dosyalar birkaç KB'lık düz metin
 * (`.cs`, `.bat`, `.sh`, `.py`). Sıkıştırma kazancı önemsiz, buna karşılık
 * `archiver`/`jszip` bundle'a yük bindirirdi (proje prensibi: gereksiz
 * kütüphane eklenmez). Store yöntemiyle üretilen arşiv geçerli bir ZIP'tir;
 * Windows Gezgini, 7-Zip ve `Expand-Archive` sorunsuz açar.
 *
 * Desteklenmeyen: sıkıştırma, şifreleme, ZIP64 (>4GB), dizin girdileri.
 * Dosya adları ASCII olmalı (UTF-8 bayrağı set edilmiyor).
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** JS Date → DOS zaman/tarih çifti (ZIP başlıklarının beklediği format). */
function dosDateTime(d: Date): { time: number; date: number } {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  // DOS tarih epoch'u 1980; öncesi temsil edilemez.
  const year = Math.max(0, d.getFullYear() - 1980);
  const date = ((year & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

export interface ZipEntry {
  /** Arşiv içindeki yol (ASCII, `/` ayraçlı). */
  name: string;
  data: Uint8Array;
  /** Girdi tarihi; verilmezse 1980-01-01. */
  date?: Date;
}

/** Verilen dosyalardan tek parça ZIP (Uint8Array) üretir. */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = new TextEncoder().encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;
    const { time, date } = dosDateTime(e.date ?? new Date(1980, 0, 1));

    // ── Yerel dosya başlığı (30 bayt + ad) ──
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // imza
    lv.setUint16(4, 20, true);         // gereken sürüm
    lv.setUint16(6, 0, true);          // bayraklar
    lv.setUint16(8, 0, true);          // yöntem: store
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);      // sıkıştırılmış boyut
    lv.setUint32(22, size, true);      // gerçek boyut
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);         // extra alanı yok
    local.set(nameBytes, 30);

    locals.push(local, e.data);

    // ── Merkezi dizin girdisi (46 bayt + ad) ──
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);         // oluşturan sürüm
    cv.setUint16(6, 20, true);         // gereken sürüm
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);         // extra
    cv.setUint16(32, 0, true);         // yorum
    cv.setUint16(34, 0, true);         // disk no
    cv.setUint16(36, 0, true);         // iç öznitelik
    cv.setUint32(38, 0, true);         // dış öznitelik
    cv.setUint32(42, offset, true);    // yerel başlığın konumu
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length + size;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);

  // ── Merkezi dizin sonu (22 bayt) ──
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);                 // bu disk
  ev.setUint16(6, 0, true);                 // merkezi dizinin diski
  ev.setUint16(8, entries.length, true);    // bu diskteki girdi
  ev.setUint16(10, entries.length, true);   // toplam girdi
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);           // merkezi dizin konumu
  ev.setUint16(20, 0, true);                // arşiv yorumu yok

  const parts = [...locals, ...centrals, end];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
