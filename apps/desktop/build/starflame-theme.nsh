; 星焰作业板 · 安装器共用视觉主题（暗色星焰 + 高 DPI）
;
; 引用处：
;   1) apps/desktop/build/bootstrap.nsi              统一安装引导（独立编译）
;   2) apps/desktop/build/starflame-installer.nsh    electron-builder 安装器（经 nsis.include 注入）
;
; 关键约束：electron-builder 把 nsis.include 的内容拼在 installer.nsi 之前，
; 那时 MUI2.nsh 尚未 include。本文件只放「纯 !define、全局页面指令与 !macro」，
; 不可调用 MUI 页面宏或 ${NSD_*}；页面函数一律包进 !macro 留给展开点。
;
; 色板取自 apps/web/src/styles/tokens.css：
;   底色 #100F0B  卡片 #211C18  正文 #F7E9DC  次要 #A9968A  品牌橙 #FF8A3D
; 渐变 #FFA53A → #F4511E

!ifndef SF_THEME_INCLUDED
!define SF_THEME_INCLUDED

;---------------------------------------------------------------
; 一、视觉常量
;---------------------------------------------------------------
!define SF_BG       "100F0B"
!define SF_CARD     "211C18"
!define SF_TEXT     "F7E9DC"
!define SF_MUTED    "A9968A"
!define SF_ACCENT   "FF8A3D"
!define SF_ACCENT_2 "F4511E"
!define SF_DEEP     "221208"
; 渐变高亮端，用于需要比 SF_ACCENT 再亮一档的细节（强调线、标题）
!define SF_ACCENT_3 "FFA53A"

;---------------------------------------------------------------
; 二、字体：微软雅黑（Win7 起系统自带，Win10/11 为同源字族）
;     默认 ^Font 是 Tahoma，中文会回落到宋体，与主界面割裂
;---------------------------------------------------------------
!define SF_FONT      "Microsoft YaHei"
!define SF_FONT_SIZE "9"

;---------------------------------------------------------------
; 三、高 DPI 清单（2K / 4K 与 125%–300% 缩放下不被系统位图拉伸糊掉）
;     NSIS 语法没有运行期 DPI 缩放，全靠 Manifest + u 单位布局 + 3x 位图
;---------------------------------------------------------------
ManifestDPIAware true
ManifestDPIAwareness "PerMonitorV2"
ManifestSupportedOS all

;---------------------------------------------------------------
; 四、MUI2 配色（必须早于 MUI2.nsh，才能盖掉 MUI_DEFAULT 的 FFFFFF / 000000）
;---------------------------------------------------------------
!define MUI_BGCOLOR "${SF_BG}"
!define MUI_TEXTCOLOR "${SF_TEXT}"
!define MUI_FINISHPAGE_LINK_COLOR "${SF_ACCENT}"
!define MUI_FINISHPAGE_LINK_LOCATION "https://zy.yanhuoyiyou.cn/"

; 目录页：MUI 仅在该宏存在时才着色（Directory.nsh:114-116，只作用于路径输入框）
!define MUI_DIRECTORYPAGE_BGCOLOR "${SF_BG}"
!define MUI_DIRECTORYPAGE_TEXTCOLOR "${SF_TEXT}"

; 安装进度页：暗底浅字 + 彩色平滑进度条
!define MUI_INSTFILESPAGE_COLORS "${SF_TEXT} ${SF_BG}"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth colored"
InstallColors ${SF_TEXT} ${SF_BG}
InstProgressFlags smooth colored

; 底部品牌条文字（MUI 用 $(^Branding) 渲染，BrandingText 正是它的来源）
BrandingText "星焰作业板 · 焰火工作室"

;---------------------------------------------------------------
; 五、nsDialogs 自绘控件着色宏
;---------------------------------------------------------------
!macro sfColor HANDLE FG BG
  SetCtlColors ${HANDLE} "${FG}" "${BG}"
!macroend

; 整页底色：nsDialogs 自定义页的第一件事（SetCtlColors 作用于对话框本身）
!macro sfDlgDark HANDLE
  SetCtlColors ${HANDLE} "" "${SF_BG}"
!macroend

; 复选框：SetCtlColors 改不动「主题化」checkbox 的文字色（NSIS bug #443），
; 必须同时用 SetWindowTheme 去掉视觉样式，文字色才会生效。
; 与 MUI2 自己在 Finish.nsh 处理高对比度时的做法一致。
; BG 必须传「该复选框实际所在区域的底色」：底色不一致时会露出生硬的方块。
; 注意：不要在这类复选框背后再铺一块不同颜色的静态矩形 —— 两者重叠时
; 复选框会连同勾选框一起被覆盖掉（实测 wine 与高 DPI 下都不可靠），
; 所以本项目的选项页把复选框直接铺在页面上，只用竖条/分隔线做层次。
!macro sfPlainCheckbox HANDLE BG
  SetCtlColors ${HANDLE} "${SF_TEXT}" "${BG}"
  System::Call 'UXTHEME::SetWindowTheme(p${HANDLE},w" ",w" ")'
!macroend

; 单选框（radio）：与复选框同一个 BUTTON 类，同样需要先去掉视觉样式，SetCtlColors 才会生效。
!macro sfPlainRadio HANDLE BG
  SetCtlColors ${HANDLE} "${SF_TEXT}" "${BG}"
  System::Call 'UXTHEME::SetWindowTheme(p${HANDLE},w" ",w" ")'
!macroend

;---------------------------------------------------------------
; 六、字体注入
;     LangString 必须落在对应 MUI_LANGUAGE 之后，故留给 customHeader /
;     bootstrap 的语言行之后展开。按已加载语言逐个守卫：electron-builder
;     单语言构建只有 LANG_ENGLISH，中文界面才是 LANG_SIMPCHINESE。
;---------------------------------------------------------------
!macro sfDefineBrandFont
  !ifndef SF_FONT_DEFINED
    !define SF_FONT_DEFINED
    !ifdef LANG_SIMPCHINESE
      LangString ^Font     ${LANG_SIMPCHINESE} "${SF_FONT}"
      LangString ^FontSize ${LANG_SIMPCHINESE} "${SF_FONT_SIZE}"
    !endif
    !ifdef LANG_ENGLISH
      LangString ^Font     ${LANG_ENGLISH} "${SF_FONT}"
      LangString ^FontSize ${LANG_ENGLISH} "${SF_FONT_SIZE}"
    !endif
  !endif
!macroend

;---------------------------------------------------------------
; 七、外框对话框（按钮条所在的那层）着色
;     MUI_BGCOLOR 只作用于页面与部分控件，最底部「下一步 / 取消」所在的
;     外框对话框仍是系统浅色，在暗色页面上会留一条白带。MUI2 提供
;     MUI_CUSTOMFUNCTION_GUIINIT 钩子（Interface.nsh:299-300），在这里
;     把外框刷成页面底色即可；按钮本身保持系统主题，避免深底深字看不清。
;     用法：!define MUI_CUSTOMFUNCTION_GUIINIT sfGuiInit（须早于 MUI2.nsh）
;           然后在语言注册之后 !insertmacro sfDefineGuiInit
;---------------------------------------------------------------
!macro sfDefineGuiInit
  Function sfGuiInit
    SetCtlColors $HWNDPARENT "" "${SF_BG}"
  FunctionEnd
!macroend
!endif ; SF_THEME_INCLUDED