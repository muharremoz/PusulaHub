export interface AdServer {
  id: number
  name: string
  ip: string
  domain: string
  cpu: number
  ram: number
  disk: number
  totalRamGB: number
  userCount: number
  companyCount: number
  isOnline: boolean
}

export interface WindowsServer {
  id: number
  name: string
  ip: string
  domain: string
  type: string
  cpu: number
  ram: number
  disk: number
  totalRamGB: number
  userCount: number
  companyCount: number
  isOnline: boolean
}

export interface Company {
  id: string
  firkod: string
  firma: string
  email?: string
  phone?: string
  pcName?: string
  userCount?: number
  lastLogin?: string
  lisansBitis?: string
  city?: string
  country?: string
}

export interface ServiceItem {
  id: number
  name: string
  category: string
  folderPath: string
}

export interface SqlServer {
  id: number
  name: string
  ip: string
  port: number
  authType: 'Windows' | 'SQL'
  dbCount: number
  totalSizeGB: number
  isOnline: boolean
}

export interface BackupFile {
  id: number
  fileName: string
  databaseName: string
  fileSizeMB: number
  date: string
  selected: boolean
}

export interface DemoDatabase {
  id: number
  name: string
  dataName: string
  sizeMB: number
  locationType: string
  locationPath: string
}

export interface ExistingAdUser {
  username: string
  displayName: string
  lastLogin?: string
  isDisabled: boolean
}

export interface WizardUser {
  id: number
  username: string
  displayName: string
  email: string
  phone: string
  password: string
  showPassword: boolean
}

// ── Mock Data ──────────────────────────────────────────

export const adServers: AdServer[] = [
  {
    id: 1,
    name: 'DC-PRIMARY',
    ip: '192.168.1.10',
    domain: 'sirket.local',
    cpu: 18,
    ram: 62,
    disk: 45,
    totalRamGB: 32,
    userCount: 248,
    companyCount: 12,
    isOnline: true,
  },
  {
    id: 2,
    name: 'DC-SECONDARY',
    ip: '192.168.1.11',
    domain: 'sirket.local',
    cpu: 8,
    ram: 41,
    disk: 33,
    totalRamGB: 16,
    userCount: 248,
    companyCount: 12,
    isOnline: true,
  },
  {
    id: 3,
    name: 'DC-BRANCH',
    ip: '192.168.2.10',
    domain: 'sube.sirket.local',
    cpu: 0,
    ram: 0,
    disk: 0,
    totalRamGB: 8,
    userCount: 42,
    companyCount: 3,
    isOnline: false,
  },
]

export const windowsServers: WindowsServer[] = [
  {
    id: 10,
    name: 'TS-SERVER-01',
    ip: '192.168.1.20',
    domain: 'ts-server-01.sirket.local',
    type: 'Terminal Server',
    cpu: 45,
    ram: 71,
    disk: 58,
    totalRamGB: 64,
    userCount: 45,
    companyCount: 8,
    isOnline: true,
  },
  {
    id: 11,
    name: 'TS-SERVER-02',
    ip: '192.168.1.21',
    domain: 'ts-server-02.sirket.local',
    type: 'Terminal Server',
    cpu: 29,
    ram: 53,
    disk: 44,
    totalRamGB: 64,
    userCount: 32,
    companyCount: 6,
    isOnline: true,
  },
  {
    id: 12,
    name: 'APP-SERVER-01',
    ip: '192.168.1.30',
    domain: 'app-server-01.sirket.local',
    type: 'Application Server',
    cpu: 12,
    ram: 38,
    disk: 61,
    totalRamGB: 32,
    userCount: 18,
    companyCount: 4,
    isOnline: true,
  },
]

