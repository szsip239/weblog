#!/usr/bin/env python3
"""
WebLog 发布脚本
- 内容图片 → 腾讯云 COS（可选）或微信临时素材
- 封面图 → 微信素材 API（草稿需要 media_id）
- 草稿 → 微信公众号
- 小绿书 → 图片消息
- AI 图片生成 → __generate:prompt__ 语法
- 图片压缩 → 自动压缩超大图片

用法:
  # 发布文章
  python publish.py --html output/article.html --title "标题" --cover images/cover.png

  # 小绿书（图片消息）
  python publish.py --mode image_post --title "标题" --images "a.jpg,b.jpg"
  python publish.py --mode image_post --title "标题" --from-markdown content/article.md
"""

import argparse
import hashlib
import io
import json
import mimetypes
import os
import re
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from PIL import Image

# COS SDK 可选
try:
    from qcloud_cos import CosConfig, CosS3Client
    HAS_COS_SDK = True
except ImportError:
    HAS_COS_SDK = False

load_dotenv(Path(__file__).parent / ".env")

MAX_IMAGE_WIDTH = 1920
MAX_IMAGE_SIZE_MB = 1


def cos_enabled():
    return HAS_COS_SDK and all([
        os.getenv("COS_SECRET_ID"), os.getenv("COS_SECRET_KEY"),
        os.getenv("COS_BUCKET"), os.getenv("COS_REGION"),
    ])


# ══════════════════════════════════════════════════════
# 图片压缩
# ══════════════════════════════════════════════════════


def compress_image(filepath, max_width=MAX_IMAGE_WIDTH, max_size_mb=MAX_IMAGE_SIZE_MB):
    """
    压缩图片：宽度 >max_width 缩放，文件 >max_size_mb 降低 JPEG 质量。
    返回压缩后的字节数据和文件名。如无需压缩返回 None。
    """
    filepath = Path(filepath)
    img = Image.open(filepath)
    original_size = filepath.stat().st_size
    needs_compress = False

    # 缩放
    if img.width > max_width:
        ratio = max_width / img.width
        new_size = (max_width, int(img.height * ratio))
        img = img.resize(new_size, Image.LANCZOS)
        needs_compress = True
        print(f"  压缩: {filepath.name} {img.width}→{new_size[0]}px")

    # 文件过大时降低质量
    if original_size > max_size_mb * 1024 * 1024 or needs_compress:
        buf = io.BytesIO()
        fmt = 'JPEG' if filepath.suffix.lower() in ('.jpg', '.jpeg') else 'PNG'
        if fmt == 'JPEG':
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            quality = 85
            img.save(buf, format=fmt, quality=quality, optimize=True)
            # 如果还是太大，继续降质
            while buf.tell() > max_size_mb * 1024 * 1024 and quality > 30:
                quality -= 10
                buf = io.BytesIO()
                img.save(buf, format=fmt, quality=quality, optimize=True)
        else:
            img.save(buf, format=fmt, optimize=True)

        buf.seek(0)
        new_size_kb = buf.tell() / 1024
        old_size_kb = original_size / 1024
        if new_size_kb < old_size_kb:
            print(f"  压缩: {filepath.name} {old_size_kb:.0f}KB→{new_size_kb:.0f}KB")
            return buf.read(), filepath.name
    return None, None


# ══════════════════════════════════════════════════════
# AI 图片生成
# ══════════════════════════════════════════════════════

AI_IMG_RE = re.compile(r'<img\s+[^>]*src="__generate:([^"]+)__"', re.IGNORECASE)


def generate_ai_image(prompt, output_dir):
    """
    调用 AI 图片 API 生成图片，保存到 output_dir，返回文件路径。
    支持 OpenAI DALL-E 兼容 API。
    """
    api_key = os.getenv("IMAGE_API_KEY")
    api_base = os.getenv("IMAGE_API_BASE", "https://api.openai.com/v1")
    if not api_key:
        print(f"  警告: IMAGE_API_KEY 未配置，跳过 AI 图片生成")
        return None

    url = f"{api_base}/images/generations"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "prompt": prompt,
        "n": 1,
        "size": os.getenv("IMAGE_SIZE", "1792x1024"),
        "response_format": "url",
    }
    # 如果是 OpenAI，添加 model 参数
    model = os.getenv("IMAGE_MODEL", "dall-e-3")
    if model:
        payload["model"] = model

    try:
        print(f"  生成: {prompt[:50]}...")
        resp = requests.post(url, headers=headers, json=payload, timeout=120)
        data = resp.json()
        img_url = data["data"][0]["url"]

        # 下载图片
        img_resp = requests.get(img_url, timeout=30)
        fname = f"ai_{hashlib.md5(prompt.encode()).hexdigest()[:8]}.png"
        fpath = Path(output_dir) / fname
        fpath.write_bytes(img_resp.content)
        print(f"  ✓ AI 图片: {fname}")
        return str(fpath)
    except Exception as e:
        print(f"  ✗ AI 图片生成失败: {e}")
        return None


