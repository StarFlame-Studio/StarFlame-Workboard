; Windows 10 / 11 通道：版本校验 + 品牌 UI
!include "WinVer.nsh"
!include "starflame-installer.nsh"

!ifndef BUILD_UNINSTALLER
!macro customInit
  ; 全新安装默认全选；升级安装（含静默自动更新）沿用上一轮的选择
  StrCpy $SF_AUTOSTART "1"
  StrCpy $SF_STARTMENU "1"
  StrCpy $SF_TASKBAR "1"
  !insertmacro sfLoadPreviousChoices
  ; 动文件之前先查磁盘空间（见 starflame-installer.nsh 的 sfPreflightInstallChecks）
  !insertmacro sfPreflightInstallChecks
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "该安装包适用于 Windows 10 / 11。检测到更早的系统版本，请改用 Windows 7 专用安装包。"
    Abort
  ${EndIf}
!macroend
!endif ; BUILD_UNINSTALLER
