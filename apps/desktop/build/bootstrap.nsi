; 星焰作业板 · 统一安装引导（Setup.exe）
; 作用：按系统版本 + 架构自动选择并下载对应通道的安装包，然后启动它。
; 编译：node apps/desktop/scripts/build-bootstrap.mjs
;      POSIX 等价命令：cd apps/desktop/build && makensis -V3 -DAPP_VERSION=1.1.1 bootstrap.nsi
;
; 视觉：暗色「星焰」三页（欢迎 / 下载 / 完成），左侧栏图与顶部头图都是 3x 位图，
;      配合 starflame-theme.nsh 的 ManifestDPIAwareness 在 2K/4K 下保持锐利。

Unicode true

; ---- 主题必须先于 MUI2.nsh ----
; MUI2 用 MUI_DEFAULT + !ifndef 守卫定义 MUI_BGCOLOR / MUI_TEXTCOLOR 等，
; 只有在 !include "MUI2.nsh" 之前定义好，暗色才会真正生效。
; starflame-theme.nsh 里只有 !define、全局页面指令（InstallColors 等）与 !macro。
!include "starflame-theme.nsh"
; 外框对话框（底部按钮条那层）着色，函数体在语言注册后展开
!define MUI_CUSTOMFUNCTION_GUIINIT sfGuiInit

!include "MUI2.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"

!define APP_NAME "星焰作业板"
; 版本号由 scripts/build-bootstrap.mjs 通过 /DAPP_VERSION 注入（读 apps/desktop/package.json）
!ifndef APP_VERSION
  !define APP_VERSION "1.0.1"
!endif
!ifdef APP_VERSION_CODE
  !define PACKAGE_VERSION "${APP_VERSION}-${APP_VERSION_CODE}"
!else
  !define PACKAGE_VERSION "${APP_VERSION}"
!endif
!define APP_PUBLISHER "焰火工作室"
; NSISdl 只支持 http（不支持 https），静态下载目录两者都监听
!define BASE_URL "http://zy.yanhuoyiyou.cn/desktop"

Name "${APP_NAME} 安装引导"
OutFile "bootstrap-out.exe"
RequestExecutionLevel user
InstallDir "$TEMP\StarflameWorkboardSetup"

;---------------------------------------------------------------
; 外观：图标 / 顶部头图 / 左侧栏图
; （MUI 会把头图缩到 150x57、侧栏缩到 109x193，3x 源图正是为高 DPI 准备）
;---------------------------------------------------------------
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "bootstrapHeader.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "bootstrapSidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "bootstrapSidebar.bmp"

; 欢迎页：整窗自绘页，左侧 109u 侧栏图 + 120u 起的标题/正文（几何由 MUI 固定）
!define MUI_WELCOMEPAGE_TITLE "${APP_NAME}  安装引导"
!define MUI_WELCOMEPAGE_TEXT "$\r$\n  版本 ${APP_VERSION} · 班级一体机作业看板$\r$\n$\r$\n  引导会先识别系统与架构，$\r$\n  再下载匹配的安装包并启动。$\r$\n$\r$\n  需要联网，约 90–130 MB，$\r$\n  请保持窗口打开。$\r$\n$\r$\n  发布者：${APP_PUBLISHER}"

; 完成页：同样是整窗自绘页，链接色由主题里的 MUI_FINISHPAGE_LINK_COLOR 决定
!define MUI_FINISHPAGE_TITLE "安装包已下载"
!define MUI_FINISHPAGE_TEXT "$\r$\n  安装程序已经启动，$\r$\n  请在新窗口完成剩余步骤。$\r$\n$\r$\n  安装包已下载完成，可重复运行。$\r$\n$\r$\n  发布者：${APP_PUBLISHER}"
!define MUI_FINISHPAGE_LINK "访问星焰作业板发布页"
!define MUI_FINISHPAGE_NOREBOOTSUPPORT
!define MUI_FINISHPAGE_NOAUTOCLOSE

;---------------------------------------------------------------
; 页面 1：欢迎（暗色整窗）
;---------------------------------------------------------------
!define MUI_PAGE_CUSTOMFUNCTION_SHOW sfWelcomeShow
!insertmacro MUI_PAGE_WELCOME

;---------------------------------------------------------------
; 页面 2：下载（标准 header 布局：顶部 150x57 头图 + 暗色详情区 + 彩色进度条）
; 配色来自主题的 InstallColors / InstProgressFlags 与 MUI_INSTFILESPAGE_*
;---------------------------------------------------------------
!define MUI_PAGE_HEADER_TEXT "正在下载安装包"
!define MUI_PAGE_HEADER_SUBTEXT "${APP_NAME} ${APP_VERSION} · 请保持网络连接"
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "下载完成"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "安装程序已启动，可在新窗口继续"
!define MUI_INSTFILESPAGE_ABORTHEADER_TEXT "下载已中断"
!define MUI_INSTFILESPAGE_ABORTHEADER_SUBTEXT "可重新运行安装引导再试一次"
!insertmacro MUI_PAGE_INSTFILES

