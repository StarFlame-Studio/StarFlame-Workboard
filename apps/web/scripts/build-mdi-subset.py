#!/usr/bin/env python3
"""生成 MDI 图标字体子集：只保留星焰作业板实际用到的图标字形。

用途：@mdi/font 全量 CSS 约 400 KB、woff2 约 400 KB，而实际只用约 250 个图标。
脚本扫描各端 src 与 packages/shared/src 里的 mdi-* 图标名，加上 Vuetify 内置图标别名，
从 @mdi/font 的 CSS/字体中裁出子集，产出：
  apps/web/src/assets/fonts/mdi-subset.woff2
  apps/web/src/styles/mdi-subset.css
  apps/admin/src/assets/fonts/mdi-subset.woff2
  apps/admin/src/styles/mdi-subset.css
新增图标后重新运行（缺 fontTools 时先建临时 venv）：
  python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli
  /tmp/ft/bin/python apps/web/scripts/build-mdi-subset.py
web 每次 build 前会自动跑 apps/web/scripts/check-mdi-subset.mjs 校验，漏图标会直接构建失败。
"""
import glob
import os
import re
import sys

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

WS = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SHARED_SRC = os.path.join(WS, 'packages', 'shared', 'src')
APPS = [
    {'name': 'web', 'dir': os.path.join(WS, 'apps', 'web'), 'font_rel': 'src/assets/fonts/mdi-subset.woff2', 'css_rel': 'src/styles/mdi-subset.css'},
    {'name': 'admin', 'dir': os.path.join(WS, 'apps', 'admin'), 'font_rel': 'src/assets/fonts/mdi-subset.woff2', 'css_rel': 'src/styles/mdi-subset.css'},
]

ICON_RE = re.compile(r'mdi-[a-z0-9-]+')
# Vuetify 组件内部会直接用到的图标（图标别名 + 少量组件内硬编码）
VUETIFY_ICONS = {
    'mdi-alert-circle', 'mdi-apple-keyboard-command', 'mdi-apple-keyboard-control',
    'mdi-apple-keyboard-option', 'mdi-apple-keyboard-shift', 'mdi-arrow-down',
    'mdi-arrow-left', 'mdi-arrow-right', 'mdi-arrow-up', 'mdi-backspace', 'mdi-cached',
    'mdi-calendar', 'mdi-check', 'mdi-checkbox-blank-outline', 'mdi-checkbox-marked',
    'mdi-check-circle', 'mdi-chevron-down', 'mdi-chevron-left', 'mdi-chevron-right',
    'mdi-chevron-up', 'mdi-circle', 'mdi-close', 'mdi-close-circle', 'mdi-cloud-upload',
    'mdi-eyedropper', 'mdi-fullscreen', 'mdi-fullscreen-exit', 'mdi-information',
    'mdi-keyboard-return', 'mdi-keyboard-space', 'mdi-magnify', 'mdi-menu',
    'mdi-menu-down', 'mdi-menu-right', 'mdi-minus', 'mdi-minus-box', 'mdi-page-first',
    'mdi-page-last', 'mdi-palette', 'mdi-paperclip', 'mdi-pause', 'mdi-pencil',
    'mdi-play', 'mdi-plus', 'mdi-radiobox-blank', 'mdi-radiobox-marked', 'mdi-star',
    'mdi-star-half-full', 'mdi-star-outline', 'mdi-unfold-more-horizontal',
    'mdi-volume-high', 'mdi-volume-low', 'mdi-volume-medium', 'mdi-volume-variant-off',
}


def find_mdi_pkg():
    pats = [
        os.path.join(WS, 'node_modules', '.pnpm', '@mdi+font@*', 'node_modules', '@mdi', 'font'),
        os.path.join(WS, 'apps', 'web', 'node_modules', '@mdi', 'font'),
    ]
    for pat in pats:
        for p in glob.glob(pat):
            if os.path.isdir(p):
                return p
    sys.exit('找不到 @mdi/font 包')


