export interface DetailSession {
  id: string;
  username: string;
  logonTime: string;
  duration: string;
  type: "RDP" | "Console";
}

export interface DetailCompanyUser {
  username: string;
  fullName: string;
  password: string;
  status: "active" | "disabled";
  lastLogin: string;
}

export interface DetailCompany {
  firmaId: string;
  firmaName: string;
  userCount: number;
  users: DetailCompanyUser[];
}

export interface DetailUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  ou: string;
  status: "active" | "disabled" | "locked";
  lastLogin: string;
}

export interface NetworkAdapter {
  name: string;
  ip: string;
  mac: string;
  speed: string;
  status: string;
}

export interface OpenPort {
  port: number;
  protocol: string;
  process: string;
  pid: number;
}

export interface ShareFolder {
  name: string;
  path: string;
  access: string;
}

export interface FirewallRule {
  name: string;
  direction: "In" | "Out";
  action: "Allow" | "Block";
  enabled: boolean;
}

export interface DetailSecurity {
  firewall: { enabled: boolean; rulesCount: number };
  roles: string[];
  adapters: NetworkAdapter[];
  ports: OpenPort[];
  shares: ShareFolder[];
  firewallRules: FirewallRule[];
}

export interface LogEvent {
  id: string;
  time: string;
  level: "Info" | "Warning" | "Error";
  source: string;
  message: string;
}

export interface FailedLogin {
  time: string;
  username: string;
  ip: string;
}

export interface DetailLogs {
  events: LogEvent[];
  failedLogins: FailedLogin[];
}

export interface WeeklyStat {
  day: string;
  cpu: number;
  ram: number;
  disk: number;
  sessions: number;
}

export interface ServerDetail {
  sessions: DetailSession[];
  companies: DetailCompany[];
  users: DetailUser[];
  security: DetailSecurity;
  logs: DetailLogs;
  weeklyStats: WeeklyStat[];
}

