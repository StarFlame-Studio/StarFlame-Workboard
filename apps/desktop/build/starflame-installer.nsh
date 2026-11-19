; 星焰作业板 · 安装器品牌与选项页（被 nsis-require-win10.nsh / nsis-require-win7.nsh 引用）
;
; 本文件由 electron-builder 的 nsis.include 注入，内容会被 prepend 到 installer.nsi 之前，
; 此时 MUI2.nsh / nsDialogs.nsh 都还没 include。因此：
;   · 只能写 !define / !macro / LangString / Var / Function；
;   · 绝不能直接调用 MUI_PAGE_* 或 ${NSD_*}，页面一律包在 !macro 里，交给 electron-builder
;     的钩子宏（customHeader / customWelcomePage / customPageAfterChangeDir / customInstall
;     / customUnInstall / customInstallmode）在正确的时机展开。

; ---- 主题 ----
; 相对 include 由 NSIS 按「当前文件所在目录」解析，与本文件被谁引用无关。
; 主题只含 !define、全局页面指令与 !macro，放在这里早于 MUI2.nsh 正好生效。
!include "starflame-theme.nsh"

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
; FileFunc.nsh 提供 ${DriveSpace}：安装前检查目标磁盘剩余空间
!include "FileFunc.nsh"


;; 注意：不要覆盖 APP_FILENAME。assistedInstaller.nsh 的 instFilesPre 会用 StrContains
;; （区分大小写）检查 $INSTDIR 是否已含 APP_FILENAME，不含就再追加一层。
;; 所以选盘页拼出来的路径，最后一段必须是 ${APP_FILENAME} 本身（见 sfPathCompose）。
; ---- 欢迎页 / 完成页文案（暗色 MUI 页面，不重复造页） ----
!define MUI_WELCOMEPAGE_TITLE "星焰作业板 安装程序"
!define MUI_WELCOMEPAGE_TEXT "$\r$\n  感谢使用 星焰作业板 —— 面向班级一体机。$\r$\n$\r$\n  安装程序会带你完成三步：$\r$\n  确认安装位置、选择安装选项、复制文件。$\r$\n$\r$\n  整个过程约需 1 分钟，无需联网。$\r$\n$\r$\n  发布者：焰火工作室"
!define MUI_FINISHPAGE_TITLE "星焰作业板 已安装完成"
; eb 的完成页会自动定义 MUI_FINISHPAGE_RUN（「立即运行」复选框），此时正文区只有 40u 高，
; 文案必须压在 3 行以内，否则会被裁掉。
!define MUI_FINISHPAGE_TEXT "$\r$\n  安装已完成，点击「完成」立即运行。$\r$\n  关闭主窗口后程序驻留系统托盘，$\r$\n  右键托盘图标可重新打开或退出。"
!define MUI_FINISHPAGE_RUN_TEXT "立即运行 星焰作业板"
; 完成页底部的橙色链接（颜色由主题里的 MUI_FINISHPAGE_LINK_COLOR 决定）
!define MUI_FINISHPAGE_LINK "打开星焰作业板发布页"
!define MUI_ABORTWARNING

; 卸载器构建阶段（BUILD_UNINSTALLER）不包含选项页与安装逻辑，跳过安装期变量与宏，
; 避免 NSIS 6001 警告（该警告被视作错误）
!ifndef BUILD_UNINSTALLER
; 外框对话框着色钩子（须早于 MUI2.nsh 定义，函数体在 customHeader 里展开）
!define MUI_CUSTOMFUNCTION_GUIINIT sfGuiInit

