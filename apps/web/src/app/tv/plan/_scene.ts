/**
 * Kat planı sahnesi — saf three.js.
 *
 * ── Şu an ne var? ──────────────────────────────────────────────────────
 * BOŞ BİR KAT: zemin + dört duvar. Odalar (sunucu blokları) bilerek yok.
 * Adım adım kuruyoruz; önce mekânın kendisi doğru görünsün, sonra içi
 * doldurulsun. Bir önceki sürümde bloklar vardı ama mekân yoktu ve sonuç
 * kat planı gibi değil, havada duran kutular gibi okunuyordu.
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
  /** Zeminin üst yüzü — odalar bunun üstüne oturacak */
  zemin:      0x2b3038,
  /** Zemin plakasının yan yüzü; üstten koyu olunca kalınlık hissi doğuyor */
  zeminKenar: 0x1d2025,
  /** Duvar gövdesi */
  duvar:      0x3a404a,
  /** Duvar üst kenarı — ince açık şerit, siluet koyu sahnede kaybolmasın */
  duvarUst:   0x4d545f,
  /** Cam kanat — soğuk ve saydam */
  cam:        0x8fc7de,
  /** Kapı çerçevesi/dikmeleri — duvardan açık, cam kenarını çiziyor */
  cerceve:    0x59616d,
  /** Saksı — zeminden biraz açık, gövdesi seçilsin */
  saksi:      0x39404a,
  /** Yaprak; iki ton arasında değişiyor, hepsi tek renk olunca yapay duruyor */
  yaprakA:    0x2f7d52,
  yaprakB:    0x3f9a63,
} as const

/* Kat ölçüleri (dünya birimi) — odalar geldiğinde ızgara buna göre kurulacak */
const EN        = 20
const BOY       = 14
const KALINLIK  = 0.4     // zemin plakası
const DUVAR_KAL = 0.18

/**
 * Duvar yüksekliği bilerek DÜŞÜK.
 *
 * Tam boy duvar üstten bakışta içeriyi kapatıyor ve kat bir kutuya
 * dönüşüyor. Alçak duvar mekânı çevreliyor ama içerisi tamamen görünür
 * kalıyor — mimari maketlerin mantığı.
 */
const DUVAR_Y = 1.15

/**
 * Ön ve arka duvarın ortasındaki cam kapı.
 *
 * Genişlik kat eninin dörtte biri: dar bir aralık duvarda kaza gibi
 * duruyordu, bu ölçüde giriş olduğu belli oluyor. Kapı duvarın TAM
 * yüksekliğinde — alçak duvarda daha kısa bir kapı orantısız görünüyor.
 */
