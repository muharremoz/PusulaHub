/**
 * PM2 ecosystem — OFİS SUNUCUSU (10.10.10.5, Windows Server 2019) PROD
 *
 * Dev ecosystem.config.js'den FARKLARI:
 *   - cwd path'leri C:/PusulaProd/ altında (dev: C:/GitHub/Pusula Yazılım/)
 *   - Hub da "pnpm start" ile prod build çalışır (dev: "pnpm dev")
 *   - Log'lar C:/PusulaProd/logs/ altında
 *
 * Kullanım (ofis sunucusunda):
 *   pm2 start ecosystem.prod.config.js
 *   pm2 save
 *   pm2-startup install   # Windows boot'ta otomatik başlatma
 *
 * Her deploy öncesi:
 *   pnpm -C apps/web build   (Hub için)
 *   pnpm build               (Switch ve SpareFlow için)
 * sonra:
 *   pm2 restart hub
 */
module.exports = {
  apps: [
    {
      name: "switch",
      cwd: "C:/PusulaProd/PusulaSwitch",
      script: "cmd.exe",
      args: "/c pnpm start",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "C:/PusulaProd/logs/switch-out.log",
      error_file: "C:/PusulaProd/logs/switch-err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "hub",
      cwd: "C:/PusulaProd/PusulaHub/apps/web",
      script: "cmd.exe",
      // PROD: dev değil start
      args: "/c pnpm start",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "C:/PusulaProd/logs/hub-out.log",
      error_file: "C:/PusulaProd/logs/hub-err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "spareflow",
      cwd: "C:/PusulaProd/SpareFlow/spare-flow-ui",
      script: "cmd.exe",
      args: "/c npm run start",
      env: { PORT: "4243" },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "C:/PusulaProd/logs/spareflow-out.log",
      error_file: "C:/PusulaProd/logs/spareflow-err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
