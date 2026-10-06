#!/usr/bin/env bash
# Pusula Connect — SAYIM PAKETİNİ üretir ve servise yükler (canlı: 10.15.2.6 /opt/pusula-connect/istemci).
#
# İki tür (TUR):
#   pusulax (varsayılan): Pusula X klasörü + boş RFID.xml (sayım modu). lic.xml / server.xml / LOG.txt pakete
#                         GİRMEZ. Çıktı PusulaXSayim.zip. Pusula X kendini Update.exe ile günceller.
#   eski:                 eski Pusula programının sayım klasörü (Pusula.exe). Server.xml pakete GİRMEZ.
#                         Çıktı PusulaEskiSayim.zip.
# Bağlantı dosyalarını Connect müşteri PC'sinde Hub'dan gelen bilgiyle yazar.
#
# Kullanım:  scripts/connect-sayim-paketi.sh "C:/Pusula/PusulaX"                        # Pusula X: paketle + yükle
#            TUR=eski scripts/connect-sayim-paketi.sh "C:/Users/.../Desktop/Tools"       # eski program
#            YALNIZ_PAKET=1 …                                                            # yalnız zip üret (yükleme yok)
# Çıktı: istemci/<Ad>.zip + .zip.sha256 + <Ad>.surum.txt (servis /api/sayim bunları verir).
set -euo pipefail

KAYNAK="${1:?Program klasörü (örn C:/Pusula/PusulaX)}"
TUR="${TUR:-pusulax}"
KOK="$(cd "$(dirname "$0")/.." && pwd)"
SUNUCU="root@10.15.2.6"
ANAHTAR="$USERPROFILE/.ssh/claude_ops"
HEDEF="/opt/pusula-connect/istemci"

case "$TUR" in
  pusulax) AD="PusulaXSayim";    EXE="PusulaX.exe"; HARIC=(LOG.txt lic.xml server.xml desktop.ini Thumbs.db) ;;
  eski)    AD="PusulaEskiSayim"; EXE="Pusula.exe";  HARIC=(Server.xml server.xml LOG.txt desktop.ini Thumbs.db) ;;
  *) echo "TUR pusulax ya da eski olmalı"; exit 1 ;;
esac
CIKTI="${CIKTI:-$KOK/.sayim-paket/$TUR}"

[ -f "$KAYNAK/$EXE" ] || { echo "$EXE yok: $KAYNAK"; exit 1; }
SURUM="$(powershell -NoProfile -Command "(Get-Item '$(cygpath -w "$KAYNAK")\\$EXE').VersionInfo.FileVersion" | tr -d '\r')"
SURUM="${SURUM%.0}"   # 2.37.0.0 → 2.37.0
echo "$TUR: $EXE $SURUM  ($KAYNAK)"

echo "== Paketleme"
rm -rf "$CIKTI"; mkdir -p "$CIKTI/$AD"
# robocopy çıkış kodu 0-7 başarı sayılır; MSYS_NO_PATHCONV: Git Bash /E /XF bayraklarını yola çevirmesin
MSYS_NO_PATHCONV=1 robocopy "$(cygpath -w "$KAYNAK")" "$(cygpath -w "$CIKTI/$AD")" /E /XF "${HARIC[@]}" /NFL /NDL /NJH /NJS /NP >/dev/null || [ $? -lt 8 ]
[ "$TUR" = "pusulax" ] && : > "$CIKTI/$AD/RFID.xml"
# Windows tar.exe (bsdtar): .zip uzantısıyla gerçek zip yazar. Git Bash'in GNU tar'ı -a ile zip ÜRETMEZ (düz tar çıkar).
(cd "$CIKTI/$AD" && /c/Windows/System32/tar.exe -a -c -f "../$AD.zip" -- *)
[ "$(head -c 2 "$CIKTI/$AD.zip")" = "PK" ] || { echo "Paket zip değil (PK imzası yok)"; exit 1; }
SHA="$(sha256sum "$CIKTI/$AD.zip" | cut -c1-64)"
printf '%s' "$SHA" > "$CIKTI/$AD.zip.sha256"
printf '%s' "$SURUM" > "$CIKTI/$AD.surum.txt"
echo "zip: $(stat -c %s "$CIKTI/$AD.zip") bayt, sha256 $SHA"
[ "${YALNIZ_PAKET:-0}" = "1" ] && { echo "Yalnız paket üretildi: $CIKTI"; exit 0; }

echo "== Yükleme"
SSH=(ssh -i "$ANAHTAR" -o ConnectTimeout=15 "$SUNUCU")
"${SSH[@]}" "mkdir -p $HEDEF"
scp -q -i "$ANAHTAR" "$CIKTI/$AD.zip" "$SUNUCU:$HEDEF/$AD.zip.yukleniyor"
UZAK_SHA="$("${SSH[@]}" "sha256sum $HEDEF/$AD.zip.yukleniyor | cut -c1-64")"
[ "$UZAK_SHA" = "$SHA" ] || { echo "Sunucudaki dosyanın özeti tutmuyor ($UZAK_SHA)"; exit 1; }
scp -q -i "$ANAHTAR" "$CIKTI/$AD.zip.sha256" "$SUNUCU:$HEDEF/$AD.zip.sha256"
scp -q -i "$ANAHTAR" "$CIKTI/$AD.surum.txt" "$SUNUCU:$HEDEF/$AD.surum.txt"
# Önceki paket geri dönüş için saklanır; zip en son yer değiştirir (sha256 dosyası zaten yeni)
"${SSH[@]}" "cd $HEDEF && { [ -f $AD.zip ] && mv -f $AD.zip $AD.zip.onceki || true; } && mv -f $AD.zip.yukleniyor $AD.zip"
echo "Yayınlandı: $TUR $SURUM sayım paketi. Servis /api/sayim yeni özeti bir sonraki istekte verir."
