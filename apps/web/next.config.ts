import type { NextConfig } from "next";

/**
 * basePath: PusulaHub, Pusula Switch gateway altında "/apps/hub" path'inde sunulur.
 * Browser hep gateway origin'ini (localhost:4000) görür → cookie/session paylaşımı.
 * Direkt port (localhost:4242) erişiminde de aynı path geçerli olur.
 *
 * Client-side fetch çağrıları otomatik basePath kazanmaz; root layout'taki
 * <FetchBasePath /> bileşeni window.fetch'i wrap edip /api/* çağrılarına prefix ekler.
 */
const nextConfig: NextConfig = {
  basePath: "/apps/hub",
  serverExternalPackages: ["qrcode", "otplib", "bcryptjs", "mssql"],
};

export default nextConfig;
