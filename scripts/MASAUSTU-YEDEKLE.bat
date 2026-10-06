@echo off
rem Kullanici masaustlerini C:\KullaniciYedekleri altina zip'ler. Yonetici olarak calistirin.
rem Parametre verilebilir: MASAUSTU-YEDEKLE.bat -Kullanici ahmet1,mehmet2
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0masaustu-yedekle.ps1" %*
pause
