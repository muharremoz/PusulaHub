/* ══════════════════════════════════════════════════════════
   PusulaAgent — Sunucu Tarafı In-Memory Store
   Next.js hot-reload'a karşı global değişken pattern
══════════════════════════════════════════════════════════ */

import { StoredAgent, AgentReport } from "./agent-types"
import { randomUUID } from "crypto"

/* Global singleton — Next.js dev modunda hot-reload'dan korunur */
const g = global as typeof global & {
  _pusulaAgentStore?: Map<string, StoredAgent>
}
if (!g._pusulaAgentStore) {
  g._pusulaAgentStore = new Map<string, StoredAgent>()
}
const store = g._pusulaAgentStore

/* Agent çevrimdışı sayılacağı süre: son rapordan bu yana 3 dakika */
const OFFLINE_THRESHOLD_MS = 3 * 60 * 1000

function isOnline(agent: StoredAgent): boolean {
  const diff = Date.now() - new Date(agent.lastSeen).getTime()
  return diff < OFFLINE_THRESHOLD_MS
}

/* ── CRUD ── */

export function registerAgent(data: {
  hostname:  string
  ip:        string
  os:        "windows" | "linux"
  version:   string
  localPort: number
}): StoredAgent {
  // Aynı hostname varsa güncelle (yeniden başlatma durumu)
  const existing = [...store.values()].find((a) => a.hostname === data.hostname)
  const agentId  = existing?.agentId ?? randomUUID()
  const token    = randomUUID()
  const now      = new Date().toISOString()

  const agent: StoredAgent = {
    agentId,
    token,
    hostname:      data.hostname,
    ip:            data.ip,
    os:            data.os,
    version:       data.version,
    localPort:     data.localPort,
    registeredAt:  existing?.registeredAt ?? now,
    lastSeen:      now,
    status:        "online",
    lastReport:    existing?.lastReport ?? null,
  }

  store.set(agentId, agent)
  return agent
}

export function getAgentByToken(token: string): StoredAgent | undefined {
  return [...store.values()].find((a) => a.token === token)
}

export function updateReport(agentId: string, report: AgentReport): boolean {
  const agent = store.get(agentId)
  if (!agent) return false

  agent.lastSeen   = new Date().toISOString()
  agent.status     = "online"
  agent.lastReport = report
  agent.ip         = report.metrics ? agent.ip : agent.ip  // IP sabittir

  store.set(agentId, agent)
  return true
}

export function getAllAgents(): StoredAgent[] {
  return [...store.values()].map((a) => ({
    ...a,
    status: isOnline(a) ? "online" : "offline",
  }))
}

export function getAgent(agentId: string): StoredAgent | undefined {
  const a = store.get(agentId)
  if (!a) return undefined
  return { ...a, status: isOnline(a) ? "online" : "offline" }
}

/* ── UI'a sunulacak format dönüşümü ── */

export function agentsToServerList() {
  return getAllAgents().map((agent) => {
    const r = agent.lastReport
    const metrics = r?.metrics

    return {
      id:          agent.agentId,
      name:        agent.hostname,
      ip:          agent.ip,
      os:          agent.os === "windows" ? "Windows Server" : "Ubuntu Linux",
      status:      agent.status,
      cpu:         metrics?.cpu ?? 0,
      ram:         metrics
        ? Math.round((metrics.ram.usedMB / metrics.ram.totalMB) * 100)
        : 0,
      disk:        metrics?.disks?.[0]?.percent ?? 0,
      uptime:      metrics ? formatUptime(metrics.uptimeSeconds) : "—",
      lastChecked: agent.lastSeen,
      roles:       r?.roles ?? [],
      localPort:   agent.localPort,
    }
  })
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}g ${h}s`
  if (h > 0) return `${h}s ${m}d`
  return `${m}d`
}

/* ── Dashboard özeti ── */

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
      const ram  = r.metrics
        ? (r.metrics.ram.usedMB / r.metrics.ram.totalMB) * 100
        : 0
      return cpu > 85 || ram > 85 || disk > 80
    }).length,
    offlineServers: agents.filter((a) => a.status === "offline").length,
  }
}