def process_ai_images(html, output_dir):
    """扫描 HTML 中的 __generate:prompt__ 图片，生成后替换路径"""
    matches = AI_IMG_RE.findall(html)
    if not matches:
        return html

    print(f"发现 {len(matches)} 张 AI 生成图片请求...")
    for prompt in matches:
        fpath = generate_ai_image(prompt, output_dir)
        if fpath:
            html = html.replace(f'src="__generate:{prompt}__"', f'src="{fpath}"')
    return html


# ══════════════════════════════════════════════════════
# 腾讯云 COS（可选图床）
# ══════════════════════════════════════════════════════

_cos_client = None


def get_cos_client():
    global _cos_client
    if _cos_client:
        return _cos_client
    config = CosConfig(
        Region=os.getenv("COS_REGION"),
        SecretId=os.getenv("COS_SECRET_ID"),
        SecretKey=os.getenv("COS_SECRET_KEY"),
    )
    _cos_client = CosS3Client(config)
    return _cos_client


def upload_to_cos(filepath, compressed_data=None):
    """上传到 COS，返回公网 URL"""
    filepath = Path(filepath)
    if not filepath.exists() and compressed_data is None:
        print(f"  警告: 图片不存在，跳过 — {filepath}")
        return None

    client = get_cos_client()
    bucket = os.getenv("COS_BUCKET")
    region = os.getenv("COS_REGION")
    prefix = os.getenv("COS_PREFIX", "article")

    file_bytes = compressed_data if compressed_data else filepath.read_bytes()
    md5_short = hashlib.md5(file_bytes).hexdigest()[:8]
    cos_key = f"{prefix}/{md5_short}_{filepath.name}"
    content_type = mimetypes.guess_type(filepath.name)[0] or "application/octet-stream"

    try:
        client.put_object(Bucket=bucket, Body=file_bytes, Key=cos_key, ContentType=content_type)
        url = f"https://{bucket}.cos.{region}.myqcloud.com/{cos_key}"
        print(f"  ✓ COS: {filepath.name} → {url}")
        return url
    except Exception as e:
        print(f"  ✗ COS 上传失败: {filepath.name} — {e}")
        return None


# ══════════════════════════════════════════════════════
# 微信 API
# ══════════════════════════════════════════════════════

TOKEN_CACHE_FILE = Path(__file__).parent / ".token_cache.json"


def get_access_token():
    appid = os.getenv("WECHAT_APPID")
    secret = os.getenv("WECHAT_SECRET")
    if not appid or not secret:
        print("错误: 请在 .env 中配置 WECHAT_APPID 和 WECHAT_SECRET")
        sys.exit(1)

    if TOKEN_CACHE_FILE.exists():
        cache = json.loads(TOKEN_CACHE_FILE.read_text())
        if cache.get("expires_at", 0) > time.time():
            return cache["access_token"]

    resp = requests.get("https://api.weixin.qq.com/cgi-bin/token",
                        params={"grant_type": "client_credential", "appid": appid, "secret": secret},
                        timeout=10)
    data = resp.json()
    if "access_token" not in data:
        print(f"错误: 获取 access_token 失败 — {data}")
        sys.exit(1)

    cache = {"access_token": data["access_token"],
             "expires_at": time.time() + data.get("expires_in", 7200) - 300}
    TOKEN_CACHE_FILE.write_text(json.dumps(cache))
    return data["access_token"]


def upload_wechat_image(token, filepath, compressed_data=None):
    """上传内容图片到微信（临时素材）→ 微信 CDN URL"""
    filepath = Path(filepath)
    if not filepath.exists() and compressed_data is None:
        print(f"  警告: 图片不存在，跳过 — {filepath}")
        return None

    url = f"https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token={token}"
    if compressed_data:
        resp = requests.post(url, files={"media": (filepath.name, compressed_data)}, timeout=30)
    else:
        with open(filepath, "rb") as f:
            resp = requests.post(url, files={"media": (filepath.name, f)}, timeout=30)
    data = resp.json()

    if "url" in data:
        print(f"  ✓ 微信: {filepath.name} → {data['url'][:60]}...")
        return data["url"]
    print(f"  ✗ 微信上传失败: {filepath.name} — {data}")
    return None


