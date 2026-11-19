#!/usr/bin/env python3
"""星焰作业板 · 安装器位图素材生成器

产出（apps/desktop/build/）：
  installerHeader.bmp  / bootstrapHeader.bmp   450x171 （150x57 的 3 倍）
  installerSidebar.bmp / bootstrapSidebar.bmp  492x942 （164x314 的 3 倍）

3 倍分辨率是为了 2K / 4K 屏：NSIS 会按控件大小拉伸位图，
高分辨率源图在 200% / 300% 缩放下才不糊。

设计语言对齐 apps/web/src/styles/tokens.css 与 download-page/index.html：
  底色 #100F0B / 卡片 #211C18 / 正文 #F7E9DC / 次要 #A9968A / 品牌橙 #FF8A3D
  渐变 #FFA53A -> #F4511E

用法：python3 apps/desktop/scripts/gen-installer-assets.py
依赖：pip install pillow cairosvg
"""
import io
import os

import cairosvg
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.abspath(os.path.join(HERE, "..", "build"))
PREVIEW = os.path.abspath(os.path.join(HERE, "..", ".preview"))

BG = "#100F0B"
TEXT = "#F7E9DC"
MUTED = "#A9968A"
ACCENT = "#FF8A3D"
FONT = "WenQuanYi Zen Hei"

LOGO = """<g transform="translate({x} {y}) scale({s})">
  <rect width="64" height="64" rx="15" fill="#1A1310"/>
  <linearGradient id="sfg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FFA53A"/><stop offset="1" stop-color="#F4511E"/>
  </linearGradient>
  <path d="M18 14c.8 5.8 2.8 7.8 8.6 8.6-5.8.8-7.8 2.8-8.6 8.6-.8-5.8-2.8-7.8-8.6-8.6 5.8-.8 7.8-2.8 8.6-8.6z" fill="url(#sfg)"/>
  <rect x="29" y="20" width="25" height="6" rx="3" fill="url(#sfg)"/>
  <rect x="17" y="34" width="37" height="6" rx="3" fill="#F7E9DC" opacity=".58"/>
  <rect x="17" y="44" width="21" height="6" rx="3" fill="#F7E9DC" opacity=".3"/>
  <g transform="translate(50.5 47.5) rotate(45)">
    <rect x="-3" y="-12.5" width="6" height="16.5" rx="2" fill="#F7E9DC" opacity=".95"/>
    <path d="M-3 4 L0 12 L3 4 Z" fill="url(#sfg)"/>
  </g>
</g>"""

DEFS = """<defs>
  <linearGradient id="bar" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FFA53A"/><stop offset="1" stop-color="#F4511E"/>
  </linearGradient>
  <radialGradient id="halo" cx="0.16" cy="-0.06" r="0.9">
    <stop offset="0" stop-color="#FF8A3D" stop-opacity="0.26"/>
    <stop offset="0.55" stop-color="#FF8A3D" stop-opacity="0.05"/>
    <stop offset="1" stop-color="#FF8A3D" stop-opacity="0"/>
  </radialGradient>
</defs>"""


def sidebar_svg():
    w, h = 492, 942
    p = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (w, h, w, h)]
    p.append(DEFS)
    p.append('<rect width="%d" height="%d" fill="%s"/>' % (w, h, BG))
    p.append('<rect width="%d" height="%d" fill="url(#halo)"/>' % (w, h))
    p.append(LOGO.format(x=30, y=36, s=2.75))
    p.append('<text x="30" y="304" font-family="%s" font-size="60" font-weight="bold" '
             'fill="%s" letter-spacing="1.5">星焰作业板</text>' % (FONT, TEXT))
    p.append('<text x="31" y="354" font-family="%s" font-size="29" fill="%s" '
             'letter-spacing="1">班级作业 · 一目了然</text>' % (FONT, MUTED))
    p.append('<rect x="30" y="394" width="88" height="4" rx="2" fill="%s" opacity="0.85"/>' % ACCENT)
    y = 476
    for row in ["作业墙 · 经典双布局", "一体机与手机自适应", "离线可用 · 自动更新"]:
        p.append('<circle cx="38" cy="%d" r="7" fill="%s"/>' % (y - 10, ACCENT))
        p.append('<text x="62" y="%d" font-family="%s" font-size="28" fill="#E8DCD0">%s</text>'
                 % (y, FONT, row))
        y += 62
    p.append('<rect x="0" y="%d" width="%d" height="96" fill="#191410"/>' % (h - 96, w))
    p.append('<rect x="0" y="%d" width="6" height="96" fill="url(#bar)"/>' % (h - 96))
    p.append('<text x="30" y="%d" font-family="%s" font-size="26" fill="%s">焰火工作室</text>'
             % (h - 54, FONT, MUTED))
    p.append('<text x="30" y="%d" font-family="%s" font-size="22" fill="#6E635A">'
             'Windows 7 SP1 及以上</text>' % (h - 22, FONT))
    p.append('<rect x="0" y="%d" width="%d" height="4" fill="url(#bar)"/>' % (h - 4, w))
    p.append("</svg>")
    return "".join(p)


def header_svg():
    w, h = 450, 171
    p = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (w, h, w, h)]
    p.append(DEFS)
    p.append('<rect width="%d" height="%d" fill="%s"/>' % (w, h, BG))
    p.append('<rect width="%d" height="%d" fill="url(#halo)"/>' % (w, h))
    p.append(LOGO.format(x=20, y=26, s=1.85))
    p.append('<text x="158" y="88" font-family="%s" font-size="38" font-weight="bold" '
             'fill="%s" letter-spacing="1">星焰作业板</text>' % (FONT, TEXT))
    p.append('<text x="159" y="126" font-family="%s" font-size="22" fill="%s">'
             '焰火工作室 · 安装程序</text>' % (FONT, MUTED))
    p.append('<rect x="0" y="%d" width="%d" height="3" fill="url(#bar)"/>' % (h - 3, w))
    p.append("</svg>")
    return "".join(p)


def render(svg, w, h):
    png = cairosvg.svg2png(bytestring=svg.encode("utf-8"), output_width=w, output_height=h)
    return Image.open(io.BytesIO(png)).convert("RGB")


def save_bmp(img, name):
    path = os.path.join(BUILD, name)
    img.save(path, format="BMP")
    print("  %-24s %dx%d  %d B" % (name, img.width, img.height, os.path.getsize(path)))


def main():
    os.makedirs(BUILD, exist_ok=True)
    os.makedirs(PREVIEW, exist_ok=True)
    print("[assets] 生成安装器位图（3 倍超采样，适配 2K/4K 高 DPI）")
    side = render(sidebar_svg(), 492, 942)
    head = render(header_svg(), 450, 171)
    save_bmp(head, "installerHeader.bmp")
    save_bmp(head, "bootstrapHeader.bmp")
    save_bmp(side, "installerSidebar.bmp")
    save_bmp(side, "bootstrapSidebar.bmp")
    head.save(os.path.join(PREVIEW, "header.png"))
    side.save(os.path.join(PREVIEW, "sidebar.png"))
    print("[assets] 完成；预览图在 apps/desktop/.preview/")


if __name__ == "__main__":
    main()