Var SF_AUTOSTART
Var SF_STARTMENU
Var SF_TASKBAR
; "1" 表示这是一次升级安装（之前装过），用来跳过会弹系统确认框的操作
Var SF_UPDATING
Var sfDlg
Var sfLabel
Var sfCapt
Var sfCard
Var sfBar
Var sfFont
Var sfCbAutostart
Var sfCbStartMenu
Var sfCbTaskbar
; —— 安装位置页（快速选盘）——
Var sfPathLabel      ; 「安装路径」预览文字
Var sfHint           ; 底部提示（冰点还原）
Var sfList           ; 已枚举的盘符，形如 "C|D|"
Var sfIdx            ; 预览计算：选中项盘符在 $sfList 里的字符下标
Var sfChr            ; 枚举回调内：当前盘符字母
Var sfLetter         ; 当前选中的盘符字母
Var sfFree           ; 剩余空间（GB / MB，临时）
Var sfY              ; 枚举回调内：默认选中项的下标
Var sfDrvCount       ; 已枚举的本地磁盘数量
Var sfRadio          ; 选盘下拉框句柄
Var sfCustom         ; 首次进入本页时的安装路径（系统盘的默认位置）
Var sfPreferred      ; 默认盘符（当前安装路径所在盘）
Var sfSysDrive       ; 系统盘（用户目录所在盘）盘符
Var sfPath           ; 选中项对应的目标目录

; ---- 升级安装时沿用上一轮的选项 ----
; 静默自动更新完全没有选项页；如果不读旧值，「开机自启」这类用户手动关掉的选项
; 会被重装逻辑重新打开。判断依据：本程序在 customInstall 里写过 installAutostart，
; 有该键即说明是升级安装，此时以实际的 Run 键 / 任务栏快捷方式为准。
!macro sfLoadPreviousChoices
  StrCpy $SF_UPDATING "0"
  ReadRegStr $0 HKCU "Software\焰火工作室\${APP_EXECUTABLE_FILENAME}" "installAutostart"
  ${If} $0 != ""
    StrCpy $SF_UPDATING "1"
    ReadRegStr $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_EXECUTABLE_FILENAME}"
    ${If} $1 == ""
      StrCpy $SF_AUTOSTART "0"
    ${Else}
      StrCpy $SF_AUTOSTART "1"
    ${EndIf}

    StrCpy $SF_TASKBAR "0"
    IfFileExists "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk" 0 +2
    StrCpy $SF_TASKBAR "1"
  ${EndIf}
!macroend

; ---- 字体：在 addLangs 之后展开，此时语言已注册 ----
!macro customHeader
  ; 中文界面默认是 Tahoma + 宋体回落，和主界面割裂；这里统一成微软雅黑。
  ; sfDefineBrandFont 内部按 LANG_SIMPCHINESE / LANG_ENGLISH 双守卫注入 ^Font 与 ^FontSize。
  !insertmacro sfDefineBrandFont
  !insertmacro sfDefineGuiInit
!macroend