def upload_cover_image(token, filepath):
    """上传封面图到微信（永久素材）→ media_id"""
    filepath = Path(filepath)
    if not filepath.exists():
        print(f"错误: 封面图不存在 — {filepath}")
        sys.exit(1)

    url = f"https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=image"
    with open(filepath, "rb") as f:
        resp = requests.post(url, files={"media": (filepath.name, f)}, timeout=30)
    data = resp.json()

    if "media_id" in data:
        print(f"  封面: {filepath.name} → media_id={data['media_id']}")
        return data["media_id"]
    print(f"  错误: 封面上传失败 — {data}")
    sys.exit(1)


def upload_media_image(token, filepath):
    """上传图片为永久素材 → media_id（用于小绿书）"""
    filepath = Path(filepath)
    if not filepath.exists():
        print(f"  警告: 图片不存在，跳过 — {filepath}")
        return None

    # 压缩
    compressed, _ = compress_image(filepath)
    url = f"https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=image"
    if compressed:
        resp = requests.post(url, files={"media": (filepath.name, compressed)}, timeout=30)
    else:
        with open(filepath, "rb") as f:
            resp = requests.post(url, files={"media": (filepath.name, f)}, timeout=30)
    data = resp.json()

    if "media_id" in data:
        print(f"  ✓ 素材: {filepath.name} → {data['media_id']}")
        return data["media_id"]
    print(f"  ✗ 素材上传失败: {filepath.name} — {data}")
    return None


def create_draft(token, title, content, thumb_media_id, author="", digest=""):
    url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}"
    article = {
        "title": title[:32], "author": author[:16] if author else "",
        "content": content, "thumb_media_id": thumb_media_id,
        "content_source_url": "", "need_open_comment": 0, "only_fans_can_comment": 0,
    }
    if digest:
        article["digest"] = digest[:128]

    resp = requests.post(url, json={"articles": [article]}, timeout=30)
    data = resp.json()
    if "media_id" in data:
        print(f"\n草稿创建成功!")
        print(f"  media_id: {data['media_id']}")
        print(f"  标题: {title}")
        print(f"\n请前往微信公众号后台 → 草稿箱 发布文章")
        return data["media_id"]
    print(f"\n错误: 草稿创建失败 — {data}")
    sys.exit(1)


# ══════════════════════════════════════════════════════
# 图片处理管线
# ══════════════════════════════════════════════════════

IMG_SRC_RE = re.compile(r'<img\s+[^>]*src="([^"]+)"', re.IGNORECASE)


def is_local_path(src):
    return not src.startswith(("http://", "https://", "data:", "__generate:"))


def upload_image(filepath, token=None, compressed_data=None):
    """统一上传接口：优先 COS，回退微信"""
    if cos_enabled():
        return upload_to_cos(filepath, compressed_data)
    elif token:
        return upload_wechat_image(token, filepath, compressed_data)
    return None


def process_content_images(html, base_dir, token=None):
    """扫描 HTML 中的本地图片 → 压缩 → 上传 → 替换 URL"""
    matches = IMG_SRC_RE.findall(html)
    local_images = [m for m in matches if is_local_path(m)]

    if not local_images:
        print("内容中无本地图片")
        return html

    backend = "COS" if cos_enabled() else "微信临时素材"
    print(f"发现 {len(local_images)} 张本地图片，上传到{backend}...")

    for src in local_images:
        img_path = Path(base_dir) / src if not os.path.isabs(src) else Path(src)
        compressed, _ = compress_image(img_path)
        cdn_url = upload_image(img_path, token, compressed)
        if cdn_url:
            html = html.replace(f'src="{src}"', f'src="{cdn_url}"')

    return html


# ══════════════════════════════════════════════════════
# 小绿书（图片消息）
# ══════════════════════════════════════════════════════

MD_IMG_RE = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')


def extract_images_from_markdown(md_path):
    """从 Markdown 文件中提取所有图片路径"""
    content = Path(md_path).read_text(encoding="utf-8")
    matches = MD_IMG_RE.findall(content)
    return [m[1] for m in matches if not m[1].startswith("__generate:")]