export const companies: Company[] = [
  { id: 'A001', firkod: 'A001', firma: 'Anadolu Teknoloji A.Ş.', email: 'info@anadolutek.com', phone: '0212 555 1234', pcName: 'TS-SERVER-01', userCount: 5, lastLogin: '2026-04-02T14:30:00', lisansBitis: '2027-01-01', city: 'İstanbul', country: 'TR' },
  { id: 'B002', firkod: 'B002', firma: 'Boğaziçi Yazılım Ltd.', email: 'info@bogazi.com', phone: '0216 444 5678', pcName: 'TS-SERVER-01', userCount: 3, lastLogin: '2026-04-01T09:15:00', lisansBitis: '2026-12-31', city: 'İstanbul', country: 'TR' },
  { id: 'C003', firkod: 'C003', firma: 'Cumhuriyet Sigorta A.Ş.', email: 'destek@csigorta.com', phone: '0312 333 9876', pcName: 'TS-SERVER-02', userCount: 8, lastLogin: '2026-04-02T11:00:00', lisansBitis: '2026-06-15', city: 'Ankara', country: 'TR' },
  { id: 'D004', firkod: 'D004', firma: 'Delta İnşaat Grubu', email: 'it@deltains.com.tr', phone: '0232 222 3344', pcName: 'TS-SERVER-02', userCount: 12, lastLogin: '2026-03-28T16:45:00', lisansBitis: '2027-03-01', city: 'İzmir', country: 'TR' },
  { id: 'E005', firkod: 'E005', firma: 'Ege Tarım Kooperatifi', email: '', phone: '0232 888 1122', pcName: '', userCount: 2, lastLogin: undefined, lisansBitis: '2026-09-30', city: 'İzmir', country: 'TR' },
  { id: 'F006', firkod: 'F006', firma: 'Finans Danışmanlık A.Ş.', email: 'info@finans.com', phone: '0212 999 7788', pcName: 'APP-SERVER-01', userCount: 4, lastLogin: '2026-04-01T08:00:00', lisansBitis: '2027-06-01', city: 'İstanbul', country: 'TR' },
  { id: 'G007', firkod: 'G007', firma: 'Güneş Enerji Sistemleri', email: 'destek@gunesenerji.com', phone: '0322 111 4455', pcName: 'TS-SERVER-01', userCount: 6, lastLogin: '2026-03-30T10:30:00', lisansBitis: '2026-11-01', city: 'Adana', country: 'TR' },
  { id: 'H008', firkod: 'H008', firma: 'Horizon Lojistik Ltd.', email: 'it@horizonloj.com', phone: '0216 777 2233', userCount: 0, lisansBitis: '2026-07-31', city: 'İstanbul', country: 'TR' },
  { id: 'K009', firkod: 'K009', firma: 'Karadeniz Tekstil San.', email: 'info@kdztekstil.com', phone: '0462 555 9900', pcName: 'TS-SERVER-02', userCount: 10, lastLogin: '2026-04-02T13:20:00', lisansBitis: '2027-02-28', city: 'Trabzon', country: 'TR' },
  { id: 'M010', firkod: 'M010', firma: 'Marmara Gıda A.Ş.', email: 'sistem@marmagida.com', phone: '0212 444 6677', pcName: 'APP-SERVER-01', userCount: 7, lastLogin: '2026-03-31T15:00:00', lisansBitis: '2026-10-15', city: 'İstanbul', country: 'TR' },
  { id: 'N011', firkod: 'N011', firma: 'Nordik Makine İthalat', email: 'info@nordikmak.com', phone: '0312 666 8899', pcName: 'TS-SERVER-01', userCount: 3, lastLogin: '2026-03-25T09:00:00', lisansBitis: '2027-05-01', city: 'Ankara', country: 'TR' },
  { id: 'P012', firkod: 'P012', firma: 'Pusula Yazılım A.Ş.', email: 'destek@pusula.com', phone: '0212 123 4567', pcName: 'APP-SERVER-01', userCount: 15, lastLogin: '2026-04-03T08:30:00', lisansBitis: '2028-01-01', city: 'İstanbul', country: 'TR' },
  { id: 'R013', firkod: 'R013', firma: 'Rüzgar Gayrimenkul', email: 'it@ruzgargay.com', phone: '0216 333 5566', userCount: 5, lastLogin: '2026-04-02T12:00:00', lisansBitis: '2026-08-31', city: 'İstanbul', country: 'TR' },
  { id: 'S014', firkod: 'S014', firma: 'Sarıkamış Turizm A.Ş.', email: 'info@sarikamis.com', phone: '0474 111 2233', pcName: 'TS-SERVER-02', userCount: 4, lastLogin: '2026-03-20T14:00:00', lisansBitis: '2026-05-01', city: 'Kars', country: 'TR' },
  { id: 'T015', firkod: 'T015', firma: 'Trakya Otomotiv Grup', email: 'sistem@trakyaoto.com', phone: '0282 444 7788', pcName: 'TS-SERVER-01', userCount: 9, lastLogin: '2026-04-01T16:00:00', lisansBitis: '2027-04-01', city: 'Tekirdağ', country: 'TR' },
]

