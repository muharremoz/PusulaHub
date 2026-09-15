@echo off
cd /d "%~dp0"
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist app.ico powershell -NoProfile -ExecutionPolicy Bypass -File ikon-uret.ps1
"%CSC%" /nologo /target:winexe /optimize+ /platform:anycpu /codepage:65001 ^
  /win32icon:app.ico ^
  /r:System.Windows.Forms.dll /r:System.Drawing.dll ^
  /out:PusulaBaglantiTesti.exe PusulaBaglantiTesti.cs
