# Terminal 6 kurulumu (PUSULARDP6 / 10.15.2.15)

## VM (23.10.2026)

| Alan | Değer |
|---|---|
| ESXi | Makdos 10.15.2.10 |
| VM adı | `Terminal 6 (10.15.2.15)` — moid **21** |
| Donanım | T5 ile birebir: 8 vCPU (tek soket), **64 GB** RAM (sıcak ekleme açık), 250 GB thin PVSCSI |
| Ağ | vmxnet3, VM Network, MAC `00:0c:29:3a:f3:a7` |
| Ürün yazılımı | EFI, secure boot kapalı, vmx-21 |
| CD | CD0 `[Pusula_3.5TB] ISO/Windows Server 2022.ISO`, CD1 VMware Tools |
| Bilgisayar adı / IP | **PUSULARDP6** / **10.15.2.15** (23.10'da T5'ten ping + ARP ile boş doğrulandı) |

Oluşturma betiği: `apps/web/__t6-olustur.mjs` (T5'inkinin kopyası; `__esxi-soap.mjs` ile). VM açıldı; konsolda
"Press any key to boot from CD" için **elle tuşa basılmalı**.

## Sonraki adımlar

Terminal 5 ile aynı — kontrol listesi **[terminal5-kurulum.md](terminal5-kurulum.md)**, betik
`scripts/terminal5/t5-kur.ps1` (PUSULARDP6 / .15 için uyarlanarak):

1. Windows Server 2022 kurulumu, ad **PUSULARDP6**, IP **10.15.2.15** (kullanıcı)
2. Hub agent (standart sürüm), Hub'a sunucu olarak ekle
3. AD: bilgisayar nesnesi OU=Bilgisayarlar; GPO güvenlik filtrelerine **PUSULARDP6$** ekle
   (duvar kağıdı, RDP kopuk oturum 30 dk vb. — bkz. memory rdp-kopuk-oturum-gpo, terminal-duvar-kagidi)
4. `t5-kur.ps1` eşdeğeri (DontDisplayLastUserName, DeleteUserAppContainersOnLogoff, FSRM, Office görevleri…)
5. Office LTSC, VC++ 2008, 7-Zip, Sumatra, WebView2, Thinstuff + lisans, Windows/Office etkinleştirme (MAK — kullanıcı)
6. Kuma monitor (push + ping), Windows Update turları
