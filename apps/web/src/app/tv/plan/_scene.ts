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

/** Kata yerleşecek bir oda — /tv ağacındaki bir gövde */
export interface PlanOda {
  key:   string
  /** Oda yüzeyine yazılan ad — "DATACENTER" */
  ad:    string
  /** Gövdedeki monitör sayısı; odanın büyüklüğünü belirliyor */
  adet:  number
}

/**
 * Bant düzeni: her bantta kaç oda olacağı.
 *
 * Odalar tek sıraya dizilirse plan bir şerit gibi duruyor; iki-ikili
 * bantlar referanstaki ofis kat planı okumasını veriyor. Son bantta tek
 * oda kalırsa ortalanıyor ve bilerek geniş bırakılıyor — boşluk
 * doldurmaya çalışmak yamuk bir hizalama üretiyordu.
 */
const BANT_DERINLIK = 4.4
const BANT_ARALIK   = 0.9

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
  /** Odalar ayrı tutuluyor: veri değişince yalnız bunlar yenileniyor */
  private odaNesneleri: THREE.Mesh[] = []
  private odaDokulari: THREE.CanvasTexture[] = []

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

  /**
   * Odaları kur / yenile.
   *
   * Veri değişince (monitör eklenince, gövde boşalınca) eski odalar
   * atılıp yenileri kuruluyor. Oda sayısı tek haneli, yeniden kurmak
   * güncellemeden basit ve her karede değil yalnız veri değişince oluyor.
   */
  guncelle(odalar: PlanOda[]) {
    for (const m of this.odaNesneleri) {
      this.sahne.remove(m)
      m.geometry.dispose()
      const mat = m.material
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat.dispose()
    }
    this.odaNesneleri = []
    for (const d of this.odaDokulari) d.dispose()
    this.odaDokulari = []

    if (!odalar.length) return

    /*  Bordürün içinde kalan kullanılabilir alan.                      */
    const icEn = EN - BORDUR_EN * 2 - KORIDOR * 2

    /*  İkişerli bantlar; tek kalan son bantta yalnız başına.           */
    const bantlar: PlanOda[][] = []
    for (let i = 0; i < odalar.length; i += 2) bantlar.push(odalar.slice(i, i + 2))

    const toplamZ = bantlar.length * BANT_DERINLIK + (bantlar.length - 1) * BANT_ARALIK
    let z = -toplamZ / 2 + BANT_DERINLIK / 2

    for (const bant of bantlar) {
      /*  Genişlik monitör sayısıyla orantılı: kalabalık gövde büyük oda.
       *  Taban pay veriliyor, yoksa tek monitörlü gövde çizgiye
       *  dönüşüyor ve adı sığmıyor.                                    */
      const agirlik = bant.map((o) => 1 + o.adet)
      const toplamA = agirlik.reduce((a, b) => a + b, 0)
      const kullanilabilir = icEn - KORIDOR * (bant.length - 1)

      let x = -(kullanilabilir + KORIDOR * (bant.length - 1)) / 2
      bant.forEach((oda, i) => {
        const w = (agirlik[i] / toplamA) * kullanilabilir
        this.odaKur(oda, x + w / 2, z, w, BANT_DERINLIK)
        x += w + KORIDOR
      })

      z += BANT_DERINLIK + BANT_ARALIK
    }
  }

  /**
   * Tek oda: gövde + üst yüzeye YATIK ad.
   *
   * Ad, üst yüze doku olarak basılıyor — havada duran bir etiket değil,
   * zeminle aynı düzlemde duran yazı. Referansı kat planı gibi gösteren
   * asıl şey bu.
   */
  private odaKur(oda: PlanOda, x: number, z: number, w: number, d: number) {
    const doku = this.adDokusu(oda.ad, w, d)
    this.odaDokulari.push(doku)

    const yan = new THREE.MeshStandardMaterial({ color: RENK.oda, roughness: 0.85, metalness: 0.02 })
    const ust = new THREE.MeshStandardMaterial({ map: doku, roughness: 0.8, metalness: 0.02 })
    /*  BoxGeometry malzeme sırası: +x, -x, +y, -y, +z, -z.
     *  Yalnız ÜST yüz (+y, indis 2) dokulu.                            */
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, ODA_Y, d),
      [yan, yan, ust, yan, yan, yan],
    )
    m.position.set(x, ODA_Y / 2, z)
    m.castShadow = true
    m.receiveShadow = true
    m.userData.key = oda.key
    this.sahne.add(m)
    this.odaNesneleri.push(m)
  }

  /**
   * Oda üst yüzü için doku: zemin rengi + ortada ad.
   *
   * Çözünürlük odanın dünya boyutuyla orantılı (birim başına sabit
   * piksel): büyük odada yazı bulanıklaşmıyor, küçük odada boşuna
   * bellek harcanmıyor.
   */
  private adDokusu(ad: string, w: number, d: number): THREE.CanvasTexture {
    const PX = 64
    const c = document.createElement("canvas")
    c.width  = Math.round(w * PX)
    c.height = Math.round(d * PX)
    const ctx = c.getContext("2d")!

    ctx.fillStyle = `#${RENK.oda.toString(16).padStart(6, "0")}`
    ctx.fillRect(0, 0, c.width, c.height)

    ctx.fillStyle = "#B8BEC8"
    ctx.font = `600 ${Math.round(PX * 0.42)}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    /*  Harf aralığı: uzaktan bakılan bir planda sıkışık yazı okunmuyor. */
    ctx.letterSpacing = "3px"
    ctx.fillText(ad.toLocaleUpperCase("tr"), c.width / 2, c.height / 2)

    const t = new THREE.CanvasTexture(c)
    /*  Üst yüz UV'si dünya ekseniyle ters dönüyor; yazı baş aşağı
     *  çıkmasın diye çevriliyor.                                       */
    t.center.set(0.5, 0.5)
    t.rotation = Math.PI
    t.anisotropy = 4
    return t
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
    for (const m of [...this.nesneler, ...this.odaNesneleri]) {
      m.geometry.dispose()
      const mat = m.material
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat.dispose()
    }
    for (const d of this.odaDokulari) d.dispose()
    this.cizici.dispose()
    this.cizici.domElement.remove()
  }
}