; ---- 安装位置页：快速选盘（默认 ...\StarFlame\StarFlameWorkboard） ----
; 设计要点：
;   · 这一页只管「装在哪个盘」，具体文件夹仍然可以在下一步的目录页里继续改；
;   · C 盘（系统盘）= 当前用户目录 %LOCALAPPDATA%\StarFlame\StarFlameWorkboard，免管理员权限；
;   · 其它磁盘 = X:\StarFlame\StarFlameWorkboard；
;   · 升级安装时若仍选中老目录所在的盘，就沿用老目录，避免装出第二份。
!macro sfDefinePathPage
  ; 枚举本地固定磁盘的回调：$9 = 盘符字符串（形如 "C:\"），除 $9 外只能写本项目自己的变量
  Function sfEnumDriveCb
    StrCpy $sfChr $9 1
    StrCpy $sfList "$sfList$sfChr|"
    IntOp $sfDrvCount $sfDrvCount + 1
  FunctionEnd

  ; 盘符 -> 目标目录（$sfLetter -> $sfPath）
  Function sfPathCompose
    ${If} $sfLetter == ""
      StrCpy $sfPath "$INSTDIR"
    ${ElseIf} $sfCustom != ""
    ${AndIf} $sfLetter == $sfPreferred
      ; 升级安装且与老目录同盘：沿用老目录
      StrCpy $sfPath "$sfCustom"
    ${ElseIf} $sfLetter == $sfSysDrive
      StrCpy $sfPath "$LocalAppData\StarFlame\${APP_FILENAME}"
    ${Else}
      StrCpy $sfPath "$sfLetter:\StarFlame\${APP_FILENAME}"
    ${EndIf}
  FunctionEnd

  ; 按当前下拉框选项刷新 $sfLetter / $sfPath 与预览文字
  Function sfPathPreview
    ${NSD_CB_GetSelectionIndex} $sfRadio $0
    ${If} $0 < 0
      StrCpy $0 0
    ${EndIf}
    IntOp $1 $0 * 2
    StrCpy $sfLetter $sfList 1 $1
    Call sfPathCompose
    ${NSD_SetText} $sfPathLabel "目标目录：$sfPath"
  FunctionEnd

  Function sfPathChange
    Pop $0
    Call sfPathPreview
  FunctionEnd

  Function sfPathPage
    !insertmacro MUI_HEADER_TEXT "安装位置" "选择 星焰作业板 装在哪个磁盘，下一步还可以继续修改文件夹。"

    nsDialogs::Create 1018
    Pop $sfDlg
    ${If} $sfDlg == error
      Abort
    ${EndIf}
    !insertmacro sfDlgDark $sfDlg
    CreateFont $sfFont "$(^Font)" "${SF_FONT_SIZE}" "400"

    ; 系统盘（当前用户目录所在的盘）：LocalAppData 一定落在这块盘上
    StrCpy $sfSysDrive "$WINDIR" 1
    ; 升级安装：记住老目录，若用户仍选同一块盘就原样沿用，避免装出第二份
    ${If} $SF_UPDATING == "1"
      StrCpy $sfCustom "$INSTDIR"
    ${Else}
      StrCpy $sfCustom ""
    ${EndIf}
    ; 默认选中老目录所在的盘；全新安装没有老目录时就是系统盘
    StrCpy $sfPreferred $sfSysDrive
    ${If} $sfCustom != ""
      StrCpy $sfPreferred "$sfCustom" 1
    ${EndIf}

    ; 磁盘列表只枚举一次，退回本页时复用
    ${If} $sfList == ""
      ${GetDrives} "HDD" sfEnumDriveCb
    ${EndIf}
    ; 兜底：万一枚举不到固定磁盘，至少给出系统盘
    ${If} $sfDrvCount == 0
      StrCpy $sfList "$sfSysDrive|"
      IntOp $sfDrvCount $sfDrvCount + 1
    ${EndIf}

    ; 说明（次要灰）
    ${NSD_CreateLabel} 0 0 100% 12u "程序会装进所选磁盘的 StarFlame\StarFlameWorkboard 目录。"
    Pop $sfLabel
    SendMessage $sfLabel ${WM_SETFONT} $sfFont 0
    SetCtlColors $sfLabel "${SF_MUTED}" "${SF_BG}"

    ; 分组：左侧橙色竖条 + 标题（与选项页保持同一套层次）
    ${NSD_CreateLabel} 6u 18u 2u 26u ""
    Pop $sfBar
    SetCtlColors $sfBar "" "${SF_ACCENT}"

    ${NSD_CreateLabel} 14u 18u 160u 10u "安装到哪个磁盘"
    Pop $sfCapt
    CreateFont $0 "$(^Font)" "9" "700"
    SendMessage $sfCapt ${WM_SETFONT} $0 0
    SetCtlColors $sfCapt "${SF_ACCENT_3}" "${SF_BG}"

    ; 下拉框：C: / D: / ...
    ${NSD_CreateDropList} 14u 30u 172u 80u ""
    Pop $sfRadio
    SendMessage $sfRadio ${WM_SETFONT} $sfFont 0

    StrCpy $sfIdx 0
    StrCpy $sfY 0
    StrCpy $1 ""
    ${Do}
      StrCpy $sfChr $sfList 1 $sfIdx
      ${If} $sfChr == ""
        ${ExitDo}
      ${EndIf}
      ${DriveSpace} "$sfChr:\" "/D=F /S=G" $sfFree
      ${If} $sfFree == ""
        StrCpy $0 "$sfChr: 本地磁盘"
      ${Else}
        StrCpy $0 "$sfChr: 本地磁盘  ·  剩余 $sfFree GB"
      ${EndIf}
      ${If} $sfChr == $sfSysDrive
        StrCpy $0 "$0（系统盘）"
      ${EndIf}
      ${NSD_CB_AddString} $sfRadio "$0"
      ${If} $sfChr == $sfPreferred
        StrCpy $1 $sfY
      ${EndIf}
      IntOp $sfY $sfY + 1
      IntOp $sfIdx $sfIdx + 2
    ${Loop}
    ${If} $1 == ""
      StrCpy $1 0
    ${EndIf}
    ${NSD_CB_SetSelectionIndex} $sfRadio $1
    ${NSD_OnChange} $sfRadio sfPathChange

    ; 目标目录预览（浅色重一点，方便核对）
    ${NSD_CreateLabel} 0 46u 100% 18u ""
    Pop $sfPathLabel
    SendMessage $sfPathLabel ${WM_SETFONT} $sfFont 0
    SetCtlColors $sfPathLabel "${SF_TEXT}" "${SF_BG}"

    ; 细分隔线
    ${NSD_CreateLabel} 0 70u 100% 1u ""
    Pop $sfCard
    SetCtlColors $sfCard "" "${SF_CARD}"

    ; 冰点还原提示
    ${NSD_CreateLabel} 0 74u 100% 34u "提示：若这台一体机开启了「冰点还原」，重启会还原系统盘，建议把程序装到 C 盘以外的磁盘；装到 C 盘时文件保存在当前用户目录，全程不需要管理员权限。"
    Pop $sfHint
    SendMessage $sfHint ${WM_SETFONT} $sfFont 0
    SetCtlColors $sfHint "${SF_MUTED}" "${SF_BG}"

    Call sfPathPreview
    nsDialogs::Show
  FunctionEnd

  Function sfPathLeave
    Call sfPathPreview
    ; 动文件之前再核一次所选磁盘的空间（.onInit 里的体检只查了默认盘）
    ${DriveSpace} "$sfLetter:\" "/D=F /S=M" $sfFree
    ${If} $sfFree != ""
    ${AndIf} $sfFree < 700
      MessageBox MB_OK|MB_ICONSTOP "所选磁盘（$sfLetter:）仅剩 $sfFree MB，至少需要 700 MB 才能完成安装/更新。请改选其它磁盘，或先清理空间。" /SD IDOK
      Abort
    ${EndIf}
    StrCpy $INSTDIR "$sfPath"
  FunctionEnd
