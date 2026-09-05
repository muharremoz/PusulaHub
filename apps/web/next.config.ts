import type { NextConfig } from "next";

/**
 * Birleşik platform: Hub kendi alt-domain'inde (hub.pusulanet.net) sunulur.
 * Eski basePath="/apps/hub" (Switch gateway proxy modeli) kaldırıldı → tüm iç
 * link/asset/fetch artık kökten çözülür. Alt-domain'ler tek Supabase cookie'sini
 * (`.pusulanet.net`) paylaşır → SSO.
 */
const nextConfig: NextConfig = {
  /*
   * `ssh2`: yedek deposunun disk dolulugunu okumak icin (lib/backup-storage).
   * Listeye ALINMAK ZORUNDA — istege bagli bir yerel eklentisi var
   * (`cpu-features`) ve o derlenmemisse webpack paketlemeye calisip
   * "Can't resolve '../build/Release/cpufeatures.node'" ile 500 veriyor.
   * Dis paket olarak isaretlenince Node kendi require'i ile yukluyor ve
   * eklenti yoksa saf JS'e dusuyor.
   */
  serverExternalPackages: ["qrcode", "otplib", "bcryptjs", "mssql", "ssh2"],
  // Ortak app-shell paketi source-only yayınlanıyor → Next derlesin.
  transpilePackages: ["@muharremoz/pusula-ui"],
};

export default nextConfig;
