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
    }[]
    ouTree: {
      name:      string
      path:      string
      userCount: number
      children:  unknown[]
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

  roles?: string[]            // Tespit edilen roller: ["IIS","SQL","AD","DNS","DHCP"]
}

/* ── Hub'ın dahili olarak sakladığı agent kaydı ── */
export interface StoredAgent {
  agentId:      string
  token:        string
  hostname:     string
  ip:           string
  os:           "windows" | "linux"
  version:      string
  localPort:    number
  registeredAt: string
  lastSeen:     string
  status:       "online" | "offline"
  lastReport:   AgentReport | null
}
