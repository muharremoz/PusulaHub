/* ══════════════════════════════════════════════════════════
   PusulaAgent — Sunucu Tarafı In-Memory Store
   Next.js hot-reload'a karşı global değişken pattern
══════════════════════════════════════════════════════════ */

import { StoredAgent, AgentReport, AgentMessage, AgentExecRequest, AgentExecResult, WsMessage } from "./agent-types"
import { randomUUID } from "crypto"
import { sendToAgent, hasConnection } from "./ws-connections"

/* ══════════════════════════════════════════════
   PULL MODEL — Poller'dan gelen veriyi kaydet
══════════════════════════════════════════════ */

export function upsertAgentFromPoll(data: {
  serverId: string
  hostname: string
  ip:       string
  os:       "windows" | "linux"
  version:  string
  port:     number
  report:   AgentReport
}): void {
  const existing = store.get(data.serverId)
  const now = new Date().toISOString()

  const agent: StoredAgent = {
    agentId:         data.serverId,
    token:           existing?.token ?? "",
    hostname:        data.hostname,
    ip:              data.ip,
    os:              data.os,
    version:         data.version,
    localPort:       data.port,
    registeredAt:    existing?.registeredAt ?? now,
    lastSeen:        now,
    status:          "online",
    lastReport:      data.report,
    pendingMessages: existing?.pendingMessages ?? [],
    pendingExecs:    existing?.pendingExecs ?? [],
  }

  store.set(data.serverId, agent)
}

/* Global singleton — Next.js dev modunda hot-reload'dan korunur */
const g = global as typeof global & {
  _pusulaAgentStore?: Map<string, StoredAgent>
  _pusulaExecResults?: Map<string, AgentExecResult>
}
if (!g._pusulaAgentStore) g._pusulaAgentStore = new Map<string, StoredAgent>()
if (!g._pusulaExecResults) g._pusulaExecResults = new Map<string, AgentExecResult>()

const store      = g._pusulaAgentStore
const execResults = g._pusulaExecResults

/* Agent çevrimdışı sayılacağı süre: son rapordan bu yana 3 dakika */
const OFFLINE_THRESHOLD_MS = 3 * 60 * 1000

function isOnline(agent: StoredAgent): boolean {
  return Date.now() - new Date(agent.lastSeen).getTime() < OFFLINE_THRESHOLD_MS
}

/* ══════════════════════════════════════════════
   AGENT CRUD
══════════════════════════════════════════════ */

export function registerAgent(data: {
  hostname:  string
  ip:        string
  os:        "windows" | "linux"
  version:   string
  localPort: number
}): StoredAgent {
  const existing = [...store.values()].find((a) => a.hostname === data.hostname)
  const agentId  = existing?.agentId ?? randomUUID()
  const token    = randomUUID()
  const now      = new Date().toISOString()

  const agent: StoredAgent = {
    agentId,
    token,
    hostname:        data.hostname,
    ip:              data.ip,
    os:              data.os,
    version:         data.version,
    localPort:       data.localPort,
    registeredAt:    existing?.registeredAt ?? now,
    lastSeen:        now,
    status:          "online",
    lastReport:      existing?.lastReport ?? null,
    pendingMessages: existing?.pendingMessages ?? [],
    pendingExecs:    existing?.pendingExecs ?? [],
  }

  store.set(agentId, agent)
  return agent
}

export function getAgentByToken(token: string): StoredAgent | undefined {
  return [...store.values()].find((a) => a.token === token)
}

export function getAgentById(agentId: string): StoredAgent | undefined {
  const a = store.get(agentId)
  if (!a) return undefined
  return { ...a, status: isOnline(a) ? "online" : "offline" }
}

export function updateReport(agentId: string, report: AgentReport): boolean {
  const agent = store.get(agentId)
  if (!agent) return false
  agent.lastSeen   = new Date().toISOString()
  agent.status     = "online"
  agent.lastReport = report
  store.set(agentId, agent)
  return true
}

export function getAllAgents(): StoredAgent[] {
  return [...store.values()].map((a) => ({
    ...a,
    status: isOnline(a) ? "online" : "offline",
  }))
}

/* ══════════════════════════════════════════════
   MESAJLAŞMA
══════════════════════════════════════════════ */

export function queueMessage(
  agentId: string,
  msg: Omit<AgentMessage, "id" | "sentAt" | "delivered">
): AgentMessage | null {
  const agent = store.get(agentId)
  if (!agent) return null

  const message: AgentMessage = {
    ...msg,
    id:        randomUUID(),
    sentAt:    new Date().toISOString(),
    delivered: false,
  }

  agent.pendingMessages.push(message)

  // Dual-path: WebSocket varsa anında gönder
  if (hasConnection(agentId)) {
    const wsMsg: WsMessage = { ...message, type: "message" }
    const sent = sendToAgent(agentId, wsMsg)
    if (sent) message.delivered = true
  }

  store.set(agentId, agent)
  return message
}

