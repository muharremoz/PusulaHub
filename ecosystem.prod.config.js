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
 *
 * KRİTİK — script: "pnpm"/"npm" (cmd.exe wrapper YOK):
 *   Eski versiyon `script: "cmd.exe", args: "/c pnpm start"` Windows'ta
 *   alt process stdout/stderr'ını PM2 log dosyalarına yazmıyordu (PM2'nin
 *   bilinen Windows sorunu). Sonuç: hub-out.log, hub-err.log boş kalıyor,
 *   bir hata olduğunda kör kalıyoruz.
 *
 *   Çözüm: doğrudan pnpm.cmd / npm.cmd çağır. PM2 .cmd uzantısını Windows'ta
 *   otomatik resolve eder ve stdout'u doğru pipe eder.
 */
module.exports = {
  apps: [
    {
      name: "switch",
      cwd: "C:/PusulaProd/PusulaSwitch",
      script: "pnpm",
      args: "start",
      // KRİTİK: interpreter "none" — PM2 .cmd dosyasını Node ile parse etmesin
      interpreter: "none",
      // PROD: NODE_ENV=production ZORUNLU. apps/web/server.ts ve next start
      // bu env'e bakıyor; eksikse Hub dev modda koşar, .env.production
      // yüklenmez, DB bağlantısı "Login failed for user SA" verir.
      env: { NODE_ENV: "production" },
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
      script: "pnpm",
      args: "start",
      interpreter: "none",
      // KRİTİK: yoksa server.ts dev modda koşar, .env.production yüklenmez.
      env: { NODE_ENV: "production" },
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
      script: "npm",
      args: "run start",
      interpreter: "none",
      env: { PORT: "4243", NODE_ENV: "production" },
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
