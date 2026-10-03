#!/usr/bin/env bash
# Pusula Connect 2 — yeni istemci sürümünü YAYINLAR (canlı: 10.15.2.6 /opt/pusula-connect/istemci).
#
#   bash scripts/connect-yayinla.sh [notlar.txt]
#
# Sürüm apps/connect-istemci/src/PusulaConnect/PusulaConnect.csproj <Version>'dan okunur — önce onu artırın.
# notlar.txt (isteğe bağlı): güncelleme penceresinde "Bu sürümde" altında gösterilir, satır başına bir madde.
#
# Sıra önemli: önce exe (geçici adla yüklenip tek hamlede yerine taşınır — yarım dosya indirilmez),
# EN SON surum.txt. İstemciler yeni sürümü surum.txt'den görür; exe hazır olmadan görmezler.
# Servis /api/surum'da exe'nin SHA-256'sını verir; istemci indirdiğini onunla doğrular.
# İMZA: exe ~/.ssh/pusula-connect-imza.pem (RSA-3072, ÇEVRİMDIŞI — sunucuya hiç gitmez) ile imzalanır,
# .sig olarak exe'nin yanına konur; istemci (GuncellemeImzasi.cs) gömülü açık anahtarla doğrular, imzasız
# yayını yok sayar. Anahtar kaybolursa yeni anahtarla yayın yapılamaz: yedeğini güvenli yerde tutun.
set -euo pipefail

KOK="$(cd "$(dirname "$0")/.." && pwd)"
PROJE="$KOK/apps/connect-istemci/src/PusulaConnect"
SUNUCU="root@10.15.2.6"
ANAHTAR="$USERPROFILE/.ssh/claude_ops"
# Parolalı anahtarlar (scripts/connect-imza-kur.ps1). Normalde ANA ile imzalanır; ana kaybolur/çalınırsa
# CONNECT_IMZA_YEDEK=1 ile YEDEK kullanılır (istemci ikisini de tanır, 0.4.6+). Parola DPAPI dosyasından okunur.
if [ "${CONNECT_IMZA_YEDEK:-0}" = "1" ]; then IMZA_ANAHTARI="$USERPROFILE/.ssh/pusula-connect-imza-yedek.enc.pem"
else IMZA_ANAHTARI="$USERPROFILE/.ssh/pusula-connect-imza.enc.pem"; fi
IMZA_PAROLA_DOSYASI="$USERPROFILE/.ssh/pusula-connect-imza.parola"
HEDEF="/opt/pusula-connect/istemci"
NOTLAR="${1:-}"
SSH=(ssh -i "$ANAHTAR" -o ConnectTimeout=15 "$SUNUCU")

SURUM="$(sed -n 's:.*<Version>\(.*\)</Version>.*:\1:p' "$PROJE/PusulaConnect.csproj" | head -1)"
[ -n "$SURUM" ] || { echo "Sürüm okunamadı"; exit 1; }
YAYINDA="$("${SSH[@]}" "cat $HEDEF/surum.txt 2>/dev/null || true")"
echo "Yayında: ${YAYINDA:-yok}  →  yayınlanacak: $SURUM"
if [ "$YAYINDA" = "$SURUM" ]; then echo "Bu sürüm zaten yayında; önce csproj'da <Version>'ı artırın."; exit 1; fi

echo "== Derleme"
(cd "$KOK/apps/connect-istemci/web" && npm run build >/dev/null)
(cd "$PROJE" && dotnet build -c Release -nologo -v q | tail -2)
EXE="$PROJE/bin/Release/net48/PusulaConnect.exe"
EXE_SURUM="$(powershell -NoProfile -Command "(Get-Item '$(cygpath -w "$EXE")').VersionInfo.FileVersion" | tr -d '\r')"
case "$EXE_SURUM" in "$SURUM"*) ;; *) echo "Derlenen exe sürümü ($EXE_SURUM) csproj ile tutmuyor"; exit 1 ;; esac
SHA="$(sha256sum "$EXE" | cut -c1-64)"
echo "exe: $(stat -c %s "$EXE") bayt, sha256 $SHA"

