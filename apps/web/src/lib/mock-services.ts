export type ServiceCategory = "Yazılım" | "Entegrasyon" | "API";
export type ServiceStatus   = "active" | "maintenance" | "inactive";

export interface PusulaService {
  id: string;
  name: string;
  description: string;
  category: ServiceCategory;
  status: ServiceStatus;
  version: string;
  firmCount: number;
  tags: string[];
  updatedAt: string;
}

export const mockServices: PusulaService[] = [
  /* ── Yazılımlar ── */
  {
    id: "p01",
    name: "PusulaERP",
    description: "Kurumsal kaynak planlama yazılımı. Stok, satış, satın alma ve üretim modülleri.",
    category: "Yazılım",
    status: "active",
    version: "4.2.1",
    firmCount: 8,
    tags: ["ERP", "Stok", "Satış"],
    updatedAt: "28.03.2026",
  },
  {
    id: "p02",
    name: "PusulaHR",
    description: "İnsan kaynakları ve bordro yönetim sistemi. İzin, puantaj ve SGK entegrasyonu.",
    category: "Yazılım",
    status: "active",
    version: "2.8.0",
    firmCount: 6,
    tags: ["İK", "Bordro", "SGK"],
    updatedAt: "15.03.2026",
  },
  {
    id: "p03",
    name: "PusulaCRM",
    description: "Müşteri ilişkileri yönetimi. Teklif, sipariş ve müşteri takip modülleri.",
    category: "Yazılım",
    status: "active",
    version: "3.1.4",
    firmCount: 5,
    tags: ["CRM", "Teklif", "Müşteri"],
    updatedAt: "20.03.2026",
  },
  {
    id: "p04",
    name: "PusulaFinance",
    description: "Muhasebe ve finansal raporlama yazılımı. Genel muhasebe ve bütçe yönetimi.",
    category: "Yazılım",
    status: "maintenance",
    version: "1.9.2",
    firmCount: 4,
    tags: ["Muhasebe", "Finans"],
    updatedAt: "01.04.2026",
  },
  {
    id: "p05",
    name: "PusulaDepo",
    description: "Depo ve lojistik yönetim sistemi. Sevkiyat, barkod ve lokasyon takibi.",
    category: "Yazılım",
    status: "active",
    version: "2.3.0",
    firmCount: 3,
    tags: ["Depo", "Lojistik", "Barkod"],
    updatedAt: "10.03.2026",
  },

  /* ── Entegrasyonlar ── */
  {
    id: "e01",
    name: "E-Fatura Entegrasyonu",
    description: "GİB üzerinden e-fatura kesme ve alımı. UBL-TR 1.2 standardı.",
    category: "Entegrasyon",
    status: "active",
    version: "1.5.0",
    firmCount: 12,
    tags: ["GİB", "E-Fatura", "UBL-TR"],
    updatedAt: "25.03.2026",
  },
  {
    id: "e02",
    name: "E-İrsaliye Entegrasyonu",
    description: "Elektronik irsaliye düzenleme ve arşivleme. GİB uyumlu.",
    category: "Entegrasyon",
    status: "active",
    version: "1.2.1",
    firmCount: 9,
    tags: ["GİB", "E-İrsaliye"],
    updatedAt: "22.03.2026",
  },
  {
    id: "e03",
    name: "Logo Tiger Entegrasyonu",
    description: "Logo Tiger ERP sistemiyle çift yönlü veri senkronizasyonu.",
    category: "Entegrasyon",
    status: "active",
    version: "3.0.2",
    firmCount: 4,
    tags: ["Logo", "ERP", "Senkron"],
    updatedAt: "18.03.2026",
  },
  {
    id: "e04",
    name: "Mikro Entegrasyonu",
    description: "Mikro muhasebe yazılımıyla hesap ve cari senkronizasyonu.",
    category: "Entegrasyon",
    status: "inactive",
    version: "2.1.0",
    firmCount: 2,
    tags: ["Mikro", "Muhasebe"],
    updatedAt: "05.02.2026",
  },
  {
    id: "e05",
    name: "Banka Entegrasyonu",
    description: "Çoklu banka hesap hareketleri ve otomatik mutabakat. İş, Garanti, Yapı Kredi.",
    category: "Entegrasyon",
    status: "active",
    version: "2.4.0",
    firmCount: 7,
    tags: ["Banka", "Ödeme", "Mutabakat"],
    updatedAt: "30.03.2026",
  },
  {
    id: "e06",
    name: "E-Arşiv Entegrasyonu",
    description: "E-arşiv fatura oluşturma ve portal yükleme. GİB onaylı.",
    category: "Entegrasyon",
    status: "maintenance",
    version: "1.1.3",
    firmCount: 6,
    tags: ["GİB", "E-Arşiv"],
    updatedAt: "02.04.2026",
  },

  /* ── API'ler ── */
  {
    id: "a01",
    name: "Pusula REST API",
    description: "Tüm Pusula modüllerine JSON tabanlı RESTful erişim. OAuth 2.0 kimlik doğrulama.",
    category: "API",
    status: "active",
    version: "v3",
    firmCount: 10,
    tags: ["REST", "OAuth", "JSON"],
    updatedAt: "01.04.2026",
  },
  {
    id: "a02",
    name: "Webhook Servisi",
    description: "Gerçek zamanlı olay bildirimleri. Sipariş, ödeme ve stok tetikleyicileri.",
    category: "API",
    status: "active",
    version: "v2",
    firmCount: 5,
    tags: ["Webhook", "Realtime", "Event"],
    updatedAt: "28.03.2026",
  },
  {
    id: "a03",
    name: "Data Sync API",
    description: "Delta bazlı veri senkronizasyonu. Üçüncü parti sistemlerle entegrasyon için.",
    category: "API",
    status: "active",
    version: "v1",
    firmCount: 3,
    tags: ["Senkron", "Delta", "ETL"],
    updatedAt: "15.03.2026",
  },
];