!macroend

; ---- 欢迎页：暗色整窗自绘页（左侧 109u 侧栏图 + 120u 起的标题/正文） ----
!macro customWelcomePage
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW sfWelcomeShow
  !insertmacro MUI_PAGE_WELCOME

  ; 选盘页紧跟欢迎页：此时 .onInit 里的 initMultiUser 已经把 $INSTDIR 设成
  ; 「升级沿用的旧路径」或「%LOCALAPPDATA%\Programs\StarFlame\StarFlameWorkboard」，
  ; 本页据此给出默认选中盘，用户改盘后写回 $INSTDIR，随后 electron-builder 的目录页
  ; （MUI_PAGE_DIRECTORY）会以该值作为初始路径，用户还能继续微调文件夹。
  !insertmacro sfDefinePathPage
  Page custom sfPathPage sfPathLeave

  ; SHOW 函数在 nsDialogs::Show 之前执行，可在这里改字体/颜色并补装饰控件
  Function sfWelcomeShow
    CreateFont $0 "$(^Font)" "13" "700"
    SendMessage $mui.WelcomePage.Title ${WM_SETFONT} $0 0
    ; 正文也统一成 ${SF_FONT}：nsDialogs 页里的控件继承的是对话框默认字体（中文会回落到宋体）
    CreateFont $1 "$(^Font)" "${SF_FONT_SIZE}" "400"
    SendMessage $mui.WelcomePage.Text ${WM_SETFONT} $1 0
    SetCtlColors $mui.WelcomePage.Title "${SF_ACCENT}" "${SF_BG}"
    SetCtlColors $mui.WelcomePage.Text "${SF_MUTED}" "${SF_BG}"

    ; 标题下一条橙色细线，强化「星焰」气质
    ${NSD_CreateLabel} 120u 40u 64u 2u ""
    Pop $sfBar
    SetCtlColors $sfBar "" "${SF_ACCENT_3}"
  FunctionEnd
