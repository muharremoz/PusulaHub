@echo off
rem Kullanici masaustlerini ve C:\Pusula musteri klasorlerindeki exe/txt/gorselleri
rem C:\KullaniciYedekleri altina zip'ler (Pusula\<klasor>.zip). Yonetici olarak calistirin.
rem Parametre verilebilir: MASAUSTU-YEDEKLE.bat -Kullanici ahmet1,mehmet2
rem   -PusulaAtla (yalniz masaustu)  -MasaustuAtla (yalniz C:\Pusula)  -PusulaHaric XXX,Yedek
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0masaustu-yedekle.ps1" %*
pause