def create_image_post(token, title, image_paths, digest=""):
    """创建图片消息（小绿书），最多 20 张"""
    if len(image_paths) > 20:
        print(f"警告: 图片消息最多 20 张，截取前 20 张")
        image_paths = image_paths[:20]

    if not image_paths:
        print("错误: 没有图片可上传")
        sys.exit(1)

    print(f"上传 {len(image_paths)} 张图片为永久素材...")
    media_ids = []
    for img in image_paths:
        mid = upload_media_image(token, img)
        if mid:
            media_ids.append(mid)

    if not media_ids:
        print("错误: 没有图片上传成功")
        sys.exit(1)

    # 创建图文素材（每张图片一个 article）
    articles = []
    for i, mid in enumerate(media_ids):
        article = {
            "title": title[:32] if i == 0 else f"{title[:28]}({i+1})",
            "thumb_media_id": mid,
            "content": f'<p><img src="" data-src="{mid}" /></p>',
            "content_source_url": "",
            "need_open_comment": 0,
            "only_fans_can_comment": 0,
        }
        if i == 0 and digest:
            article["digest"] = digest[:128]
        articles.append(article)

    url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}"
    resp = requests.post(url, json={"articles": articles}, timeout=30)
    data = resp.json()

    if "media_id" in data:
        print(f"\n图片消息创建成功!")
        print(f"  media_id: {data['media_id']}")
        print(f"  标题: {title}")
        print(f"  图片数: {len(media_ids)}")
        print(f"\n请前往微信公众号后台 → 草稿箱 发布")
        return data["media_id"]

    print(f"\n错误: 图片消息创建失败 — {data}")
    sys.exit(1)


# ══════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════


def main():
    parser = argparse.ArgumentParser(description="WebLog 微信公众号发布工具")
    parser.add_argument("--mode", default="article", choices=["article", "image_post"],
                        help="发布模式: article(文章) 或 image_post(小绿书)")
    parser.add_argument("--html", help="渲染后的 HTML 文件路径（article 模式）")
    parser.add_argument("--title", required=True, help="标题 (≤32字)")
    parser.add_argument("--cover", help="封面图路径 (article 模式，推荐 900×383)")
    parser.add_argument("--author", default="", help="作者名 (≤16字)")
    parser.add_argument("--digest", default="", help="摘要/描述 (≤128字)")
    parser.add_argument("--images", help="图片路径，逗号分隔 (image_post 模式)")
    parser.add_argument("--from-markdown", help="从 Markdown 提取图片 (image_post 模式)")
    args = parser.parse_args()

    # ── 小绿书模式 ──
    if args.mode == "image_post":
        print("模式: 小绿书（图片消息）\n")
        token = get_access_token()

        image_paths = []
        if args.images:
            image_paths = [p.strip() for p in args.images.split(",")]
        elif args.from_markdown:
            image_paths = extract_images_from_markdown(args.from_markdown)
            print(f"从 Markdown 提取到 {len(image_paths)} 张图片")
        else:
            print("错误: 请指定 --images 或 --from-markdown")
            sys.exit(1)

        create_image_post(token, args.title, image_paths, args.digest)
        return

    # ── 文章模式 ──
    if not args.html:
        print("错误: article 模式需要 --html 参数")
        sys.exit(1)
    if not args.cover:
        print("错误: article 模式需要 --cover 参数")
        sys.exit(1)

    html_path = Path(args.html)
    if not html_path.exists():
        print(f"错误: HTML 文件不存在 — {html_path}")
        sys.exit(1)

    use_cos = cos_enabled()
    print(f"图床: {'腾讯云 COS' if use_cos else '微信临时素材'}")
    if not HAS_COS_SDK and os.getenv("COS_SECRET_ID"):
        print("提示: 检测到 COS 配置但未安装 SDK，运行 pip install cos-python-sdk-v5")

    # 1. 微信 token
    print("获取微信 access_token...")
    token = get_access_token()
    print("认证成功\n")

    # 2. 读取 HTML
    html = html_path.read_text(encoding="utf-8")

    # 3. AI 图片生成（如果有 __generate:prompt__ 语法）
    html = process_ai_images(html, html_path.parent)

    # 4. 内容图片上传（压缩 + 上传）
    html = process_content_images(html, html_path.parent, token)

    # 5. 封面图
    print(f"\n上传封面图...")
    if use_cos:
        cover_cos_url = upload_to_cos(args.cover)
        if cover_cos_url:
            print(f"  封面 COS: {cover_cos_url}")
    thumb_media_id = upload_cover_image(token, args.cover)

    # 6. 创建草稿
    print(f"\n创建草稿: {args.title}")
    create_draft(token, args.title, html, thumb_media_id, args.author, args.digest)


if __name__ == "__main__":
    main()
