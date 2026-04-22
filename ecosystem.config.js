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
      name: "hub",
      cwd: "C:/GitHub/Pusula Yazılım/PusulaHub/apps/web",
      script: "cmd.exe",
      args: "/c pnpm dev",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "C:/GitHub/Pusula Yazılım/logs/hub-out.log",
      error_file: "C:/GitHub/Pusula Yazılım/logs/hub-err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "spareflow",
      cwd: "C:/GitHub/Pusula Yazılım/SpareFlow/spare-flow-ui",
      script: "cmd.exe",
      args: "/c npm run dev -- --port 4243",
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