export const serviceItems: ServiceItem[] = [
  // Muhasebe
  { id: 1, name: 'ERP Muhasebe', category: 'Muhasebe', folderPath: 'C:\\Pusula\\Servisler\\ERP\\Muhasebe' },
  { id: 2, name: 'Fatura Yönetimi', category: 'Muhasebe', folderPath: 'C:\\Pusula\\Servisler\\Fatura' },
  { id: 3, name: 'Bütçe Planlama', category: 'Muhasebe', folderPath: 'C:\\Pusula\\Servisler\\Butce' },
  // İnsan Kaynakları
  { id: 4, name: 'Personel Yönetimi', category: 'İnsan Kaynakları', folderPath: 'C:\\Pusula\\Servisler\\IK\\Personel' },
  { id: 5, name: 'Bordro Sistemi', category: 'İnsan Kaynakları', folderPath: 'C:\\Pusula\\Servisler\\IK\\Bordro' },
  { id: 6, name: 'İzin Yönetimi', category: 'İnsan Kaynakları', folderPath: 'C:\\Pusula\\Servisler\\IK\\Izin' },
  // Üretim
  { id: 7, name: 'Üretim Planlama', category: 'Üretim', folderPath: 'C:\\Pusula\\Servisler\\Uretim\\Plan' },
  { id: 8, name: 'Stok Takip', category: 'Üretim', folderPath: 'C:\\Pusula\\Servisler\\Uretim\\Stok' },
  { id: 9, name: 'Kalite Kontrol', category: 'Üretim', folderPath: 'C:\\Pusula\\Servisler\\Uretim\\Kalite' },
  { id: 10, name: 'MRP Modülü', category: 'Üretim', folderPath: 'C:\\Pusula\\Servisler\\Uretim\\MRP' },
  // CRM
  { id: 11, name: 'Müşteri Yönetimi', category: 'CRM', folderPath: 'C:\\Pusula\\Servisler\\CRM\\Musteri' },
  { id: 12, name: 'Satış Takip', category: 'CRM', folderPath: 'C:\\Pusula\\Servisler\\CRM\\Satis' },
  { id: 13, name: 'Teklif Yönetimi', category: 'CRM', folderPath: 'C:\\Pusula\\Servisler\\CRM\\Teklif' },
  // Raporlama
  { id: 14, name: 'Standart Raporlar', category: 'Raporlama', folderPath: 'C:\\Pusula\\Servisler\\Rapor\\Standart' },
  { id: 15, name: 'Dashboard & Analiz', category: 'Raporlama', folderPath: 'C:\\Pusula\\Servisler\\Rapor\\Dashboard' },
]

export const sqlServers: SqlServer[] = [
  {
    id: 100,
    name: 'SQL-PROD',
    ip: '192.168.1.20',
    port: 1433,
    authType: 'Windows',
    dbCount: 24,
    totalSizeGB: 186,
    isOnline: true,
  },
  {
    id: 101,
    name: 'SQL-DEV',
    ip: '192.168.1.22',
    port: 1433,
    authType: 'SQL',
    dbCount: 8,
    totalSizeGB: 42,
    isOnline: true,
  },
]

