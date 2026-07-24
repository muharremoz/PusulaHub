import type { NextConfig } from "next";

/**
 * Birleşik platform: Hub kendi alt-domain'inde (hub.pusulanet.net) sunulur.
 * Eski basePath="/apps/hub" (Switch gateway proxy modeli) kaldırıldı → tüm iç
 * link/asset/fetch artık kökten çözülür. Alt-domain'ler tek Supabase cookie'sini
 * (`.pusulanet.net`) paylaşır → SSO.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: ["qrcode", "otplib", "bcryptjs", "mssql"],
  // Ortak app-shell paketi source-only yayınlanıyor → Next derlesin.
  transpilePackages: ["@muharremoz/pusula-ui"],
};

export default nextConfig;
