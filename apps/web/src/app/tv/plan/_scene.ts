/**
 * Kat planı sahnesi — saf three.js.
 *
 * ── Neden react-three-fiber yok? ───────────────────────────────────────
 * r3f'in JSX tipleri bu projenin TypeScript kurulumunu kırıyor (daha önce
 * denendi ve geri alındı). Sahne bu yüzden React'ten BAĞIMSIZ, imperatif
 * bir modül: React yalnız kabı (div) veriyor ve `PlanSahne` örneğini
 * yönetiyor. Böylece her karede React render'ı tetiklenmiyor — TV'de
 * saatlerce dönecek bir sayfa için bu önemli.
 *
 * ── Etiketler neden DOM? ───────────────────────────────────────────────
 * three.js'te metin çizmek pahalı ve çirkin (texture atlas ya da font
 * yükleyici gerekiyor). Etiketler normal `div` olarak duruyor, her karede
 * dünya koordinatı ekrana yansıtılıp `transform` ile taşınıyor. Yazı tipi
 * ve renkler sayfanın geri kalanıyla birebir aynı kalıyor, uzaktan da
 * net okunuyor.
 */

import * as THREE from "three"

/* ══════════════════════════════════════════════════════════
   Renkler — /tv ile aynı dil
   ──────────────────────────────────────────────────────────
   Bu sayfada YEŞİL "ayakta" demek ve bilerek kullanılıyor: kat
   planında bakılan tek şey blokların durumu, /tv'deki gibi başka
   anlam taşıyan bir renk yok.
══════════════════════════════════════════════════════════ */
const RENK = {
  zemin:    0x131519,
  taban:    0x212429,
  /*  Parlak degil DERIN tonlar. Ilk denemede tailwind'in acik tonlari
   *  (0x34d399 vb.) kullanildi ve bloklar duz boyanmis gibi durdu —
   *  3B hacim kayboluyordu. Koyu renk + gucli yonlu isik, yan yuzlerde
   *  gercek bir ton farki birakiyor.                                   */
  online:   0x0e9f6e,
  warning:  0xd08700,
  offline:  0xdc4a4a,
  bilinmez: 0x3f3f46,
} as const

export type PlanDurum = "online" | "warning" | "offline" | "bilinmez"

export interface PlanBlok {
  id:      string
  ad:      string
  durum:   PlanDurum
  /** 0-100 — bloğun yüksekliğini belirler */
  yuk:     number
  /** Izgarada kapladığı alan (birim kare) */
  en:      number
  boy:     number
  /** Izgara konumu (sol üst köşe) */
  x:       number
  z:       number
}

interface Secim {
  id: string
  /** Ekran koordinatı — detay kartı buraya konumlanıyor */
  ekranX: number
  ekranY: number
}

const BIRIM      = 1.6      // bir ızgara karesinin dünya boyutu
const ARALIK     = 0.14     // bloklar arası boşluk
const TABAN_Y    = 0.22     // en düşük blok yüksekliği
const YUK_CARPAN = 0.9      // %100 yükte eklenen yükseklik

export class PlanSahne {
  private sahne     = new THREE.Scene()
  private kamera:     THREE.PerspectiveCamera
  private cizici:     THREE.WebGLRenderer
  private raycaster = new THREE.Raycaster()
  private fare      = new THREE.Vector2(-10, -10)
  private bloklar   = new Map<string, THREE.Mesh>()
  private etiketler = new Map<string, HTMLDivElement>()
  private kap:        HTMLElement
  private etiketKat:  HTMLDivElement
  private animId    = 0
  private aci       = Math.PI * 0.25   // kameranın yatay açısı
  private surukle   = false
  private sonX      = 0
  private uzerinde: string | null = null
  private secili:   string | null = null
  private sonKare   = 0

  /** Seçim değişince React'e haber verilir (detay kartı için) */
  onSecim: (s: Secim | null) => void = () => {}

