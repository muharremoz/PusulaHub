import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

/**
 * POST /api/apps/register
 *
 * Ekosisteme bağlı app'ler ayağa kalkarken modül kataloglarını Hub'a bildirir.
 * Hub `dbo.Apps.ModulesJson` kolonuna MERGE ederek Permissions Sheet'in güncel
 * kalmasını sağlar.
 *
 * Güvenlik: x-internal-key header — INTERNAL_APP_KEY env ile karşılaştırılır.
 * Sadece loopback / PM2 altındaki app'ler çağırır. Gateway dışarıya kapalı.
 */

type ModuleGroup = "general" | "services" | "data" | "admin" | "dev";
interface RegistryModule {
  key:   string;
  label: string;
  group: ModuleGroup;
}

interface RegistryPayload {
  appId:   string;
  name?:   string;
  modules: RegistryModule[];
}

const MODULE_GROUPS: ModuleGroup[] = ["general", "services", "data", "admin", "dev"];
const KEY_PATTERN = /^[a-z0-9-]+$/;

function isValidModule(m: unknown): m is RegistryModule {
  if (!m || typeof m !== "object") return false;
  const obj = m as Record<string, unknown>;
  return typeof obj.key === "string"
    && KEY_PATTERN.test(obj.key)
    && typeof obj.label === "string"
    && obj.label.length > 0
    && typeof obj.group === "string"
    && MODULE_GROUPS.includes(obj.group as ModuleGroup);
}

export async function POST(req: NextRequest) {
  // 1) Internal key kontrolü
  const sentKey = req.headers.get("x-internal-key");
  const expected = process.env.INTERNAL_APP_KEY;
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_APP_KEY sunucuda tanımlı değil." }, { status: 500 });
  }
  if (!sentKey || sentKey !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) Payload parse + validate
  let payload: RegistryPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const appId = (payload?.appId ?? "").trim();
  if (!appId || !KEY_PATTERN.test(appId)) {
    return NextResponse.json({ error: "invalid appId" }, { status: 400 });
  }
  if (!Array.isArray(payload.modules)) {
    return NextResponse.json({ error: "modules must be an array" }, { status: 400 });
  }

  // Duplicate key tespiti + invalid item ayıklama
  const seen = new Set<string>();
  const cleaned: RegistryModule[] = [];
  for (const m of payload.modules) {
    if (!isValidModule(m)) continue;
    if (seen.has(m.key)) continue;
    seen.add(m.key);
    cleaned.push({ key: m.key, label: m.label, group: m.group });
  }

  const name = (payload.name?.trim()) || appId;
  const modulesJson = JSON.stringify(cleaned);

  // 3) Apps tablosuna MERGE
  await execute`
    MERGE dbo.Apps AS target
    USING (SELECT ${appId} AS Id, ${name} AS Name, ${modulesJson} AS ModulesJson) AS src
    ON target.Id = src.Id
    WHEN MATCHED THEN
      UPDATE SET Name = src.Name, ModulesJson = src.ModulesJson
    WHEN NOT MATCHED THEN
      INSERT (Id, Name, ModulesJson) VALUES (src.Id, src.Name, src.ModulesJson);
  `;

  return NextResponse.json({ ok: true, appId, count: cleaned.length });
}
