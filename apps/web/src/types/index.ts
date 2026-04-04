export type ServerOS = "Windows Server 2022" | "Windows Server 2019" | "Ubuntu 22.04" | "Ubuntu 24.04";
export type ServerStatus = "online" | "warning" | "offline";
export type ServerRole = "AD" | "SQL" | "IIS" | "File" | "DNS" | "DHCP" | "General";

export interface Server {
  id: string;
  name: string;
  ip: string;
  dns?: string;
  os: ServerOS;
  status: ServerStatus;
  roles: ServerRole[];
  cpu: number;
  ram: number;
  disk: number;
  uptime: string;
  lastChecked: string;
}

export interface ADUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  ou: string;
  enabled: boolean;
  lastLogin: string;
  createdAt: string;
}

export interface ADOU {
  name: string;
  path: string;
  children: ADOU[];
  userCount: number;
}

export interface SQLDatabase {
  id: string;
  name: string;
  server: string;
  sizeMB: number;
  status: "Online" | "Offline" | "Restoring";
  lastBackup: string;
  tables: number;
}

export interface IISSite {
  id: string;
  name: string;
  server: string;
  status: "Started" | "Stopped";
  binding: string;
  appPool: string;
  physicalPath: string;
  firma?: string;
  hizmet?: string;
}

export interface IISAppPool {
  name: string;
  status: "Started" | "Stopped";
  runtime: string;
  pipelineMode: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  server: string;
  level: "info" | "warning" | "error" | "critical";
  source: string;
  message: string;
}

export interface FileItem {
  name: string;
  type: "file" | "folder";
  size?: number;
  modified: string;
  permissions?: string;
}

export interface PanelUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  lastActive: string;
}

export type ServiceCategory = "Altyapi" | "Veritabani" | "Web" | "Guvenlik" | "Yedekleme" | "Izleme";
export type ServiceStatus = "active" | "inactive" | "maintenance";

export interface Service {
  id: string;
  name: string;
  description: string;
  category: ServiceCategory;
  status: ServiceStatus;
  servers: string[];
  port?: number;
  protocol?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export type CompanyStatus = "active" | "suspended" | "trial";

export interface CompanyService {
  name: string;
  status: "active" | "inactive";
}

export interface Company {
  id: string;
  name: string;
  sector: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  userCount: number;
  userCapacity: number;
  servers: string[];
  services: CompanyService[];
  status: CompanyStatus;
  contractStart: string;
  contractEnd: string;
  monthlyQuota: { cpu: number; ram: number; disk: number };
  currentUsage: { cpu: number; ram: number; disk: number };
  weeklyUsage: Array<{ day: string; cpu: number; ram: number; disk: number }>;
  dbQuota: number;
  databases?: Array<{ name: string; type: "MSSQL" | "MySQL" | "PostgreSQL"; size: number; status: "online" | "offline" }>;
  notes?: string;
}

export interface MessageRecipient {
  id: string;
  name: string;
  email: string;
  company: string;
  server: string;
  online: boolean;
  lastLogin?: string;
  sessionDuration?: string;
}

export type MessagePriority = "normal" | "high" | "urgent";
export type MessageStatus = "sent" | "delivered" | "read" | "failed";

export interface Message {
  id: string;
  subject: string;
  body: string;
  priority: MessagePriority;
  sender: string;
  recipients: string[];
  recipientType: "all" | "company" | "selected";
  company?: string;
  status: MessageStatus;
  sentAt: string;
  readCount: number;
  totalCount: number;
}

export interface DashboardStats {
  totalServers: number;
  activeServers: number;
  warningServers: number;
  offlineServers: number;
}

export interface RecentEvent {
  id: string;
  timestamp: string;
  server: string;
  type: "info" | "warning" | "error" | "success";
  message: string;
}