!macroend

; ---- 跳过「安装模式」页 ----
; 本项目只发「仅当前用户」安装（perMachine:false）。multiUserUi.nsh 的安装模式页 PRE 里
; 若看到 $isForceCurrentInstall 为 "1"，会走 setInstallModePerUser 后 Abort，该页被静默跳过。
; 宏名大小写不敏感：electron-builder 里写的是 ${customInstallMode}。
!macro customInstallmode
  StrCpy $isForceCurrentInstall "1"
!macroend

; ---- 安装选项页（在 MUI2 之后定义，可用官方头部宏；nsDialogs 暗色卡片布局） ----
!macro sfDefineOptionsPage
  Function sfOptionsPage
    !insertmacro MUI_HEADER_TEXT "安装选项" "三项默认都已勾选，可随时取消。"

    nsDialogs::Create 1018
    Pop $sfDlg
    ${If} $sfDlg == error
      Abort
    ${EndIf}

    ; 整页底色：nsDialogs 自定义页不继承 MUI_BGCOLOR，必须自己给对话框着色
    !insertmacro sfDlgDark $sfDlg

    ; 页面控件统一字体：控件继承的是对话框默认字体，中文在系统里会回落到宋体，
    ; 与主界面的微软雅黑不一致，所以这里显式套用 ^Font / ^FontSize。
    CreateFont $sfFont "$(^Font)" "${SF_FONT_SIZE}" "400"

    ; 说明（次要灰）
    ${NSD_CreateLabel} 0 0 100% 14u "安装完成后，安装程序可以顺便为你准备好下面三项（之后可在托盘菜单里随时更改）："
    Pop $sfLabel
    SendMessage $sfLabel ${WM_SETFONT} $sfFont 0
    SetCtlColors $sfLabel "${SF_MUTED}" "${SF_BG}"

    ; 分组：左侧一条橙色竖条 + 分组标题，竖条只占 x=6u..8u，不与复选框重叠。
    ; （不在复选框背后铺色块：两者重叠时复选框会被整块盖掉，实测不可靠）
    ${NSD_CreateLabel} 6u 22u 2u 48u ""
    Pop $sfBar
    SetCtlColors $sfBar "" "${SF_ACCENT}"

    ${NSD_CreateLabel} 14u 22u 160u 10u "开机与快捷方式"
    Pop $sfCapt
    CreateFont $0 "$(^Font)" "9" "700"
    SendMessage $sfCapt ${WM_SETFONT} $0 0
    SetCtlColors $sfCapt "${SF_ACCENT_3}" "${SF_BG}"

    ; 复选框文字色需要配合 SetWindowTheme 才生效（见主题里的 sfPlainCheckbox）；
    ; 底色传页面底色 ${SF_BG}，控件才不会露出浅色方块。
    ${NSD_CreateCheckbox} 14u 34u 172u 12u "开机自动启动 星焰作业板"
    Pop $sfCbAutostart
    SendMessage $sfCbAutostart ${WM_SETFONT} $sfFont 0
    !insertmacro sfPlainCheckbox $sfCbAutostart "${SF_BG}"
    ${If} $SF_AUTOSTART == "1"
      ${NSD_Check} $sfCbAutostart
    ${EndIf}

    ${NSD_CreateCheckbox} 14u 48u 172u 12u "添加到开始菜单"
    Pop $sfCbStartMenu
    SendMessage $sfCbStartMenu ${WM_SETFONT} $sfFont 0
    !insertmacro sfPlainCheckbox $sfCbStartMenu "${SF_BG}"
    ${If} $SF_STARTMENU == "1"
      ${NSD_Check} $sfCbStartMenu
    ${EndIf}

    ${NSD_CreateCheckbox} 14u 62u 172u 12u "固定到任务栏"
    Pop $sfCbTaskbar
    SendMessage $sfCbTaskbar ${WM_SETFONT} $sfFont 0
    !insertmacro sfPlainCheckbox $sfCbTaskbar "${SF_BG}"
    ${If} $SF_TASKBAR == "1"
      ${NSD_Check} $sfCbTaskbar
    ${EndIf}

    ; 细分隔线（卡面色，只占 1u 高，不与任何控件重叠）
    ${NSD_CreateLabel} 0 80u 100% 1u ""
    Pop $sfCard
    SetCtlColors $sfCard "" "${SF_CARD}"

    ; 提示（次要灰）
    ${NSD_CreateLabel} 0 86u 100% 26u "提示：Windows 10 / 11 会限制第三方程序自动把图标钉到任务栏。若系统拦截，安装完成后可在开始菜单里右键 星焰作业板 选择「固定到任务栏」。"
    Pop $sfLabel
    SendMessage $sfLabel ${WM_SETFONT} $sfFont 0
    SetCtlColors $sfLabel "${SF_MUTED}" "${SF_BG}"

    nsDialogs::Show
  FunctionEnd

  Function sfOptionsLeave
    ${NSD_GetState} $sfCbAutostart $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $SF_AUTOSTART "1"
    ${Else}
      StrCpy $SF_AUTOSTART "0"
    ${EndIf}

    ${NSD_GetState} $sfCbStartMenu $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $SF_STARTMENU "1"
    ${Else}
      StrCpy $SF_STARTMENU "0"
    ${EndIf}

    ${NSD_GetState} $sfCbTaskbar $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $SF_TASKBAR "1"
    ${Else}
      StrCpy $SF_TASKBAR "0"
    ${EndIf}
  FunctionEnd