;---------------------------------------------------------------
; 页面 3：完成（暗色整窗 + 橙色链接）
;---------------------------------------------------------------
!define MUI_PAGE_CUSTOMFUNCTION_SHOW sfFinishShow
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "SimpChinese"
; 中文字体：默认 ^Font 是 Tahoma，中文会回落到宋体，与主界面割裂
!insertmacro sfDefineBrandFont
!insertmacro sfDefineGuiInit

;---------------------------------------------------------------
; 欢迎页 / 完成页的「星焰」排版
; 这两页都是 nsDialogs 整窗自绘页，MUI 已建好标题(120u 10u 195u 28u)与正文
; (120u 45u 195u)，这里只调字体与颜色，并在标题下补一条橙色细线。
;---------------------------------------------------------------
Var sfBar

Function sfWelcomeShow
  CreateFont $0 "$(^Font)" "13" "700"
  SendMessage $mui.WelcomePage.Title ${WM_SETFONT} $0 0
  ; 正文也统一成 ${SF_FONT}：nsDialogs 页的控件继承对话框默认字体，中文会回落到宋体
  CreateFont $1 "$(^Font)" "${SF_FONT_SIZE}" "400"
  SendMessage $mui.WelcomePage.Text ${WM_SETFONT} $1 0
  SetCtlColors $mui.WelcomePage.Title "${SF_ACCENT}" "${SF_BG}"
  SetCtlColors $mui.WelcomePage.Text "${SF_MUTED}" "${SF_BG}"

  ${NSD_CreateLabel} 120u 40u 64u 2u ""
  Pop $sfBar
  SetCtlColors $sfBar "" "${SF_ACCENT_3}"
FunctionEnd

Function sfFinishShow
  CreateFont $0 "$(^Font)" "13" "700"
  SendMessage $mui.FinishPage.Title ${WM_SETFONT} $0 0
  CreateFont $1 "$(^Font)" "${SF_FONT_SIZE}" "400"
  SendMessage $mui.FinishPage.Text ${WM_SETFONT} $1 0
  SetCtlColors $mui.FinishPage.Title "${SF_ACCENT}" "${SF_BG}"
  SetCtlColors $mui.FinishPage.Text "${SF_MUTED}" "${SF_BG}"

  ${NSD_CreateLabel} 120u 40u 64u 2u ""
  Pop $sfBar
  SetCtlColors $sfBar "" "${SF_ACCENT_3}"
FunctionEnd

;---------------------------------------------------------------
; 通道选择：系统版本 + 架构
;---------------------------------------------------------------
Var TargetChannel
Var TargetFile
Var TargetLabel
Var TargetArch
Var DownloadUrl

Function .onInit
  ${If} ${AtLeastWin10}
    ${If} ${RunningX64}
      StrCpy $TargetChannel "win10-x64"
      StrCpy $TargetLabel "Windows 10 / 11"
      StrCpy $TargetArch "64 位"
      StrCpy $TargetFile "StarflameWorkboard-${PACKAGE_VERSION}-x64.exe"
    ${Else}
      StrCpy $TargetChannel "win10-ia32"
      StrCpy $TargetLabel "Windows 10 / 11"
      StrCpy $TargetArch "32 位"
      StrCpy $TargetFile "StarflameWorkboard-${PACKAGE_VERSION}-ia32.exe"
    ${EndIf}
  ${ElseIf} ${AtLeastWin7}
    StrCpy $TargetChannel "win7-ia32"
    StrCpy $TargetLabel "Windows 7 / 8 / 8.1"
    StrCpy $TargetArch "32 位通用"
    StrCpy $TargetFile "StarflameWorkboard-${PACKAGE_VERSION}-ia32.exe"
  ${Else}
    MessageBox MB_ICONSTOP "${APP_NAME} 需要 Windows 7 SP1 或更高版本的系统。$\r$\n$\r$\n发布者：${APP_PUBLISHER}"
    Abort
  ${EndIf}

  StrCpy $DownloadUrl "${BASE_URL}/$TargetChannel/$TargetFile"
FunctionEnd

Section "下载安装包"
  SetOutPath "$INSTDIR"
  SetOverwrite on

  DetailPrint "—— ${APP_NAME} 安装引导 ——"
  DetailPrint "检测到系统：$TargetLabel · $TargetArch"
  DetailPrint "匹配通道：$TargetChannel"
  DetailPrint "下载地址：$DownloadUrl"

  NSISdl::download /TIMEOUT=30000 "$DownloadUrl" "$INSTDIR\$TargetFile"
  Pop $0
  ${If} $0 != "success"
    DetailPrint "首次下载未完成（$0），正在用更长超时重试…"
    NSISdl::download /TIMEOUT=120000 "$DownloadUrl" "$INSTDIR\$TargetFile"
    Pop $0
  ${EndIf}

  ${If} $0 != "success"
    MessageBox MB_ICONSTOP "安装包下载失败：$0$\r$\n$\r$\n请检查网络后重试，或访问 https://zy.yanhuoyiyou.cn/desktop/ 手动下载。$\r$\n$\r$\n发布者：${APP_PUBLISHER}"
    Abort
  ${EndIf}

  DetailPrint "下载完成，正在启动安装程序…"
  ExecShell "open" "$INSTDIR\$TargetFile"
SectionEnd

Function .onInstSuccess
  SetAutoClose false
FunctionEnd
