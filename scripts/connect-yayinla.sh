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
set -euo pipefail

KOK="$(cd "$(dirname "$0")/.." && pwd)"
PROJE="$KOK/apps/connect-istemci/src/PusulaConnect"
SUNUCU="root@10.15.2.6"
ANAHTAR="$USERPROFILE/.ssh/claude_ops"
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
EXE_SURUM="$(powershell -NoProfile -Command "(Get-Item '$(cygpath -w "$EXE")').VersionInfo.FileVersion" | tr -d '')"
case "$EXE_SURUM" in "$SURUM"*) ;; *) echo "Derlenen exe sürümü ($EXE_SURUM) csproj ile tutmuyor"; exit 1 ;; esac
SHA="$(sha256sum "$EXE" | cut -c1-64)"
echo "exe: $(stat -c %s "$EXE") bayt, sha256 $SHA"

echo "== Yükleme"
"${SSH[@]}" "mkdir -p $HEDEF"
scp -q -i "$ANAHTAR" "$EXE" "$SUNUCU:$HEDEF/PusulaConnect.exe.yukleniyor"
UZAK_SHA="$("${SSH[@]}" "sha256sum $HEDEF/PusulaConnect.exe.yukleniyor | cut -c1-64")"
[ "$UZAK_SHA" = "$SHA" ] || { echo "Sunucudaki dosyanın özeti tutmuyor ($UZAK_SHA)"; exit 1; }
# Bir önceki yayın geri dönüş için saklanır
"${SSH[@]}" "cd $HEDEF && { [ -f PusulaConnect.exe ] && cp -p PusulaConnect.exe PusulaConnect.exe.onceki || true; } && mv -f PusulaConnect.exe.yukleniyor PusulaConnect.exe"
if [ -n "$NOTLAR" ]; then scp -q -i "$ANAHTAR" "$NOTLAR" "$SUNUCU:$HEDEF/notlar.txt"; else "${SSH[@]}" "rm -f $HEDEF/notlar.txt"; fi
"${SSH[@]}" "[ -f $HEDEF/surum.txt ] && cp -p $HEDEF/surum.txt $HEDEF/surum.txt.onceki; printf '%s' '$SURUM' > $HEDEF/surum.txt"

echo "== Doğrulama"
"${SSH[@]}" "curl -s http://127.0.0.1:5200/api/surum"; echo
echo "Yayınlandı: $SURUM. İstemciler bir sonraki açılışta güncellemeyi soracak."