const KAPI_EN    = EN / 4
/** Cam, duvardan ince: kanat çerçevenin içine gömülü dursun */
const CAM_KAL    = DUVAR_KAL * 0.45
/** Dikme ve orta kayıt — kapıyı çift kanatlı gösteriyor */
const CERCEVE    = 0.09

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
    this.katKur()

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
    ana.position.set(14, 22, 10)
    ana.castShadow = true
    ana.shadow.mapSize.set(2048, 2048)
    ana.shadow.camera.left   = -26
    ana.shadow.camera.right  =  26
    ana.shadow.camera.top    =  26
    ana.shadow.camera.bottom = -26
    ana.shadow.camera.far    =  80
    /*  Gölge aknesi (yüzeyde çizgi çizgi lekeler) için küçük kaydırma. */
    ana.shadow.bias = -0.0006
    this.sahne.add(ana)

    const dolgu = new THREE.DirectionalLight(0xffffff, 0.35)
    dolgu.position.set(-12, 8, -10)
    this.sahne.add(dolgu)
  }

  /* ── Zemin + dört duvar ────────────────────────────────────────── */
  private katKur() {
    /*  Zemin iki parça: alttaki koyu plaka kalınlığı, üstteki ince
     *  yüzey de odaların oturacağı düzlemi veriyor. Tek parça kutuda
     *  yan yüz ile üst yüz aynı renk oluyor ve plaka kâğıt gibi
     *  duruyordu.                                                      */
    const plaka = this.kutu(EN, KALINLIK, BOY, RENK.zeminKenar)
    plaka.position.y = -KALINLIK / 2
    plaka.receiveShadow = true

    const yuzey = this.kutu(EN - 0.06, 0.04, BOY - 0.06, RENK.zemin)
    yuzey.position.y = 0.02
    yuzey.receiveShadow = true

    /*  Duvarlar zeminin KENARINA oturuyor: dıştan bakınca plaka ile
     *  duvar tek gövde gibi görünsün.                                  */
    const yariEn  = EN / 2 - DUVAR_KAL / 2
    const yariBoy = BOY / 2 - DUVAR_KAL / 2

    /*  Ön/arka duvarlar tam genişlikte ama ORTALARI açık: oraya cam
     *  kapı giriyor. Yan duvarlar aradaki farkı tamamlıyor — köşelerde
     *  ne boşluk ne de üst üste binme kalıyor.                          */
    this.kapiliDuvar(-yariBoy)
    this.kapiliDuvar( yariBoy)
    this.duvar(DUVAR_KAL, BOY - DUVAR_KAL * 2, -yariEn, 0)
    this.duvar(DUVAR_KAL, BOY - DUVAR_KAL * 2,  yariEn, 0)

    this.bitkileriKur()
  }

  /**
   * Yan duvarların dibine saksılı bitkiler.
   *
   * Kat boş bir tepsiye benziyordu; bitkiler ölçek veriyor — yanlarında
   * duran şeye bakınca duvarın ne kadar yüksek olduğu anlaşılıyor. Ayrıca
   * odalar geldiğinde aradaki koridor boşluklarını doldurmuş oluyorlar.
   *
   * Yalnız YAN duvarlarda: ön/arka duvarların ortası kapı, oraya bitki
   * koymak girişi tıkamak olurdu.
   */
  private bitkileriKur() {
    const x = EN / 2 - 0.85
    const adet = 4
    /*  Bitkiler duvar boyunca EŞİT DAĞILMIYOR, uçlara kümeleniyor:
     *  boydan boya dizilince süs değil sınır çizgisi gibi duruyorlardı.
     *
     *  İki küme ÇAPRAZ: sol duvardakiler ön uçta, sağ duvardakiler arka
     *  uçta. Aynı hizada olunca kat simetrik ve durgun görünüyordu;
     *  çapraz yerleşim göze bir yön veriyor ve katın iki ucunu birden
     *  canlandırıyor.                                                   */
    const uc  = BOY / 2 - 1.3   // uçtan içeri
    const ara = 0.85            // aralarındaki mesafe
    for (let i = 0; i < adet; i++) {
      this.bitki(-x,  uc - i * ara, i)          // sol duvar → ön uç
      this.bitki( x, -uc + i * ara, i + adet)   // sağ duvar → arka uç
    }
  }

  /**
   * Tek saksı: konik gövde + üç düşük poligonlu yaprak kümesi.
   *
   * `flatShading` bilerek: yüzeyler ayrı ayrı ışık aldığı için küçük
   * nesnede bile hacim okunuyor, pürüzsüz küre koyu sahnede yassı bir
   * leke gibi duruyordu.
   */
  private bitki(x: number, z: number, tohum: number) {
    /*  Deterministik "rastgelelik": her yenilemede aynı görünsün.      */
    const r = (n: number) => (Math.sin(tohum * 12.9898 + n * 78.233) + 1) / 2

    const saksiY = 0.26 + r(1) * 0.06
    const saksi = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, saksiY, 8),
      new THREE.MeshStandardMaterial({ color: RENK.saksi, roughness: 0.9, flatShading: true }),
    )
    saksi.position.set(x, saksiY / 2, z)
    saksi.castShadow = true
    saksi.receiveShadow = true
    this.sahne.add(saksi)
    this.nesneler.push(saksi)

    const yaprakRenk = r(2) > 0.5 ? RENK.yaprakA : RENK.yaprakB
    for (let k = 0; k < 3; k++) {
      const boyut = 0.17 + r(k + 3) * 0.1
      const yaprak = new THREE.Mesh(
        new THREE.IcosahedronGeometry(boyut, 0),
        new THREE.MeshStandardMaterial({ color: yaprakRenk, roughness: 0.75, flatShading: true }),
      )
      yaprak.position.set(
        x + (r(k + 6) - 0.5) * 0.24,
        saksiY + 0.1 + k * 0.13,
        z + (r(k + 9) - 0.5) * 0.24,
      )
      yaprak.rotation.set(r(k + 12) * 3, r(k + 15) * 3, 0)
      yaprak.castShadow = true
      this.sahne.add(yaprak)
      this.nesneler.push(yaprak)
    }
  }

  /**
   * Ortasında cam kapı olan uzun duvar.
   *
   * Duvar ikiye bölünüyor, aradaki boşluğa tek parça cam giriyor.
   * Kapının ÜSTÜ tamamen açık: üzerinden lento geçirmek girişi bir
   * pencere gibi gösteriyordu, oysa burası boydan boya bir açıklık.
   * Üstteki açık şerit de bu yüzden yalnız duvar parçalarının üzerinde.
   */
  private kapiliDuvar(z: number) {
    const parca = (EN - KAPI_EN) / 2
    const kayma = (KAPI_EN + parca) / 2

    this.duvar(parca, DUVAR_KAL, -kayma, z, false)
    this.duvar(parca, DUVAR_KAL,  kayma, z, false)

    /*  Üst şerit kapı boşluğunda kesiliyor — iki ayrı parça.           */
    for (const x of [-kayma, kayma]) {
      const ust = this.kutu(parca, 0.05, DUVAR_KAL, RENK.duvarUst)
      ust.position.set(x, DUVAR_Y + 0.02, z)
    }

    this.camKapi(z)
  }

  private camKapi(z: number) {
    /*  Cam gölge DÜŞÜRMÜYOR: saydam yüzeyin opak bir gölge bırakması
     *  kapıyı duvar gibi gösteriyordu.                                  */
    const cam = new THREE.Mesh(
      new THREE.BoxGeometry(KAPI_EN - CERCEVE * 2, DUVAR_Y - 0.06, CAM_KAL),
      new THREE.MeshPhysicalMaterial({
        color: RENK.cam,
        transparent: true,
        opacity: 0.22,
        roughness: 0.06,
        metalness: 0,
        /*  Hafif yansıma cama "yüzey" hissi veriyor; olmayınca renkli
         *  bir tül gibi duruyor.                                        */
        clearcoat: 0.8,
        clearcoatRoughness: 0.1,
      }),
    )
    cam.position.set(0, (DUVAR_Y - 0.06) / 2, z)
    this.sahne.add(cam)
    this.nesneler.push(cam)

    /*  Yalnız iki kenar dikmesi. Ortada kayıt vardı ve camı ikiye
     *  bölüyordu; tek parça cam daha temiz duruyor.                    */
    for (const x of [-KAPI_EN / 2 + CERCEVE / 2, KAPI_EN / 2 - CERCEVE / 2]) {
      const dikme = this.kutu(CERCEVE, DUVAR_Y, DUVAR_KAL * 0.9, RENK.cerceve)
      dikme.position.set(x, DUVAR_Y / 2, z)
      dikme.castShadow = true
    }
  }

  private duvar(w: number, d: number, x: number, z: number, ustSerit = true) {
    const g = this.kutu(w, DUVAR_Y, d, RENK.duvar)
    g.position.set(x, DUVAR_Y / 2, z)
    g.castShadow = true
    g.receiveShadow = true

    if (ustSerit) {
      const ust = this.kutu(w, 0.05, d, RENK.duvarUst)
      ust.position.set(x, DUVAR_Y + 0.02, z)
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