export const mockBackupFiles: BackupFile[] = [
  { id: 1, fileName: 'ERP_PROD_20260402.bak', databaseName: 'ERP_PROD', fileSizeMB: 4096, date: '2026-04-02', selected: false },
  { id: 2, fileName: 'HR_System_20260401.bak', databaseName: 'HR_System', fileSizeMB: 512, date: '2026-04-01', selected: false },
  { id: 3, fileName: 'CRM_Data_20260402.bak', databaseName: 'CRM_Data', fileSizeMB: 1280, date: '2026-04-02', selected: false },
  { id: 4, fileName: 'WebApp_20260330.bak', databaseName: 'WebApp', fileSizeMB: 256, date: '2026-03-30', selected: false },
]

export const demoDatabases: DemoDatabase[] = [
  { id: 1, name: 'ERP Demo', dataName: 'ERP_DEMO', sizeMB: 850, locationType: 'Yerel', locationPath: 'D:\\Demo Data\\ERP' },
  { id: 2, name: 'CRM Demo', dataName: 'CRM_DEMO', sizeMB: 320, locationType: 'Yerel', locationPath: 'D:\\Demo Data\\CRM' },
  { id: 3, name: 'HR Demo', dataName: 'HR_DEMO', sizeMB: 180, locationType: 'Yerel', locationPath: 'D:\\Demo Data\\HR' },
  { id: 4, name: 'Boş Şablon', dataName: 'EMPTY_TEMPLATE', sizeMB: 12, locationType: 'Şablon', locationPath: '' },
]

export const existingAdUsers: ExistingAdUser[] = [
  { username: 'ahmet.yilmaz', displayName: 'Ahmet Yılmaz', lastLogin: '2026-04-02T14:30:00', isDisabled: false },
  { username: 'fatma.kaya', displayName: 'Fatma Kaya', lastLogin: '2026-04-01T09:00:00', isDisabled: false },
  { username: 'mehmet.demir', displayName: 'Mehmet Demir', lastLogin: '2026-03-28T11:20:00', isDisabled: false },
  { username: 'ayse.celik', displayName: 'Ayşe Çelik', lastLogin: undefined, isDisabled: true },
]

// Setup step simulation
export interface SetupStepDef {
  id: string
  group: string
  label: string
  durationMs: number
}

export const getSetupSteps = (hasSql: boolean): SetupStepDef[] => [
  { id: 's1', group: 'Active Directory', label: "OU oluşturuluyor: Firmalar\\{firma}", durationMs: 1200 },
  { id: 's2', group: 'Active Directory', label: "Güvenlik grubu oluşturuluyor: {firma}_users", durationMs: 900 },
  { id: 's3', group: 'Active Directory', label: "Domain kullanıcıları oluşturuluyor", durationMs: 1800 },
  { id: 's4', group: 'Active Directory', label: "Kullanıcılar gruba ekleniyor", durationMs: 600 },
  { id: 's5', group: 'Dosya Sistemi', label: "Klasör oluşturuluyor: C:\\Pusula\\MUSTERI\\{firma}", durationMs: 400 },
  { id: 's6', group: 'Dosya Sistemi', label: "Hizmet dosyaları kopyalanıyor", durationMs: 2200 },
  { id: 's7', group: 'Dosya Sistemi', label: "Parametre dosyaları güncelleniyor", durationMs: 700 },
  { id: 's8', group: 'Dosya Sistemi', label: "NTFS yetkileri uygulanıyor", durationMs: 500 },
  ...(hasSql ? [
    { id: 's9', group: 'SQL', label: "Veritabanı restore ediliyor", durationMs: 3500 },
    { id: 's10', group: 'SQL', label: "Şirket DB güvenlik kaydı ekleniyor", durationMs: 400 },
  ] : []),
  { id: 's11', group: 'Tamamlama', label: "Kurulum kaydı oluşturuluyor", durationMs: 300 },
]