def used_icons(src_dirs):
    names = set(VUETIFY_ICONS)
    for d in src_dirs:
        for path in glob.glob(os.path.join(d, '**', '*'), recursive=True):
            if not os.path.isfile(path) or os.path.getsize(path) > 2_000_000:
                continue
            if os.path.splitext(path)[1] not in ('.ts', '.vue', '.js', '.json', '.scss', '.css'):
                continue
            # 跳过本脚本自己的产物，避免上一轮生成的类名被当成图标名重复统计
            if os.path.basename(path) == 'mdi-subset.css':
                continue
            try:
                text = open(path, encoding='utf-8', errors='ignore').read()
            except OSError:
                continue
            names.update(ICON_RE.findall(text))
    return names


def css_map(css_path):
    text = open(css_path, encoding='utf-8').read()
    return {m.group(1): m.group(2) for m in re.finditer(r'\.(mdi-[a-z0-9-]+)::before\s*\{\s*content:\s*"([^"]+)"', text)}


def build_one(app, mapping, font_path, css_path):
    names = used_icons([os.path.join(app['dir'], 'src'), SHARED_SRC])
    missing = sorted(n for n in names if n not in mapping)
    if missing:
        print(f"[{app['name']}] [warn] {len(missing)} 个图标名无映射（动态拼接/拼写问题，已忽略）：{missing[:6]}")
    keep = sorted(n for n in names if n in mapping)
    codepoints = sorted({int(mapping[n][1:], 16) for n in keep})

    font = TTFont(font_path)
    options = Options()
    options.flavor = 'woff2'
    options.desubroutinize = True
    options.layout_features = []
    options.hinting = False
    options.name_IDs = ['*']
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    out_font = os.path.join(app['dir'], app['font_rel'])
    out_css = os.path.join(app['dir'], app['css_rel'])
    os.makedirs(os.path.dirname(out_font), exist_ok=True)
    os.makedirs(os.path.dirname(out_css), exist_ok=True)
    font.save(out_font)

    # CSS 里字体地址按 CSS 文件位置相对计算
    rel_font = os.path.relpath(out_font, os.path.dirname(out_css)).replace(os.sep, '/')
    base = (
        '/* 由 apps/web/scripts/build-mdi-subset.py 生成，请勿手改：只包含实际用到的图标字形 */\n'
        '@font-face {\n'
        '  font-family: "Material Design Icons";\n'
        f'  src: url("{rel_font}") format("woff2");\n'
        '  font-weight: normal;\n'
        '  font-style: normal;\n'
        '  font-display: block;\n'
        '}\n\n'
        '.mdi::before,\n'
        '.mdi-set {\n'
        '  display: inline-block;\n'
        '  font: normal normal normal 24px/1 "Material Design Icons";\n'
        '  font-size: inherit;\n'
        '  text-rendering: auto;\n'
        '  line-height: inherit;\n'
        '  -webkit-font-smoothing: antialiased;\n'
        '  -moz-osx-font-smoothing: grayscale;\n'
        '}\n'
    )
    # 注意：names 已经是完整的类名（如 mdi-access-point），不能再拼一次 "mdi-" 前缀
    rules = ''.join(f'.{n}::before {{\n  content: "\\{mapping[n][1:]}";\n}}\n' for n in keep)
    with open(out_css, 'w', encoding='utf-8') as f:
        f.write(base + '\n' + rules)
    print(f"[{app['name']}] 图标 {len(keep)} 个 / CSS 映射 {len(mapping)} 个，woff2 {os.path.getsize(out_font) // 1024} KB，CSS {os.path.getsize(out_css) // 1024} KB")


def main():
    pkg = find_mdi_pkg()
    mapping = css_map(os.path.join(pkg, 'css', 'materialdesignicons.css'))
    font_path = os.path.join(pkg, 'fonts', 'materialdesignicons-webfont.woff2')
    for app in APPS:
        if not os.path.isdir(app['dir']):
            print(f"[{app['name']}] 跳过：目录不存在")
            continue
        build_one(app, mapping, font_path, os.path.join(pkg, 'css', 'materialdesignicons.css'))


if __name__ == '__main__':
    main()
