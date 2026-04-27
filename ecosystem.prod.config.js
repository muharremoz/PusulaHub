/**
 * PM2 ecosystem — OFİS SUNUCUSU (10.10.10.5, Windows Server 2019) PROD
 *
 * Dev ecosystem.config.js'den FARKLARI:
 *   - cwd path'leri C:/PusulaProd/ altında (dev: C:/GitHub/Pusula Yazılım/)
 *   - Hub da prod build çalışır (dev: pnpm dev)
 *   - Log'lar C:/PusulaProd/logs/ altında
 *
 * Kullanım (ofis sunucusunda):
 *   pm2 start ecosystem.prod.config.js
 *   pm2 save
 *   pm2-startup install   # Windows boot'ta otomatik başlatma
 *
 * KRİTİK — PM2 Windows wrapper SORUNU ve ÇÖZÜMÜ:
 *
 * 1) cmd.exe /c pnpm start  → PM2 alt process stdout/stderr'ını yakalayamıyor.
 *    Log dosyaları boş kalıyor, hata olduğunda kör kalıyoruz.
 *
 * 2) script: "pnpm" + interpreter: "none"  → spawn EINVAL.
 *    Windows Node spawn() .cmd dosyalarını shell olmadan çağıramıyor.
 *
 * 3) script: <doğrudan js/ts entry> + interpreter: "node"  → ÇÖZÜM.
 *    Wrapper yok, PM2 PID'i doğru takip eder, stdout/stderr log dosyalarına
 *    akıyor. package.json'daki "start" script'inin ne yaptığını bilip aynısını
 *    PM2'ye veriyoruz:
 *      Hub:       node -r tsx/cjs server.ts        → script: server.ts + interpreter_args
 *      Switch:    next start --port 4000           → next CLI direkt
 *      SpareFlow: node server.js                   → script: server.js
 */
module.exports = {
  apps: [
    {
      name: "switch",
      cwd: "C:/PusulaProd/PusulaSwitch",
      // Switch package.json: "start": "next start --port 4000"
      // PM2'ye next CLI'ı doğrudan veriyoruz, wrapper yok.
      script: "node_modules/next/dist/bin/next",
      args: "start --port 4000",
      interpreter: "node",
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
      // Hub package.json: "start": "node -r tsx/cjs server.ts"
      // server.ts içinde dev/prod ayrımı NODE_ENV'e bakar.
      script: "server.ts",
      interpreter: "node",
      interpreter_args: "-r tsx/cjs",
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
      // SpareFlow package.json: "start": "node server.js"
      script: "server.js",
      interpreter: "node",
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