  constructor(kap: HTMLElement) {
    this.kap = kap

    this.cizici = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.cizici.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.cizici.shadowMap.enabled = true
    this.cizici.shadowMap.type = THREE.PCFSoftShadowMap
    kap.appendChild(this.cizici.domElement)

    /*  Etiketler ayrı bir katmanda; canvas tıklamayı yutmasın diye
     *  `pointer-events:none`.                                          */
    this.etiketKat = document.createElement("div")
    this.etiketKat.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:hidden"
    kap.appendChild(this.etiketKat)

    this.kamera = new THREE.PerspectiveCamera(30, 1, 0.1, 200)

    /*  Işık: tek yönlü ana ışık gölge üretiyor, yumuşak ortam ışığı
     *  blokların yan yüzlerini tamamen karartmıyor.                    */
    /*  Ortam isigi dusuk tutuluyor: yuksek olunca butun yuzler ayni
     *  parlaklikta oluyor ve bloklar yassi gorunuyor.                  */
    this.sahne.add(new THREE.AmbientLight(0xffffff, 0.62))
    const ana = new THREE.DirectionalLight(0xffffff, 2.6)
    ana.position.set(6, 12, 5)
    ana.castShadow = true
    ana.shadow.mapSize.set(2048, 2048)
    ana.shadow.camera.left = -20
    ana.shadow.camera.right = 20
    ana.shadow.camera.top = 20
    ana.shadow.camera.bottom = -20
    this.sahne.add(ana)

    kap.addEventListener("pointermove", this.fareHareket)
    kap.addEventListener("pointerdown", this.fareBasti)
    window.addEventListener("pointerup", this.fareBirakti)
    kap.addEventListener("pointerleave", this.fareCikti)

    this.boyutla()
    this.dongu()
  }