export function getServerDetail(id: string): ServerDetail {
  return {
    sessions: [
      { id: "ses-1", username: "K001.ahmet", logonTime: "03.04.2026 09:14", duration: "2s 34d", type: "RDP" },
      { id: "ses-2", username: "K002.mehmet", logonTime: "03.04.2026 08:52", duration: "2s 56d", type: "RDP" },
      { id: "ses-3", username: "K003.ayse", logonTime: "02.04.2026 10:01", duration: "1s 12d", type: "RDP" },
      { id: "ses-4", username: "K004.fatma", logonTime: "01.04.2026 07:30", duration: "3s 43d", type: "Console" },
      { id: "ses-5", username: "K005.ali", logonTime: "03.04.2026 11:20", duration: "0s 48d", type: "RDP" },
    ],
    companies: [
      {
        firmaId: "F001",
        firmaName: "Alfa Teknoloji A.Ş.",
        userCount: 3,
        users: [
          { username: "K001.ahmet", fullName: "Ahmet Yılmaz", password: "P@ssw0rd1", status: "active", lastLogin: "Bugün 09:14" },
          { username: "K001.zeynep", fullName: "Zeynep Kaya", password: "Zeynep123!", status: "active", lastLogin: "Dün 16:42" },
          { username: "K001.hasan", fullName: "Hasan Demir", password: "Hasan!456", status: "disabled", lastLogin: "15 gün önce" },
        ],
      },
      {
        firmaId: "F002",
        firmaName: "Beta Yazılım Ltd.",
        userCount: 2,
        users: [
          { username: "K002.mehmet", fullName: "Mehmet Çelik", password: "Mehmet@789", status: "active", lastLogin: "Bugün 08:52" },
          { username: "K002.selin", fullName: "Selin Arslan", password: "Selin#321", status: "active", lastLogin: "Dün 10:15" },
        ],
      },
      {
        firmaId: "F003",
        firmaName: "Gamma Lojistik A.Ş.",
        userCount: 2,
        users: [
          { username: "K003.ayse", fullName: "Ayşe Şahin", password: "Ayse@654", status: "active", lastLogin: "Bugün 10:01" },
          { username: "K003.burak", fullName: "Burak Koç", password: "Burak!987", status: "disabled", lastLogin: "30 gün önce" },
        ],
      },
      {
        firmaId: "F004",
        firmaName: "Delta Danışmanlık",
        userCount: 3,
        users: [
          { username: "K004.fatma", fullName: "Fatma Güneş", password: "Fatma@111", status: "active", lastLogin: "Bugün 07:30" },
          { username: "K004.emre", fullName: "Emre Doğan", password: "Emre#222", status: "active", lastLogin: "Dün 14:20" },
          { username: "K004.nilay", fullName: "Nilay Tekin", password: "Nilay!333", status: "active", lastLogin: "2 gün önce" },
        ],
      },
    ],
    users: [
      { id: "u1", username: "ahmet.yilmaz", displayName: "Ahmet Yılmaz", email: "ahmet@sirket.local", ou: "Muhasebe", status: "active", lastLogin: "Bugün 09:14" },
      { id: "u2", username: "mehmet.celik", displayName: "Mehmet Çelik", email: "mehmet@sirket.local", ou: "Satış", status: "active", lastLogin: "Bugün 08:52" },
      { id: "u3", username: "ayse.sahin", displayName: "Ayşe Şahin", email: "ayse@sirket.local", ou: "IT", status: "active", lastLogin: "Bugün 10:01" },
      { id: "u4", username: "fatma.gunes", displayName: "Fatma Güneş", email: "fatma@sirket.local", ou: "İK", status: "active", lastLogin: "Bugün 07:30" },
      { id: "u5", username: "hasan.demir", displayName: "Hasan Demir", email: "hasan@sirket.local", ou: "Muhasebe", status: "disabled", lastLogin: "15 gün önce" },
      { id: "u6", username: "zeynep.kaya", displayName: "Zeynep Kaya", email: "zeynep@sirket.local", ou: "Satış", status: "active", lastLogin: "Dün 16:42" },
      { id: "u7", username: "burak.koc", displayName: "Burak Koç", email: "burak@sirket.local", ou: "Lojistik", status: "locked", lastLogin: "30 gün önce" },
      { id: "u8", username: "selin.arslan", displayName: "Selin Arslan", email: "selin@sirket.local", ou: "IT", status: "active", lastLogin: "Dün 10:15" },
    ],
    security: {
      firewall: { enabled: true, rulesCount: 24 },
      roles: ["Active Directory", "DNS Server", "DHCP Server"],
      adapters: [
        { name: "Ethernet 1", ip: "192.168.1.10", mac: "00:1A:2B:3C:4D:5E", speed: "1 Gbps", status: "Bağlı" },
        { name: "Ethernet 2", ip: "10.0.0.10", mac: "00:1A:2B:3C:4D:5F", speed: "1 Gbps", status: "Bağlı" },
      ],
      ports: [
        { port: 80, protocol: "TCP", process: "http.sys", pid: 4 },
        { port: 443, protocol: "TCP", process: "http.sys", pid: 4 },
        { port: 3389, protocol: "TCP", process: "TermService", pid: 1124 },
        { port: 5985, protocol: "TCP", process: "WinRM", pid: 868 },
        { port: 1433, protocol: "TCP", process: "sqlservr.exe", pid: 2048 },
        { port: 53, protocol: "UDP", process: "dns.exe", pid: 1512 },
        { port: 389, protocol: "TCP", process: "lsass.exe", pid: 640 },
        { port: 636, protocol: "TCP", process: "lsass.exe", pid: 640 },
      ],
      shares: [
        { name: "NETLOGON", path: "C:\\Windows\\SYSVOL\\sysvol\\sirket.local\\scripts", access: "Herkes - Okuma" },
        { name: "SYSVOL", path: "C:\\Windows\\SYSVOL\\sysvol", access: "Herkes - Okuma" },
        { name: "Belgeler", path: "D:\\Paylaşılan\\Belgeler", access: "Domain Users - Yazma" },
        { name: "Yedekler", path: "E:\\Yedekler", access: "Yöneticiler - Tam Kontrol" },
      ],
      firewallRules: [
        { name: "RDP (Uzak Masaüstü)", direction: "In", action: "Allow", enabled: true },
        { name: "WinRM HTTP", direction: "In", action: "Allow", enabled: true },
        { name: "DNS (UDP)", direction: "In", action: "Allow", enabled: true },
        { name: "LDAP", direction: "In", action: "Allow", enabled: true },
        { name: "HTTPS", direction: "In", action: "Allow", enabled: true },
        { name: "HTTP", direction: "In", action: "Block", enabled: false },
        { name: "SMB (Dosya Paylaşımı)", direction: "In", action: "Allow", enabled: true },
        { name: "Kerberos", direction: "Out", action: "Allow", enabled: true },
      ],
    },
    logs: {
      events: [
        { id: "e1", time: "10:42:15", level: "Info", source: "Service Control Manager", message: "DNS Server servisi başarıyla başlatıldı." },
        { id: "e2", time: "10:38:02", level: "Warning", source: "DHCP Server", message: "IP havuzu %90 doluluk oranına ulaştı." },
        { id: "e3", time: "10:22:44", level: "Error", source: "Netlogon", message: "DC-SECONDARY sunucusuna bağlanılamadı, replikasyon hatası." },
        { id: "e4", time: "09:58:11", level: "Info", source: "Security", message: "Kullanıcı ahmet.yilmaz başarıyla kimlik doğruladı." },
        { id: "e5", time: "09:45:30", level: "Warning", source: "NTFS", message: "D: sürücüsünde disk alanı azalıyor (%85 dolu)." },
        { id: "e6", time: "09:30:00", level: "Info", source: "Task Scheduler", message: "Haftalık yedekleme görevi başarıyla tamamlandı." },
        { id: "e7", time: "09:14:55", level: "Info", source: "Security", message: "Kullanıcı mehmet.celik oturum açtı. Kaynak: 192.168.1.55" },
        { id: "e8", time: "08:52:10", level: "Error", source: "DCOM", message: "DCOM sunucu aktivasyon hatası, uygulama yeniden başlatıldı." },
        { id: "e9", time: "08:30:45", level: "Info", source: "Windows Update", message: "KB5031455 güncellemesi başarıyla yüklendi." },
        { id: "e10", time: "07:00:01", level: "Info", source: "System", message: "Sunucu başarıyla yeniden başlatıldı ve hazır durumda." },
      ],
      failedLogins: [
        { time: "10:15:22", username: "administrator", ip: "185.220.101.45" },
        { time: "09:58:03", username: "admin", ip: "185.220.101.45" },
        { time: "09:47:11", username: "burak.koc", ip: "192.168.1.88" },
        { time: "08:33:50", username: "root", ip: "91.108.56.22" },
        { time: "07:55:18", username: "hasan.demir", ip: "192.168.1.99" },
        { time: "06:22:45", username: "administrator", ip: "45.33.32.156" },
      ],
    },
    weeklyStats: [
      { day: "Pzt", cpu: 42, ram: 58, disk: 44, sessions: 12 },
      { day: "Sal", cpu: 67, ram: 71, disk: 45, sessions: 15 },
      { day: "Çar", cpu: 55, ram: 65, disk: 45, sessions: 14 },
      { day: "Per", cpu: 78, ram: 82, disk: 46, sessions: 18 },
      { day: "Cum", cpu: 91, ram: 88, disk: 47, sessions: 20 },
      { day: "Cmt", cpu: 23, ram: 40, disk: 47, sessions: 3 },
      { day: "Paz", cpu: 18, ram: 36, disk: 47, sessions: 1 },
    ],
  };
}
