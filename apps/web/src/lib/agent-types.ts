/* ══════════════════════════════════════════════════════════
   PusulaAgent — Tip Tanımları
   Hub ↔ Agent arasındaki tüm payload tipleri burada
══════════════════════════════════════════════════════════ */

/* ── Agent → Hub: Kayıt isteği ── */
export interface AgentRegisterRequest {
  hostname:   string
  ip:         string
  os:         "windows" | "linux"
  version:    string
  secret:     string          // AGENT_SECRET ile eşleşmeli
  localPort:  number          // Agent'ın local web UI portu
}

/* ── Hub → Agent: Kayıt yanıtı ── */
export interface AgentRegisterResponse {
  agentId:    string          // UUID — agent bunu config'e kaydeder
  token:      string          // UUID — her raporda kullanılır
  hubVersion: string
}

/* ── Agent → Hub: Periyodik veri gönderimi ── */
export interface AgentReport {
  agentId:   string
  token:     string
  timestamp: string           // ISO 8601

  metrics: {
    cpu:     number           // %  0-100
    ram: {
      totalMB: number
      usedMB:  number
      freeMB:  number
    }
    disks: {
      drive:   string         // "C:" veya "/dev/sda1"
      totalGB: number
      usedGB:  number
      freeGB:  number
      percent: number
    }[]
    uptimeSeconds: number
    networkAdapters: {
      name:    string
      ipv4:    string
      sentMB:  number
      recvMB:  number
    }[]
  }

  sessions?: {
    username:    string
    clientIp:    string
    logonTime:   string
    sessionType: string       // "RDP" | "Console" | "SSH"
    state:       string       // "Active" | "Disconnected"
  }[]

  iis?: {
    sites: {
      name:         string
      status:       string
      binding:      string
      appPool:      string
      physicalPath: string
    }[]
    appPools: {
      name:         string
      status:       string
      runtime:      string
      pipelineMode: string
    }[]
  }

  sql?: {
    databases: {
      name:       string
      sizeMB:     number
      status:     string
      lastBackup: string
      tables:     number
    }[]
  }

  ad?: {
    users: {
      username:    string
      displayName: string
      email:       string
      ou:          string
      enabled:     boolean
      lastLogin:   string
      groups?:     string[]
    }[]
    ouTree: {
      name:      string
      path:      string
      userCount: number
      children:  unknown[]
    }[]
    companies?: {
      firmaNo:   string
      userCount: number
      users: {
        username:    string
        displayName: string
        email:       string
        ou:          string
        enabled:     boolean
        lastLogin:   string
        groups:      string[]
      }[]
    }[]
  }

  localUsers?: {
    username:    string
    displayName: string
    enabled:     boolean
    lastLogin:   string
    description: string
  }[]

  security?: {
    firewall: {
      enabled:    boolean
      rulesCount: number
    }
    adapters: {
      name:   string
      ip:     string
      mac:    string
      speed:  string
      status: string
    }[]
    ports: {
      port:     number
      protocol: string
      process:  string
      pid:      number
    }[]
    shares: {
      name:   string
      path:   string
      access: string
    }[]
    firewallRules: {
      name:      string
      direction: "In" | "Out"
      action:    "Allow" | "Block"
      enabled:   boolean
    }[]
  }

  logs?: {
    events: {
      timestamp: string
      level:     "info" | "warning" | "error" | "critical"
      source:    string
      message:   string
    }[]
    failedLogins?: {
      timestamp: string
      username:  string
      clientIp:  string
    }[]
  }

  userProcesses?: {
    username:   string
    ramMB:      number
    cpuPercent: number
  }[]

  roles?: string[]            // Tespit edilen roller: ["IIS","SQL","AD","DNS","DHCP"]
}

/* ── Hub → Agent: Mesaj ── */
export interface AgentMessage {
  id:        string
  title:     string
  body:      string
  type:      "info" | "warning" | "urgent"
  from:      string          // Gönderen kullanıcı adı (hub tarafı)
  toCompany: string          // Alıcının bağlı olduğu firma adı
  sentAt:    string          // ISO 8601
  delivered: boolean
  readBy?:   { username: string; readAt: string }[]
}

/* ── Gönderilen mesaj kaydı (hub tarafı izleme) ── */
export interface SentMessage {
  id:        string
  agentId:   string
  title:     string
  body:      string
  type:      "info" | "warning" | "urgent"
  from:      string
  sentAt:    string
  sessions:  number
  readBy:    { username: string; readAt: string }[]
}

/* ── Hub → Agent: Komut çalıştırma isteği ── */
export interface AgentExecRequest {
  execId:  string    // UUID — sonuç eşleştirmek için
  command: string    // Çalıştırılacak komut
  timeout: number    // Saniye cinsinden max süre
}

/* ── Agent → Hub: Komut sonucu ── */
export interface AgentExecResult {
  execId:   string
  agentId:  string
  token:    string
  stdout:   string
  stderr:   string
  exitCode: number
  duration: number   // ms
}

/* ── WebSocket mesaj çerçevesi ── */
export type WsMessageType =
  | "report"        // Agent → Hub: metrik raporu
  | "exec-result"   // Agent → Hub: komut sonucu
  | "pong"          // Agent → Hub: keepalive yanıtı
  | "message"       // Hub → Agent: bildirim
  | "exec"          // Hub → Agent: komut çalıştır
  | "ping"          // Hub → Agent: keepalive
  | "reregister"    // Hub → Agent: tekrar kayıt ol

export interface WsMessage {
  type: WsMessageType
  [key: string]: unknown
}

/* ── Hub'ın dahili olarak sakladığı agent kaydı ── */
export interface StoredAgent {
  agentId:         string
  token:           string
  hostname:        string
  ip:              string
  os:              "windows" | "linux"
  version:         string
  localPort:       number
  registeredAt:    string
  lastSeen:        string
  status:          "online" | "offline"
  lastReport:      AgentReport | null
  pendingMessages: AgentMessage[]
  pendingExecs:    AgentExecRequest[]
}
