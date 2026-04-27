/**
 * PM2 ecosystem: PusulaSwitch + PusulaHub + SpareFlow
 *
 * Kullanim:
 *   pm2 start ecosystem.config.js        # hepsini baslat
 *   pm2 restart all                      # hepsini yeniden baslat
 *   pm2 restart hub                      # sadece birini
 *   pm2 logs hub                         # canli log
 *   pm2 monit                            # CPU/RAM izleme
 *   pm2 save                             # mevcut listeyi kaydet
 *   pm2 stop all                         # durdur
 *   pm2 delete all                       # listeden kaldir
 *
 * Windows boot'ta otomatik baslatma:
 *   pm2 save
 *   pm2-startup install
 *
 * Not: Windows'ta .cmd dosyalarini direkt spawn edemedigi icin
 * cmd.exe /c ile sarmaliyoruz.
 */
module.exports = {
  apps: [
    {
      name: "switch",
      cwd: "C:/GitHub/Pusula Yazılım/PusulaSwitch",
      script: "cmd.exe",
      args: "/c pnpm start",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "C:/GitHub/Pusula Yazılım/logs/switch-out.log",
      error_file: "C:/GitHub/Pusula Yazılım/logs/switch-err.log",
      merge_logs: true,
      time: true,
    },
    {
      // Hub prod modda kosar — sayfa gecisleri hizli olsun diye.
      // Kod degisiklikleri hub-watcher tarafindan otomatik build + restart edilir.
      name: "hub",
      cwd: "C:/GitHub/Pusula Yazılım/PusulaHub/apps/web",
      script: "cmd.exe",
      args: "/c pnpm start",
      // NODE_ENV=production ZORUNLU — server.ts: `dev = NODE_ENV !== "production"`.
      // Eksik olursa Next dev modda calisir (N badge + yavas ilk render).
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "C:/GitHub/Pusula Yazılım/logs/hub-out.log",
      error_file: "C:/GitHub/Pusula Yazılım/logs/hub-err.log",
      merge_logs: true,
      time: true,
    },
    {
      // apps/web/src|public altinda degisiklik olursa 2sn debounce ile
      // pnpm build + pm2 restart hub calistirir.
      name: "hub-watcher",
      cwd: "C:/GitHub/Pusula Yazılım/PusulaHub",
      script: "node",
      args: "scripts/hub-watcher.mjs",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      out_file: "C:/GitHub/Pusula Yazılım/logs/hub-watcher-out.log",
      error_file: "C:/GitHub/Pusula Yazılım/logs/hub-watcher-err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "spareflow",
      cwd: "C:/GitHub/Pusula Yazılım/SpareFlow/spare-flow-ui",
      script: "cmd.exe",
      // Prod modda çalıştırılır — dev HMR WebSocket Switch gateway'den
      // geçemiyor, diğer PC'lerde client bundle tutarsız yükleniyor ve
      // dashboard skeleton'da takılıyordu (bkz. CLAUDE.md Switch+Hub notu).
      args: "/c npm run start",
      env: { PORT: "4243" },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "C:/GitHub/Pusula Yazılım/logs/spareflow-out.log",
      error_file: "C:/GitHub/Pusula Yazılım/logs/spareflow-err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
