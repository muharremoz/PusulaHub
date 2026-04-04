/* ══════════════════════════════════════════════════════════
   PusulaHub — Custom HTTP + WebSocket Server
   Next.js App Router + ws aynı port üzerinde çalışır.

   Agent'lar /ws/agent?agentId=xxx&token=xxx ile bağlanır.
   Normal HTTP istekleri Next.js'e yönlendirilir.
══════════════════════════════════════════════════════════ */

import { createServer } from "http"
import { parse } from "url"
import next from "next"
import { WebSocketServer, type WebSocket } from "ws"
import { getAgentByToken, updateReport, storeExecResult } from "./src/lib/agent-store"
import { registerConnection, setOnMessage } from "./src/lib/ws-connections"
import type { WsMessage, AgentReport, AgentExecResult } from "./src/lib/agent-types"

const dev  = process.env.NODE_ENV !== "production"
const port = parseInt(process.env.PORT ?? "4242", 10)
const app  = next({ dev })
const handle = app.getRequestHandler()

/* ── Gelen WebSocket mesajlarını agent-store'a yönlendir ── */
setOnMessage((agentId: string, msg: WsMessage) => {
  switch (msg.type) {
    case "report": {
      const report = msg as unknown as AgentReport
      report.agentId = agentId
      updateReport(agentId, report)
      break
    }
    case "exec-result": {
      const result = msg as unknown as AgentExecResult
      result.agentId = agentId
      storeExecResult(result)
      break
    }
    case "pong":
      // Keepalive — ws-connections kendi ping/pong timer'ı ile yönetir
      break
    default:
      break
  }
})

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true)
    handle(req, res, parsedUrl)
  })

  /* ── WebSocket Server ── */
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    const { pathname, query } = parse(req.url ?? "", true)

    // Sadece /ws/agent yolunu dinle
    if (pathname !== "/ws/agent") {
      // Next.js HMR veya diğer upgrade'lere dokunma
      return
    }

    const agentId = query.agentId as string | undefined
    const token   = query.token as string | undefined

    if (!agentId || !token) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n")
      socket.destroy()
      return
    }

    // Token doğrulama
    const agent = getAgentByToken(token)
    if (!agent || agent.agentId !== agentId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      console.log(`[WS] Agent bağlandı: ${agent.hostname} (${agentId})`)

      // Bağlantıyı kaydet ve dinleyicileri kur
      registerConnection(agentId, ws)

      // Agent'ın lastSeen'ini güncelle
      agent.lastSeen = new Date().toISOString()
      agent.status = "online"
    })
  })

  server.listen(port, () => {
    console.log(`> PusulaHub ${dev ? "dev" : "production"} — http://localhost:${port}`)
    console.log(`> WebSocket endpoint — ws://localhost:${port}/ws/agent`)
  })
})
