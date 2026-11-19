; Windows 7 / 8 / 8.1 通道：版本校验 + 品牌 UI
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
  ${IfNot} ${AtLeastWin7}
    MessageBox MB_ICONSTOP "星焰作业板需要 Windows 7 SP1 或更高版本。当前系统版本过低，无法安装。"
    Abort
  ${EndIf}
!macroend
!endif ; BUILD_UNINSTALLER
