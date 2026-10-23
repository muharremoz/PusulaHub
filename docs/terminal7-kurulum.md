# Terminal 7 kurulumu (PUSULARDP7 / 10.15.2.16)

## VM (23.10.2026)

| Alan | Değer |
|---|---|
| ESXi | Makdos 10.15.2.10 |
| VM adı | `Terminal 7 (10.15.2.16)` — moid **22** |
| Donanım | T6 ile birebir: 8 vCPU (tek soket), **64 GB** RAM (sıcak ekleme açık), 250 GB thin PVSCSI |
| Ağ | vmxnet3, VM Network, MAC `00:0c:29:27:28:f0` |
| Ürün yazılımı | EFI, secure boot kapalı, vmx-21 |
| CD | CD0 `[Pusula_3.5TB] ISO/Windows Server 2022.ISO`, CD1 VMware Tools |
| Bilgisayar adı / IP | **PUSULARDP7** / **10.15.2.16** (23.10'da aynı alt ağdaki bir sunucudan ping + ARP ile boş doğrulandı) |

Oluşturma betiği: `apps/web/__t7-olustur.mjs` (T6'nınkinin kopyası; `__esxi-soap.mjs` ile). VM açıldı; konsolda
"Press any key to boot from CD" için **elle tuşa basılmalı**.

> Not: Bu PC'den VPN üzerinden ping "Destination host unreachable" döner ve Windows bunu "Received" sayar —
> IP'nin dolu olduğu anlamına gelmez. Boşluk denetimi aynı alt ağdaki bir sunucudan yapılmalı.

## Sonraki adımlar

Terminal 5/6 ile aynı — kontrol listesi **[terminal5-kurulum.md](terminal5-kurulum.md)**, betik
`scripts/terminal5/t5-kur.ps1` (PUSULARDP7 / .16 için uyarlanarak):

1. Windows Server 2022 kurulumu, ad **PUSULARDP7**, IP **10.15.2.16** (kullanıcı)
2. Hub agent (standart sürüm), Hub'a sunucu olarak ekle
3. AD: bilgisayar nesnesi OU=Bilgisayarlar; GPO güvenlik filtrelerine **PUSULARDP7$** ekle
   (duvar kağıdı, RDP kopuk oturum 30 dk vb. — bkz. memory rdp-kopuk-oturum-gpo, terminal-duvar-kagidi)
4. `t5-kur.ps1` eşdeğeri (DontDisplayLastUserName, DeleteUserAppContainersOnLogoff, FSRM, Office görevleri…)
5. Office LTSC, VC++ 2008, 7-Zip, Sumatra, WebView2, Thinstuff + lisans, Windows/Office etkinleştirme (MAK — kullanıcı)
6. Kuma monitor (push + ping), Windows Update turları