  /* ── Blokları kur / güncelle ───────────────────────────────────── */
  guncelle(veri: PlanBlok[]) {
    const kalanlar = new Set(this.bloklar.keys())

    /*  Izgara merkezi: bloklar sahnenin ortasında dursun.              */
    const maxX = Math.max(1, ...veri.map((b) => b.x + b.en))
    const maxZ = Math.max(1, ...veri.map((b) => b.z + b.boy))
    const kayX = (maxX * BIRIM) / 2
    const kayZ = (maxZ * BIRIM) / 2

    this.tabanKur(maxX, maxZ)

    for (const b of veri) {
      kalanlar.delete(b.id)
      const h = TABAN_Y + (Math.max(0, Math.min(100, b.yuk)) / 100) * YUK_CARPAN
      const w = b.en * BIRIM - ARALIK
      const d = b.boy * BIRIM - ARALIK
      const px = b.x * BIRIM + (b.en * BIRIM) / 2 - kayX
      const pz = b.z * BIRIM + (b.boy * BIRIM) / 2 - kayZ

      let m = this.bloklar.get(b.id)
      if (!m) {
        m = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.04 }),
        )
        m.castShadow = true
        m.receiveShadow = true
        this.sahne.add(m)
        this.bloklar.set(b.id, m)
      }
      m.userData.id = b.id
      m.scale.set(w, h, d)
      m.position.set(px, h / 2, pz)

      const renk = new THREE.Color(RENK[b.durum === "bilinmez" ? "bilinmez" : b.durum])
      const mat = m.material as THREE.MeshStandardMaterial
      mat.color.copy(renk)
      /*  Kendi ışığı: koyu zeminde blok "yanıyor" gibi dursun, ama
       *  seçili/üzerinde olan daha parlak olsun diye taban düşük.      */
      mat.emissive.copy(renk)
      mat.emissiveIntensity = 0.06

      this.etiketKur(b, px, h, pz)
    }

    /*  Listeden çıkan sunucu varsa sahneden de gitsin.                 */
    for (const id of kalanlar) {
      const m = this.bloklar.get(id)
      if (m) { this.sahne.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose() }
      this.bloklar.delete(id)
      this.etiketler.get(id)?.remove()
      this.etiketler.delete(id)
    }
  }

  private taban: THREE.Mesh | null = null

  private tabanKur(maxX: number, maxZ: number) {
    const w = maxX * BIRIM + 1.2
    const d = maxZ * BIRIM + 1.2
    if (!this.taban) {
      this.taban = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: RENK.taban, roughness: 0.9, metalness: 0 }),
      )
      this.taban.receiveShadow = true
      this.sahne.add(this.taban)
    }
    this.taban.scale.set(w, 0.25, d)
    this.taban.position.set(0, -0.125, 0)

    /*  Kamerayı zemin boyutuna göre uzaklaştır: sunucu sayısı artınca
     *  plan taşmasın.                                                  */
    this.mesafe = Math.max(w, d) * 1.55
  }

  private mesafe = 14

  private etiketKur(b: PlanBlok, px: number, h: number, pz: number) {
    let el = this.etiketler.get(b.id)
    if (!el) {
      el = document.createElement("div")
      el.style.cssText =
        "position:absolute;transform-origin:0 0;white-space:nowrap;font-weight:600;" +
        "letter-spacing:0.01em;text-shadow:0 1px 3px rgba(0,0,0,0.8)"
      this.etiketKat.appendChild(el)
      this.etiketler.set(b.id, el)
    }
    el.textContent = b.ad
    el.dataset.px = String(px)
    el.dataset.py = String(h + 0.12)
    el.dataset.pz = String(pz)
  }

  /* ── Etkileşim ─────────────────────────────────────────────────── */
  private fareHareket = (e: PointerEvent) => {
    const r = this.kap.getBoundingClientRect()
    this.fare.x = ((e.clientX - r.left) / r.width) * 2 - 1
    this.fare.y = -((e.clientY - r.top) / r.height) * 2 + 1
    if (this.surukle) {
      this.aci -= (e.clientX - this.sonX) * 0.005
      this.sonX = e.clientX
    }
  }
  private fareBasti = (e: PointerEvent) => { this.surukle = true; this.sonX = e.clientX; this.basSaat = performance.now() }
  private fareCikti = () => { this.fare.set(-10, -10) }
  private basSaat = 0

  private fareBirakti = (e: PointerEvent) => {
    if (!this.surukle) return
    this.surukle = false
    /*  Sürükleyip bıraktıysa seçim yapma; yalnız kısa tık seçsin.      */
    if (performance.now() - this.basSaat > 250) return
    const r = this.kap.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return

    /*  Işın BURADA atılıyor, `uzerinde` değerine güvenilmiyor: o değer
     *  son `pointermove` ile hesaplanıyor ve dokunmatik ekranda (ya da
     *  fare hiç kıpırdamadan yapılan tıkta) hareket olayı hiç gelmiyor,
     *  seçim sessizce boşa düşüyordu.                                  */
    this.fare.x = ((e.clientX - r.left) / r.width) * 2 - 1
    this.fare.y = -((e.clientY - r.top) / r.height) * 2 + 1
    this.raycaster.setFromCamera(this.fare, this.kamera)
    const vurus = this.raycaster.intersectObjects([...this.bloklar.values()])
    this.secili = vurus.length ? (vurus[0].object.userData.id as string) : null
    this.secimBildir()
  }

  private secimBildir() {
    if (!this.secili) { this.onSecim(null); return }
    const m = this.bloklar.get(this.secili)
    if (!m) { this.onSecim(null); return }
    const v = m.position.clone()
    v.y += m.scale.y
    v.project(this.kamera)
    const r = this.kap.getBoundingClientRect()
    this.onSecim({
      id: this.secili,
      ekranX: ((v.x + 1) / 2) * r.width,
      ekranY: ((-v.y + 1) / 2) * r.height,
    })
  }

  secimiTemizle() { this.secili = null; this.onSecim(null) }

  /* ── Döngü ─────────────────────────────────────────────────────── */
  private dongu = () => {
    this.animId = requestAnimationFrame(this.dongu)
    const simdi = performance.now()
    const dt = Math.min(0.05, (simdi - this.sonKare) / 1000)
    this.sonKare = simdi

    /*  Sürüklenmiyorken çok yavaş dönüyor: TV'de sabit görüntü ölü
     *  duruyor, hızlı dönüş ise okumayı zorlaştırıyor.                 */
    if (!this.surukle) this.aci += dt * 0.035

    this.kamera.position.set(
      Math.sin(this.aci) * this.mesafe,
      this.mesafe * 0.72,
      Math.cos(this.aci) * this.mesafe,
    )
    this.kamera.lookAt(0, 0, 0)

    /*  Üzerinde durulan blok                                           */
    this.raycaster.setFromCamera(this.fare, this.kamera)
    const kesisim = this.raycaster.intersectObjects([...this.bloklar.values()])
    const yeni = kesisim.length ? (kesisim[0].object.userData.id as string) : null
    if (yeni !== this.uzerinde) {
      this.uzerinde = yeni
      this.kap.style.cursor = yeni ? "pointer" : "default"
    }

    for (const [id, m] of this.bloklar) {
      const mat = m.material as THREE.MeshStandardMaterial
      const hedef = id === this.secili ? 0.45 : id === this.uzerinde ? 0.24 : 0.06
      mat.emissiveIntensity += (hedef - mat.emissiveIntensity) * 0.15
    }

    this.etiketleriTasi()
    if (this.secili) this.secimBildir()
    this.cizici.render(this.sahne, this.kamera)
  }

  private etiketleriTasi() {
    const r = this.kap.getBoundingClientRect()
    const v = new THREE.Vector3()
    for (const [id, el] of this.etiketler) {
      v.set(Number(el.dataset.px), Number(el.dataset.py), Number(el.dataset.pz))
      v.project(this.kamera)
      /*  Arkada kalan etiket gizlensin (z > 1 kameranın arkası).       */
      if (v.z > 1) { el.style.display = "none"; continue }
      el.style.display = "block"
      const x = ((v.x + 1) / 2) * r.width
      const y = ((-v.y + 1) / 2) * r.height
      el.style.transform = `translate(-50%,-100%) translate(${x}px,${y}px)`
      const vurgulu = id === this.secili || id === this.uzerinde
      el.style.color = vurgulu ? "#FFFFFF" : "#E4E4E7"
      /*  TV'ye uzaktan bakiliyor: 12px okunmuyordu.                    */
      el.style.fontSize = vurgulu ? "17px" : "15px"
    }
  }

  boyutla() {
    const w = this.kap.clientWidth
    const h = this.kap.clientHeight
    if (!w || !h) return
    this.cizici.setSize(w, h, false)
    this.kamera.aspect = w / h
    this.kamera.updateProjectionMatrix()
  }

  yokEt() {
    cancelAnimationFrame(this.animId)
    this.kap.removeEventListener("pointermove", this.fareHareket)
    this.kap.removeEventListener("pointerdown", this.fareBasti)
    window.removeEventListener("pointerup", this.fareBirakti)
    this.kap.removeEventListener("pointerleave", this.fareCikti)
    for (const m of this.bloklar.values()) {
      m.geometry.dispose(); (m.material as THREE.Material).dispose()
    }
    this.taban?.geometry.dispose()
    this.cizici.dispose()
    this.cizici.domElement.remove()
    this.etiketKat.remove()
  }
}

