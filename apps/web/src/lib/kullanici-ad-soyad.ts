/**
 * Kurulum sihirbazı — kullanıcı adından "AD SOYAD" ve kopya kullanıcı adları.
 *
 * Kullanıcı adları genelde ad+soyad bitişik + sıra numarası (`mehmetsener1`).
 * Ayraç yoksa adın nerede bittiğini yaygın Türkçe adlar listesiyle buluyoruz:
 * en uzun eşleşen ad önek kabul edilir, kalan soyaddır. Eşleşme yoksa tek
 * kelime döner — kullanıcı alanı elle düzeltebilir.
 */

// ASCII yazımlar — kullanıcı adlarında Türkçe karakter olmuyor
const ADLAR = new Set(`
abdullah abdulkadir abdurrahman adem adnan ahmet akif alev ali alper alp altan arda arif arzu asli aslihan
asuman ata atakan atilla ayca aydin ayfer aygul ayhan ayla aylin aynur aysegul aysel ayse aysun aytac aytekin
ayten bahar baris batuhan bayram belgin belgin berk berkay berna betul beyza birol bilal bilge burak burcu
burcin bulent busra cagla cagri cahit can canan cansu cem cemal cemil cengiz cenk ceren cetin cevdet cigdem
cihan damla deniz derya dilek dilara doga dogan dogukan duygu ebru ece ecem ecrin eda edip ekrem elif elcin
emel emine emin emir emre emrah engin enes eren ergun erhan erkan erol ersin ertan ertugrul esra esin evren
eylul ezgi faruk fatih fatma fazilet ferhat feride fikret filiz fuat funda furkan gamze gizem gokay gokhan
goksel gonca gul gulay gulsen gulten gunay guler gurkan hakan hale halil halime hamza hande hasan hatice
haydar hayri hilal hulya huseyin ibrahim ilker ilknur ilhan inci irem ismail ismet ipek kaan kadir kamil
kemal kenan kerem kubra kurtulus levent leyla mahmut mehmet melek melike melis meltem merve mert mesut metin
mine mithat muhammed muhammet murat mustafa muzaffer nail nalan nazli nebahat necati necla nedim nihat nil
nilay nilgun nisa nur nuray nurcan nuri nursel oguz oguzhan okan oktay omer onur orhan osman ozan ozge ozgur
ozlem pinar recep refik remzi riza rukiye sabri sadik saadet sait salih selcuk selda selim selin selma
semih semra serap serdar sercan serhat serkan sevda sevgi sevim sevil seyma sibel sinan sinem sefa sena
sedat seda sema seher sukru sule suleyman sumeyye taha tahsin talha taner tarik tayfun tolga tuba tugba
tuncay tuncer turan turgay turgut tulay ufuk ugur umit umut utku vedat volkan yakup yasar yasemin yasin
yavuz yeliz yesim yigit yildiz yilmaz yunus yusuf zafer zehra zeki zeynep ziya zuhal zulfiye
`.split(/\s+/).filter(Boolean))

// Düz (ASCII) büyük harf: kullanıcı adında ı/i ayrımı yok, tr-TR "yilmaz"ı "YİLMAZ" yapardı
const buyuk = (s: string) => s.toUpperCase()

/** `mehmetsener1` → `MEHMET SENER`, `ali.kaya` → `ALI KAYA` */
export function adSoyadTuret(kullaniciAdi: string): string {
  const temiz = kullaniciAdi.trim().toLowerCase().replace(/\d+$/, "")
  if (!temiz) return ""
  const parcalar = temiz.split(/[._\-\s]+/).filter(Boolean)
  if (parcalar.length > 1) return buyuk(parcalar.join(" "))

  const kelime = parcalar[0] ?? ""
  // En uzun eşleşen ad; soyada en az 2 harf kalmalı
  for (let i = kelime.length - 2; i >= 2; i--) {
    if (ADLAR.has(kelime.slice(0, i))) return buyuk(`${kelime.slice(0, i)} ${kelime.slice(i)}`)
  }
  return buyuk(kelime)
}

/**
 * Kullanıcı adının kopyaları: sondaki sayı artar (`mehmetsener1` → 2, 3, 4…).
 * Sayı yoksa ad 1 kabul edilir. `dolu` içindeki adlar atlanır (küçük harf).
 */
export function kopyaKullaniciAdlari(kullaniciAdi: string, adet: number, dolu: Set<string>): string[] {
  const m = kullaniciAdi.trim().match(/^(.*?)(\d*)$/)
  const kok = m?.[1] ?? ""
  let n = m?.[2] ? Number.parseInt(m[2], 10) : 1
  const sonuc: string[] = []
  while (sonuc.length < adet) {
    n++
    const ad = `${kok}${n}`
    if (dolu.has(ad.toLowerCase())) continue
    sonuc.push(ad)
  }
  return sonuc
}
