/**
 * Kat planı sahnesi — saf three.js.
 *
 * ── Şu an ne var? ──────────────────────────────────────────────────────
 * Zemin plakası + çevresinde yükseltilmiş bordür + içeride odalar.
 * Odalar şimdilik HEPSİ NÖTR: renk (durum) ve etiketler sonraki adımda.
 *
 * Önceki sürümde alçak duvarlar ve buzlu cam kapılar vardı; yeni referans
 * duvarsız, bordürlü bir plaka gösteriyor ve içerideki odaları öne
 * çıkarıyor. Duvar + kapı kaldırıldı.
 *
 * ── Neden react-three-fiber yok? ───────────────────────────────────────
 * r3f'in JSX tipleri bu projenin TypeScript kurulumunu kırıyor (daha önce
 * denendi ve geri alındı). Sahne bu yüzden React'ten BAĞIMSIZ, imperatif
 * bir modül: React yalnız kabı (div) veriyor ve `PlanSahne` örneğini
 * yönetiyor. Böylece her karede React render'ı tetiklenmiyor — TV'de
 * saatlerce dönecek bir sayfa için bu önemli.
 */

import * as THREE from "three"

const RENK = {
  /** Plakanın üst yüzü — koridorlar bu renk */
  zemin:      0x22262d,
  /** Plakanın yan yüzü; üstten koyu olunca kalınlık hissi doğuyor */
  zeminKenar: 0x171a1f,
  /** Çevredeki yükseltilmiş bordür */
  bordur:     0x2e333b,
  /** Oda gövdesi — hepsi aynı nötr ton, durum rengi sonraki adımda */
  oda:        0x394049,
} as const

/* ── Kat ölçüleri (dünya birimi) ──────────────────────────────────────
   Referans kareye yakın bir plaka gösteriyor; önceki 20×14 fazla uzundu
   ve odalar tek sıraya diziliyormuş gibi duruyordu.                    */
const EN       = 22
const BOY      = 18
const KALINLIK = 0.45

/** Çevredeki bordür — duvar değil, plakanın yükseltilmiş kenarı */
const BORDUR_EN = 0.55
const BORDUR_Y  = 0.34

/** Odaların yüksekliği — plakadan ayrılsın ama kutuya dönüşmesin */
const ODA_Y   = 0.55
/** Odalar arası koridor */
const KORIDOR = 0.7

/**
 * Oda yerleşimi — bantlar hâlinde.
 *
 * Genişlikler ELLE yazılıyor, otomatik bölünmüyor: eşit parçalara ayırmak
 * ofis planı değil tablo gibi duruyordu. Farklı genişlikler referanstaki
 * organik dağılımı veriyor.
 *
 * Her bant kendi içinde ORTALANIYOR; sağa sola yaslamak bir kenarı boş
 * bırakıp planı yamuk gösteriyordu.
 */
const BANTLAR: { z: number; derinlik: number; genislikler: number[] }[] = [
  { z: -5.4, derinlik: 3.6, genislikler: [5.4, 4.6, 3.8, 3.2] },
  { z: -0.8, derinlik: 3.6, genislikler: [4.2, 5.0, 4.4, 3.2] },
  { z:  3.9, derinlik: 3.8, genislikler: [5.8, 3.8, 4.6, 2.8] },
]

export class PlanSahne {
  private sahne   = new THREE.Scene()
  private kamera:   THREE.PerspectiveCamera
  private cizici:   THREE.WebGLRenderer
  private kap:      HTMLElement
  private animId  = 0
  private aci     = Math.PI * 0.25   // kameranın yatay açısı
  private mesafe  = 30
  private surukle = false
  private sonX    = 0
  private sonKare = 0
  private nesneler: THREE.Mesh[] = []

  constructor(kap: HTMLElement) {
    this.kap = kap

    this.cizici = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.cizici.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.cizici.shadowMap.enabled = true
    this.cizici.shadowMap.type = THREE.PCFSoftShadowMap
    /*  Ton eşleme: ham çıktı koyu sahnelerde sert ve "yanmış" görünüyor,
     *  ACESFilmic yumuşak bir geçiş veriyor.                            */
    this.cizici.toneMapping = THREE.ACESFilmicToneMapping
    this.cizici.toneMappingExposure = 1.15
    kap.appendChild(this.cizici.domElement)

    this.kamera = new THREE.PerspectiveCamera(32, 1, 0.1, 300)
    this.mesafe = Math.max(EN, BOY) * 1.5

    this.isikKur()
    this.plakaKur()
    this.odalariKur()

    kap.addEventListener("pointerdown", this.basti)
    kap.addEventListener("pointermove", this.hareket)
    window.addEventListener("pointerup", this.birakti)

    this.boyutla()
    this.dongu()
  }