echo "== İmza"
[ -f "$IMZA_ANAHTARI" ] || { echo "İmza anahtarı yok: $IMZA_ANAHTARI (önce scripts/connect-imza-kur.ps1)"; exit 1; }
[ -f "$IMZA_PAROLA_DOSYASI" ] || { echo "Parola dosyası yok: $IMZA_PAROLA_DOSYASI (scripts/connect-imza-kur.ps1)"; exit 1; }
SIG="$EXE.sig"
# Parola: DPAPI ile yalnız bu Windows kullanıcısı çözer; node'a standart girişten gider (komut satırında görünmez).
# Gömülü açık anahtar bu özel anahtarla eşleşiyor mu (yanlış anahtarla imzalanan yayını hiçbir istemci kurmaz)
powershell -NoProfile -Command "Add-Type -AssemblyName System.Security; [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes('$(cygpath -w "$IMZA_PAROLA_DOSYASI")'), \$null, 'CurrentUser')))" | node -e '
const c=require("crypto"),fs=require("fs");
const priv=c.createPrivateKey({key:fs.readFileSync(process.argv[1]),passphrase:Buffer.from(fs.readFileSync(0,"utf8").trim(),"base64").toString("utf8")});
const n=Buffer.from(c.createPublicKey(priv).export({format:"jwk"}).n,"base64url").toString("base64");
const cs=fs.readFileSync(process.argv[3],"utf8");
if(!cs.includes("\""+n+"\"")){console.error("GuncellemeImzasi.cs içindeki açık anahtar bu özel anahtarla eşleşmiyor");process.exit(1)}
const exe=fs.readFileSync(process.argv[2]);
const sig=c.sign("sha256",exe,priv);
if(!c.verify("sha256",exe,c.createPublicKey(priv),sig)){console.error("imza doğrulanamadı");process.exit(1)}
fs.writeFileSync(process.argv[2]+".sig",sig.toString("base64"));
console.log("imzalandı: "+sig.length+" bayt");
' "$IMZA_ANAHTARI" "$EXE" "$PROJE/GuncellemeImzasi.cs"

echo "== Yükleme"
"${SSH[@]}" "mkdir -p $HEDEF"
scp -q -i "$ANAHTAR" "$EXE" "$SUNUCU:$HEDEF/PusulaConnect.exe.yukleniyor"
UZAK_SHA="$("${SSH[@]}" "sha256sum $HEDEF/PusulaConnect.exe.yukleniyor | cut -c1-64")"
[ "$UZAK_SHA" = "$SHA" ] || { echo "Sunucudaki dosyanın özeti tutmuyor ($UZAK_SHA)"; exit 1; }
# Bir önceki yayın geri dönüş için saklanır
scp -q -i "$ANAHTAR" "$SIG" "$SUNUCU:$HEDEF/PusulaConnect.exe.sig.yukleniyor"
# exe ve imzası birlikte yer değiştirir (surum.txt'den önce): istemci bir an bile eski exe + yeni imza görmez
"${SSH[@]}" "cd $HEDEF && { [ -f PusulaConnect.exe ] && cp -p PusulaConnect.exe PusulaConnect.exe.onceki || true; } && { [ -f PusulaConnect.exe.sig ] && cp -p PusulaConnect.exe.sig PusulaConnect.exe.sig.onceki || true; } && mv -f PusulaConnect.exe.yukleniyor PusulaConnect.exe && mv -f PusulaConnect.exe.sig.yukleniyor PusulaConnect.exe.sig"
if [ -n "$NOTLAR" ]; then scp -q -i "$ANAHTAR" "$NOTLAR" "$SUNUCU:$HEDEF/notlar.txt"; else "${SSH[@]}" "rm -f $HEDEF/notlar.txt"; fi
"${SSH[@]}" "[ -f $HEDEF/surum.txt ] && cp -p $HEDEF/surum.txt $HEDEF/surum.txt.onceki; printf '%s' '$SURUM' > $HEDEF/surum.txt"

echo "== Doğrulama"
"${SSH[@]}" "curl -s http://127.0.0.1:5200/api/surum"; echo
echo "Yayınlandı: $SURUM. İstemciler bir sonraki açılışta güncellemeyi soracak."