!macroend

; ---- 安装前体检（由 nsis-require-win10/7.nsh 的 customInit 调用） ----
; 背景：electron-builder 的静默更新会先用旧卸载器把 $INSTDIR 整个删掉，再解压新文件。
; 如果磁盘空间不足（或解压/覆盖失败），就会出现「旧版本被删、新版本没装上、应用消失」。
; 这里在动任何文件之前先查剩余空间，空间不够就直接中止，保持旧版本可用。
!macro sfPreflightInstallChecks
  ${DriveSpace} "$INSTDIR" "/D=F /S=M" $0
  ${If} $0 != ""
    ${If} $0 < 700
      MessageBox MB_OK|MB_ICONSTOP "磁盘剩余空间不足：$INSTDIR 所在分区仅剩 $0 MB，至少需要 700 MB 才能完成安装/更新。$\r$\n本次操作已中止，原有程序与数据没有被改动。请清理磁盘后重试。" /SD IDOK
      Quit
    ${EndIf}
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  !insertmacro sfDefineOptionsPage
  !insertmacro sfDefineInstallHelpers
  Page custom sfOptionsPage sfOptionsLeave
!macroend

; ---- 应用到系统 ----
!macro sfDefineInstallHelpers
  Function sfPinToTaskbar
    ; 方案一：写入「固定到任务栏」快捷方式目录
    CreateDirectory "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
    CreateShortCut "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

    ; 方案二：调用 Shell 的 taskbarpin 动词（系统允许时直接生效）
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$$s=(New-Object -ComObject Shell.Application).NameSpace(''$INSTDIR''); $$i=$$s.ParseName(''${APP_EXECUTABLE_FILENAME}''); if ($$i) { $$i.InvokeVerb(''taskbarpin'') }"'
    Pop $0
  FunctionEnd