/* ══════════════════════════════════════════════════════════
   Yerleşim
══════════════════════════════════════════════════════════ */

/**
 * Sunucuları ızgaraya diz.
 *
 * Blok boyutu sunucunun BÜYÜKLÜĞÜNÜ anlatıyor (oturum sayısı varsa ona,
 * yoksa RAM'e göre): terminal sunucuları planda büyük duruyor, tek işlevli
 * makineler küçük. Böylece plan sadece renk değil, alan olarak da bilgi
 * veriyor.
 */
export function yerlesimKur(
  girdi: { id: string; ad: string; durum: PlanDurum; yuk: number; buyukluk: number }[],
  sutun = 3,
): PlanBlok[] {
  const out: PlanBlok[] = []
  /*  Basit satır-sütun yerleşimi: her blok 2x2 ya da 1x1 kare kaplıyor
   *  ve sütun sınırına gelince alt satıra geçiyor.                     */
  let x = 0
  let z = 0
  let satirYuksek = 0
  for (const g of girdi) {
    const buyuk = g.buyukluk >= 60
    const en = buyuk ? 2 : 1
    const boy = buyuk ? 2 : 1
    if (x + en > sutun) { x = 0; z += satirYuksek || 1; satirYuksek = 0 }
    out.push({ id: g.id, ad: g.ad, durum: g.durum, yuk: g.yuk, en, boy, x, z })
    x += en
    satirYuksek = Math.max(satirYuksek, boy)
  }
  return out
}
