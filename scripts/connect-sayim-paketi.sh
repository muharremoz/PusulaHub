#!/usr/bin/env bash
# Pusula Connect — Pusula X SAYIM PAKETİNİ üretir ve servise yükler (canlı: 10.15.2.6 /opt/pusula-connect/istemci).
#
# Paket = verilen Pusula X klasörünün kopyası + boş RFID.xml (sayım modu). lic.xml / server.xml / LOG.txt
# pakete GİRMEZ — bunları Connect müşteri PC'sinde Hub'dan gelen bilgiyle yazar. Pusula X kendini
# Update.exe ile güncellediği için paketin birebir güncel olması şart değil.
#
# Kullanım:  scripts/connect-sayim-paketi.sh "C:/Pusula/PusulaX"            # paketle + yükle
#            YALNIZ_PAKET=1 scripts/connect-sayim-paketi.sh "C:/Pusula/PusulaX"   # yalnız zip üret (yükleme yok)
# Çıktı: istemci/PusulaXSayim.zip + .zip.sha256 + PusulaXSayim.surum.txt (servis /api/sayim bunları verir).
set -euo pipefail

KAYNAK="${1:?Pusula X klasörü (örn C:/Pusula/PusulaX)}"
KOK="$(cd "$(dirname "$0")/.." && pwd)"
SUNUCU="root@10.15.2.6"
ANAHTAR="$USERPROFILE/.ssh/claude_ops"
HEDEF="/opt/pusula-connect/istemci"
CIKTI="${CIKTI:-$KOK/.sayim-paket}"

[ -f "$KAYNAK/PusulaX.exe" ] || { echo "PusulaX.exe yok: $KAYNAK"; exit 1; }
SURUM="$(powershell -NoProfile -Command "(Get-Item '$(cygpath -w "$KAYNAK")\PusulaX.exe').VersionInfo.FileVersion" | tr -d '\r')"
SURUM="${SURUM%.0}"   # 2.37.0.0 → 2.37.0
echo "Pusula X $SURUM  ($KAYNAK)"

echo "== Paketleme"
rm -rf "$CIKTI"; mkdir -p "$CIKTI/PusulaXSayim"
# robocopy çıkış kodu 0-7 başarı sayılır
robocopy "$(cygpath -w "$KAYNAK")" "$(cygpath -w "$CIKTI/PusulaXSayim")" /E /XF LOG.txt lic.xml server.xml desktop.ini Thumbs.db /NFL /NDL /NJH /NJS /NP >/dev/null || [ $? -lt 8 ]
: > "$CIKTI/PusulaXSayim/RFID.xml"
(cd "$CIKTI/PusulaXSayim" && tar -a -c -f ../PusulaXSayim.zip -- *)
SHA="$(sha256sum "$CIKTI/PusulaXSayim.zip" | cut -c1-64)"
printf '%s' "$SHA" > "$CIKTI/PusulaXSayim.zip.sha256"
printf '%s' "$SURUM" > "$CIKTI/PusulaXSayim.surum.txt"
echo "zip: $(stat -c %s "$CIKTI/PusulaXSayim.zip") bayt, sha256 $SHA"
[ "${YALNIZ_PAKET:-0}" = "1" ] && { echo "Yalnız paket üretildi: $CIKTI"; exit 0; }

echo "== Yükleme"
SSH=(ssh -i "$ANAHTAR" -o ConnectTimeout=15 "$SUNUCU")
"${SSH[@]}" "mkdir -p $HEDEF"
scp -q -i "$ANAHTAR" "$CIKTI/PusulaXSayim.zip" "$SUNUCU:$HEDEF/PusulaXSayim.zip.yukleniyor"
UZAK_SHA="$("${SSH[@]}" "sha256sum $HEDEF/PusulaXSayim.zip.yukleniyor | cut -c1-64")"
[ "$UZAK_SHA" = "$SHA" ] || { echo "Sunucudaki dosyanın özeti tutmuyor ($UZAK_SHA)"; exit 1; }
scp -q -i "$ANAHTAR" "$CIKTI/PusulaXSayim.zip.sha256" "$SUNUCU:$HEDEF/PusulaXSayim.zip.sha256"
scp -q -i "$ANAHTAR" "$CIKTI/PusulaXSayim.surum.txt" "$SUNUCU:$HEDEF/PusulaXSayim.surum.txt"
# Önceki paket geri dönüş için saklanır; zip en son yer değiştirir (sha256 dosyası zaten yeni)
"${SSH[@]}" "cd $HEDEF && { [ -f PusulaXSayim.zip ] && mv -f PusulaXSayim.zip PusulaXSayim.zip.onceki || true; } && mv -f PusulaXSayim.zip.yukleniyor PusulaXSayim.zip"
echo "Yayınlandı: Pusula X $SURUM sayım paketi. Servis /api/sayim yeni özeti bir sonraki istekte verir."