!macroend

!macro customInstall
  ; --- 开机自启动 ---
  ${If} $SF_AUTOSTART == "1"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_EXECUTABLE_FILENAME}" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --autostart'
  ${Else}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_EXECUTABLE_FILENAME}"
  ${EndIf}
  ; 记录安装选项，程序首次启动时按此初始化托盘与自启状态
  WriteRegStr HKCU "Software\焰火工作室\${APP_EXECUTABLE_FILENAME}" "installAutostart" "$SF_AUTOSTART"
  WriteRegStr HKCU "Software\焰火工作室\${APP_EXECUTABLE_FILENAME}" "installTaskbar" "$SF_TASKBAR"

  ; --- 开始菜单 ---
  ${If} $SF_STARTMENU != "1"
    ${If} $newStartMenuLink != ""
      Delete "$newStartMenuLink"
    ${EndIf}
  ${EndIf}

  ; --- 任务栏 ---
  ; 升级安装（尤其静默自动更新）不再调 taskbarpin：系统可能弹确认框，
  ; 而且用户当初钉好的图标本来就在，重复钉没有意义。
  ${If} $SF_TASKBAR == "1"
    ${If} $SF_UPDATING != "1"
      Call sfPinToTaskbar
    ${EndIf}
  ${EndIf}

  ; --- 安装后自检 ---
  ; 主程序缺失说明这一步前面（解压/覆盖）出过错，明确提示，避免只留下一个空目录。
  ${IfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    MessageBox MB_OK|MB_ICONEXCLAMATION "安装似乎没有完成：$INSTDIR\${APP_EXECUTABLE_FILENAME} 不存在。$\r$\n请到 https://zy.yanhuoyiyou.cn/desktop/ 下载安装包重新安装（覆盖安装不会丢失数据）。" /SD IDOK
  ${EndIf}
!macroend

!endif ; BUILD_UNINSTALLER

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_EXECUTABLE_FILENAME}"
  DeleteRegKey HKCU "Software\焰火工作室\${APP_EXECUTABLE_FILENAME}"
  Delete "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk"

  ; ---- 静默自动更新：只清注册表/快捷方式，绝不删除安装目录 ----
  ; electron-builder 的卸载器在 ${isUpdated} 分支里会先把 $INSTDIR 下所有文件搬走、
  ; 再 RMDir /r $INSTDIR。紧接着安装器才解压新文件（7z-out → CopyFiles 覆盖）。
  ; 一旦覆盖阶段被打断（文件被占用、杀毒软件扫描、空间不足），就会变成
  ; 「旧版本已删、新版本没装上，应用消失」。这里在更新场景直接退出卸载器，
  ; 让安装器在原目录上覆盖写入：中途失败也还是能用的旧版本。
  ; 用 StdUtils 直接判断命令行是否带 --updated（等价于模板里的 ${isUpdated}，
  ; 但不受 LogicLib 自定义测试宏影响，安装器/卸载器两侧都能安全展开）。
  ${StdUtils.TestParameter} $R9 "updated"
  ${If} $R9 == "true"
    ; 必须显式把退出码置 0：上面几处 DeleteRegValue / DeleteRegKey 在键不存在时会置错误标记，
    ; 而 electron-builder 的 installUtil.nsh 用 ExecWait 取退出码，非 0 会重试 5 次并弹出
    ; "appCannotBeClosed" 对话框——那会直接打断全静默更新。
    SetErrorLevel 0
    Quit
  ${EndIf}
!macroend