/** Agent pending mesajlarını çeker, delivered olarak işaretler */
export function popPendingMessages(agentId: string): AgentMessage[] {
  const agent = store.get(agentId)
  if (!agent) return []

  const pending = agent.pendingMessages.filter((m) => !m.delivered)
  pending.forEach((m) => (m.delivered = true))
  store.set(agentId, agent)
  return pending
}

/** Tüm gönderilmiş mesaj geçmişi (UI için) */
export function getAllMessages(): (AgentMessage & { hostname: string; agentId: string })[] {
  const result: (AgentMessage & { hostname: string; agentId: string })[] = []
  for (const agent of store.values()) {
    for (const msg of agent.pendingMessages) {
      result.push({ ...msg, hostname: agent.hostname, agentId: agent.agentId })
    }
  }
  return result.sort((a, b) => b.sentAt.localeCompare(a.sentAt))
}

/* ══════════════════════════════════════════════
   KOMUT ÇALIŞTIRMA (EXEC)
══════════════════════════════════════════════ */

/** Agent'a komut kuyruğuna ekle, execId döner */
export function queueExec(agentId: string, command: string, timeout = 30): string | null {
  const agent = store.get(agentId)
  if (!agent) return null

  const execId = randomUUID()
  const req: AgentExecRequest = { execId, command, timeout }

  // Dual-path: WebSocket varsa anında gönder, yoksa kuyruğa ekle
  if (hasConnection(agentId)) {
    const wsMsg: WsMessage = { ...req, type: "exec" }
    const sent = sendToAgent(agentId, wsMsg)
    if (!sent) agent.pendingExecs.push(req)
  } else {
    agent.pendingExecs.push(req)
  }

  store.set(agentId, agent)
  return execId
}

/** Agent mesaj poll'unda bekleyen exec'leri çeker ve temizler */
export function popPendingExecs(agentId: string): AgentExecRequest[] {
  const agent = store.get(agentId)
  if (!agent) return []
  const pending = [...agent.pendingExecs]
  agent.pendingExecs = []
  store.set(agentId, agent)
  return pending
}

/** Agent exec sonucunu kaydeder */
export function storeExecResult(result: AgentExecResult): void {
  execResults.set(result.execId, result)
  // 10 dakika sonra temizle
  setTimeout(() => execResults.delete(result.execId), 10 * 60 * 1000)
}

/** UI'ın sonucu poll etmesi için */
export function getExecResult(execId: string): AgentExecResult | undefined {
  return execResults.get(execId)
}

/* ══════════════════════════════════════════════
   UI FORMAT DÖNÜŞÜMLERİ
══════════════════════════════════════════════ */

export function agentsToServerList() {
  return getAllAgents().map((agent) => {
    const r       = agent.lastReport
    const metrics = r?.metrics
    return {
      id:               agent.agentId,
      name:             agent.hostname,
      ip:               agent.ip,
      os:               agent.os === "windows" ? "Windows Server" : "Ubuntu Linux",
      status:           agent.status,
      cpu:              metrics?.cpu ?? 0,
      ram:              metrics ? Math.round((metrics.ram.usedMB / metrics.ram.totalMB) * 100) : 0,
      disk:             metrics?.disks?.[0]?.percent ?? 0,
      uptime:           metrics ? formatUptime(metrics.uptimeSeconds) : "—",
      lastChecked:      agent.lastSeen,
      roles:            r?.roles ?? [],
      localPort:        agent.localPort,
      pendingMessages:  agent.pendingMessages.filter((m) => !m.delivered).length,
    }
  })
}

export function getDashboardStats() {
  const agents = getAllAgents()
  return {
    totalServers:   agents.length,
    activeServers:  agents.filter((a) => a.status === "online").length,
    warningServers: agents.filter((a) => {
      const r = a.lastReport
      if (!r) return false
      const disk = r.metrics?.disks?.[0]?.percent ?? 0
      const cpu  = r.metrics?.cpu ?? 0
      const ram  = r.metrics ? (r.metrics.ram.usedMB / r.metrics.ram.totalMB) * 100 : 0
      return cpu > 85 || ram > 85 || disk > 80
    }).length,
    offlineServers: agents.filter((a) => a.status === "offline").length,
  }
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}g ${h}s`
  if (h > 0) return `${h}s ${m}d`
  return `${m}d`
}
