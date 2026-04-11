import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["qrcode", "otplib", "bcryptjs", "mssql"],
};

export default nextConfig;