  /* ── Işık ──────────────────────────────────────────────────────── */
  private isikKur() {
    /*  Üç kaynak: yarımküre ışığı yüzeylere doğal bir ton farkı veriyor
     *  (üstten soğuk, alttan koyu), yönlü ışık gölgeyi çiziyor, zayıf
     *  dolgu ışığı da gölgede kalan yüzleri tamamen siyah bırakmıyor.  */
    this.sahne.add(new THREE.HemisphereLight(0x9fb4d8, 0x0b0b0d, 0.85))

    const ana = new THREE.DirectionalLight(0xffffff, 2.4)
    ana.position.set(14, 24, 10)
    ana.castShadow = true
    ana.shadow.mapSize.set(2048, 2048)
    ana.shadow.camera.left   = -28
    ana.shadow.camera.right  =  28
    ana.shadow.camera.top    =  28
    ana.shadow.camera.bottom = -28
    ana.shadow.camera.far    =  90
    /*  Gölge aknesi (yüzeyde çizgi çizgi lekeler) için küçük kaydırma. */
    ana.shadow.bias = -0.0006
    this.sahne.add(ana)

    const dolgu = new THREE.DirectionalLight(0xffffff, 0.35)
    dolgu.position.set(-12, 8, -10)
    this.sahne.add(dolgu)
  }

  /* ── Plaka + bordür ────────────────────────────────────────────── */
  private plakaKur() {
    /*  Plaka iki parça: alttaki koyu gövde kalınlığı, üstteki ince yüzey
     *  de odaların oturacağı düzlemi veriyor. Tek parça kutuda yan yüz
     *  ile üst yüz aynı renk oluyor ve plaka kâğıt gibi duruyordu.     */
    const govde = this.kutu(EN, KALINLIK, BOY, RENK.zeminKenar)
    govde.position.y = -KALINLIK / 2
    govde.receiveShadow = true

    const yuzey = this.kutu(EN - 0.06, 0.04, BOY - 0.06, RENK.zemin)
    yuzey.position.y = 0.02
    yuzey.receiveShadow = true

    /*  Bordür plakanın KENARINA oturuyor. Duvar değil: alçak ve kalın,
     *  bir tepsi kenarı gibi. Referansta plan bununla çerçeveleniyor.  */
    const yariEn  = EN / 2 - BORDUR_EN / 2
    const yariBoy = BOY / 2 - BORDUR_EN / 2

    this.bordur(EN, BORDUR_EN, 0, -yariBoy)
    this.bordur(EN, BORDUR_EN, 0,  yariBoy)
    this.bordur(BORDUR_EN, BOY - BORDUR_EN * 2, -yariEn, 0)
    this.bordur(BORDUR_EN, BOY - BORDUR_EN * 2,  yariEn, 0)
  }

  private bordur(w: number, d: number, x: number, z: number) {
    const b = this.kutu(w, BORDUR_Y, d, RENK.bordur)
    b.position.set(x, BORDUR_Y / 2, z)
    b.castShadow = true
    b.receiveShadow = true
  }

  /* ── Odalar ────────────────────────────────────────────────────── */
  private odalariKur() {
    /*  Bordürün içinde kalan kullanılabilir genişlik.                  */
    const icEn = EN - BORDUR_EN * 2 - KORIDOR * 2

    for (const bant of BANTLAR) {
      const toplam =
        bant.genislikler.reduce((a, b) => a + b, 0) +
        KORIDOR * (bant.genislikler.length - 1)

      /*  Bandı ortala; artan boşluk iki yana eşit dağılsın.            */
      let x = -toplam / 2
      for (const w of bant.genislikler) {
        const oda = this.kutu(w, ODA_Y, bant.derinlik, RENK.oda)
        oda.position.set(x + w / 2, ODA_Y / 2, bant.z)
        oda.castShadow = true
        oda.receiveShadow = true
        x += w + KORIDOR
      }

      /*  Bant taşarsa sessizce üst üste binmesin — geliştirirken görün. */
      if (toplam > icEn) {
        console.warn(`[plan] bant z=${bant.z} plakayı taşıyor: ${toplam.toFixed(1)} > ${icEn.toFixed(1)}`)
      }
    }
  }

  private kutu(w: number, h: number, d: number, renk: number): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: renk, roughness: 0.85, metalness: 0.02 }),
    )
    this.sahne.add(m)
    this.nesneler.push(m)
    return m
  }

  /* ── Etkileşim: yatay sürükleme ile döndürme ───────────────────── */
  private basti   = (e: PointerEvent) => { this.surukle = true; this.sonX = e.clientX }
  private hareket = (e: PointerEvent) => {
    if (!this.surukle) return
    this.aci -= (e.clientX - this.sonX) * 0.005
    this.sonX = e.clientX
  }
  private birakti = () => { this.surukle = false }

  /* ── Döngü ─────────────────────────────────────────────────────── */
  private dongu = () => {
    this.animId = requestAnimationFrame(this.dongu)
    const simdi = performance.now()
    const dt = Math.min(0.05, (simdi - this.sonKare) / 1000)
    this.sonKare = simdi

    /*  Sürüklenmiyorken çok yavaş dönüyor: TV'de sabit görüntü ölü
     *  duruyor, hızlı dönüş ise okumayı zorlaştırıyor.                 */
    if (!this.surukle) this.aci += dt * 0.03

    this.kamera.position.set(
      Math.sin(this.aci) * this.mesafe,
      this.mesafe * 0.62,
      Math.cos(this.aci) * this.mesafe,
    )
    this.kamera.lookAt(0, 0, 0)
    this.cizici.render(this.sahne, this.kamera)
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
    this.kap.removeEventListener("pointerdown", this.basti)
    this.kap.removeEventListener("pointermove", this.hareket)
    window.removeEventListener("pointerup", this.birakti)
    for (const m of this.nesneler) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this.cizici.dispose()
    this.cizici.domElement.remove()
  }
}
