@echo off
setlocal
title 星焰作业板 · 导入代码签名证书
set "CER=%~dp0starflame.cer"
set "TP=37241007E30DEEA801250FDB91A354D1A68E34B8"
if not exist "%CER%" (
  echo [X] 没找到 starflame.cer，请把本文件与证书放在同一个文件夹里再运行。
  pause
  exit /b 1
)
echo 正在为当前用户 %USERNAME% 导入证书……
certutil -user -addstore -f Root "%CER%" >nul 2>&1
certutil -user -addstore -f TrustedPublisher "%CER%" >nul 2>&1
certutil -user -verifystore Root %TP% >nul 2>&1
if errorlevel 1 goto tryps
goto imported
:tryps
echo 改用 PowerShell 再试一次……
powershell -NoProfile -Command "Import-Certificate -FilePath '%CER%' -CertStoreLocation Cert:\CurrentUser\Root | Out-Null; Import-Certificate -FilePath '%CER%' -CertStoreLocation Cert:\CurrentUser\TrustedPublisher | Out-Null" >nul 2>&1
certutil -user -verifystore Root %TP% >nul 2>&1
if errorlevel 1 goto manual
:imported
net session >nul 2>&1
if errorlevel 1 goto cleanup
certutil -addstore -f Root "%CER%" >nul 2>&1
certutil -addstore -f TrustedPublisher "%CER%" >nul 2>&1
echo 已同时写入「本机」，对所有用户生效。
:cleanup
echo 清理上次失败留下的更新缓存……
if exist "%LOCALAPPDATA%\@starflamedesktop-updater\pending" rmdir /s /q "%LOCALAPPDATA%\@starflamedesktop-updater\pending"
echo.
echo [OK] 证书导入成功，指纹 %TP%。
echo      请回到「星焰作业板 - 设置 - 关于 - 检查更新」再点一次，这次会正常下载并自动安装。
echo.
pause
exit /b 0
:manual
echo [X] 自动导入失败，请手动操作：
echo     1. 右键 starflame.cer，选「安装证书」
echo     2. 存储位置选「当前用户」，下一步
echo     3. 选「将所有的证书都放入下列存储」，点「浏览」
echo        再选「受信任的根证书颁发机构」，下一步，完成
echo     4. 回到应用里点「检查更新」重试
echo.
pause
exit /b 1
