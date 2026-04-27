/**
 * Mesajlar sayfası "Hazır Mesajlar" — sık kullanılan sistem/duyuru mesajları.
 * Kullanıcı compose dialog'unda hazır mesaj seçtiğinde subject/body/type/priority
 * formu ile doldurulur. Gönderim öncesi serbestçe düzenlenebilir.
 */

export type MsgType     = "info" | "warning" | "urgent"
export type MsgPriority = "normal" | "high" | "urgent"

export interface PresetMessage {
  id:          string
  title:       string   // Listede görünen kısa ad
  description: string   // Kısa açıklama (kartta 2. satır)
  subject:     string   // Mesaj konusu
  body:        string   // Mesaj metni
  type:        MsgType
  priority:    MsgPriority
}

export const PRESET_MESSAGES: PresetMessage[] = [
  {
    id: "maintenance-scheduled",
    title: "Planlı Bakım",
    description: "Belirlenen saatte sistem erişime kapanacak",
    subject: "Planlı Bakım Bildirimi",
    body: "Sistem bakımı nedeniyle bugün saat [SAAT] itibarıyla sunucularımız yaklaşık [SÜRE] süreyle erişime kapanacaktır. Lütfen açık belgelerinizi kaydedip oturumunuzu güvenli şekilde kapatınız. Anlayışınız için teşekkür ederiz.",
    type: "warning",
    priority: "high",
  },
  {
    id: "restart-soon",
    title: "Sunucu Yeniden Başlatma",
    description: "Sunucu kısa süre içinde yeniden başlatılacak",
    subject: "Sunucu Yeniden Başlatılıyor",
    body: "Sunucumuz [SÜRE] dakika içinde güncelleme sonrası yeniden başlatılacaktır. Lütfen açık belgelerinizi kaydedip oturumunuzu kapatınız. Tekrar bağlantı sağlayabilirsiniz.",
    type: "warning",
    priority: "urgent",
  },
  {
    id: "save-work",
    title: "Çalışmalarınızı Kaydedin",
    description: "Acil durum — belgeleri kaydetme uyarısı",
    subject: "Lütfen Çalışmalarınızı Kaydedin",
    body: "Kısa süre içinde sistemde kritik bir işlem yapılacaktır. Lütfen açık olan tüm belgelerinizi ve programlarınızı hemen kaydedip oturumunuzu güvenli şekilde kapatınız.",
    type: "urgent",
    priority: "urgent",
  },
  {
    id: "login-required",
    title: "Oturum Kapatma",
    description: "Kullanıcıları çıkış yapmaya davet",
    subject: "Oturumunuzu Kapatmanız Rica Olunur",
    body: "Sistem üzerinde rutin kontrol işlemleri yapılacağından lütfen şu anki oturumunuzu kapatınız. İşlem tamamlandıktan sonra tekrar giriş yapabilirsiniz. Yaklaşık süre: [SÜRE].",
    type: "info",
    priority: "normal",
  },
  {
    id: "internet-issue",
    title: "İnternet / Bağlantı Sorunu",
    description: "Genel erişim sorunu duyurusu",
    subject: "Bağlantı Sorunu Bildirimi",
    body: "Şu an internet hattımızda / sunucu bağlantımızda geçici bir sorun yaşanmaktadır. Teknik ekibimiz konuyla ilgilenmektedir. Sorun çözüldüğünde tekrar bilgi verilecektir. Anlayışınız için teşekkürler.",
    type: "warning",
    priority: "high",
  },
  {
    id: "printer-issue",
    title: "Yazıcı / Ağ Uyarısı",
    description: "Yazıcı veya paylaşım erişimi uyarısı",
    subject: "Yazıcı / Paylaşım Geçici Olarak Kullanılamıyor",
    body: "Sistem üzerinde yapılan bir bakım nedeniyle yazıcı ve paylaşılan klasörlere erişim geçici olarak kapalıdır. Yaklaşık [SÜRE] dakika içinde hizmete açılacaktır.",
    type: "info",
    priority: "normal",
  },
  {
    id: "password-change",
    title: "Şifre Değişikliği",
    description: "Şifre yenileme isteği / politika",
    subject: "Şifrenizi Güncellemeniz Gerekiyor",
    body: "Güvenlik politikamız gereği şifrenizin güncellenmesi gerekmektedir. Lütfen Ctrl+Alt+Del → Şifre Değiştir adımını izleyerek en az 8 karakter, büyük/küçük harf ve rakam içeren bir şifre belirleyiniz.",
    type: "info",
    priority: "normal",
  },
  {
    id: "backup-running",
    title: "Yedekleme Çalışıyor",
    description: "Yavaşlama yaşanabilir bilgilendirmesi",
    subject: "Yedekleme İşlemi Devam Ediyor",
    body: "Şu an sistem genelinde yedekleme işlemi çalışmaktadır. Bu süre içinde sistem performansında geçici bir yavaşlama hissedebilirsiniz. İşlem tamamlandığında performans normale dönecektir.",
    type: "info",
    priority: "normal",
  },
  {
    id: "security-alert",
    title: "Güvenlik Uyarısı",
    description: "Şüpheli aktivite veya e-posta bildirimi",
    subject: "Güvenlik Uyarısı",
    body: "Son zamanlarda sahte e-posta ve zararlı dosya paylaşımlarında artış görülmektedir. Lütfen tanımadığınız gönderenlerden gelen ekleri açmayınız, şüpheli linklere tıklamayınız ve şüphe duyduğunuz durumlarda teknik ekibe bildiriniz.",
    type: "urgent",
    priority: "high",
  },
  {
    id: "general-announcement",
    title: "Genel Duyuru",
    description: "Serbest içerik için boş şablon",
    subject: "Duyuru",
    body: "Değerli çalışanlarımız,\n\n[İÇERİK]\n\nBilginize sunulur.",
    type: "info",
    priority: "normal",
  },
]
