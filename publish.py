#!/usr/bin/env python3
"""
WebLog 发布脚本
内容图片 → 腾讯云 COS（可选）或微信临时素材
封面图 → 微信素材 API（草稿接口需要 media_id）
草稿 → 微信公众号

用法:
  python publish.py --html output/article.html --title "标题" --cover images/cover.png
  python publish.py --html output/article.html --title "标题" --cover images/cover.png --author "作者" --digest "摘要"
"""

import argparse
import hashlib
import json
import mimetypes
import os
import re
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# COS SDK 可选导入
try:
    from qcloud_cos import CosConfig, CosS3Client
    HAS_COS_SDK = True
except ImportError:
    HAS_COS_SDK = False

# 加载 .env 配置
load_dotenv(Path(__file__).parent / ".env")


def cos_enabled():
    """检查 COS 是否已配置"""
    return HAS_COS_SDK and all([
        os.getenv("COS_SECRET_ID"),
        os.getenv("COS_SECRET_KEY"),
        os.getenv("COS_BUCKET"),
        os.getenv("COS_REGION"),
    ])


# ══════════════════════════════════════════════════════
# 腾讯云 COS（可选图床）
# ══════════════════════════════════════════════════════

_cos_client = None


def get_cos_client():
    """初始化 COS 客户端（懒加载单例）"""
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


def upload_to_cos(filepath):
    """
    上传图片到 COS，返回公网 URL
    路径: {COS_PREFIX}/{md5_hash[:8]}_{filename}
    """
    filepath = Path(filepath)
    if not filepath.exists():
        print(f"  警告: 图片不存在，跳过 — {filepath}")
        return None

    client = get_cos_client()
    bucket = os.getenv("COS_BUCKET")
    region = os.getenv("COS_REGION")
    prefix = os.getenv("COS_PREFIX", "article")

    file_bytes = filepath.read_bytes()
    md5_short = hashlib.md5(file_bytes).hexdigest()[:8]
    cos_key = f"{prefix}/{md5_short}_{filepath.name}"
    content_type = mimetypes.guess_type(filepath.name)[0] or "application/octet-stream"

    try:
        client.put_object(
            Bucket=bucket, Body=file_bytes, Key=cos_key, ContentType=content_type,
        )
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
    """获取 access_token，自动缓存 2 小时"""
    appid = os.getenv("WECHAT_APPID")
    secret = os.getenv("WECHAT_SECRET")
    if not appid or not secret:
        print("错误: 请在 .env 中配置 WECHAT_APPID 和 WECHAT_SECRET")
        sys.exit(1)

    if TOKEN_CACHE_FILE.exists():
        cache = json.loads(TOKEN_CACHE_FILE.read_text())
        if cache.get("expires_at", 0) > time.time():
            return cache["access_token"]

    url = "https://api.weixin.qq.com/cgi-bin/token"
    params = {"grant_type": "client_credential", "appid": appid, "secret": secret}
    resp = requests.get(url, params=params, timeout=10)
    data = resp.json()
    if "access_token" not in data:
        print(f"错误: 获取 access_token 失败 — {data}")
        sys.exit(1)

    cache = {
        "access_token": data["access_token"],
        "expires_at": time.time() + data.get("expires_in", 7200) - 300,
    }
    TOKEN_CACHE_FILE.write_text(json.dumps(cache))
    return data["access_token"]


def upload_wechat_image(token, filepath):
    """
    上传内容图片到微信（临时素材）
    POST /cgi-bin/media/uploadimg → 返回微信 CDN URL
    限制: JPG/PNG, 单张 ≤1MB
    """
    filepath = Path(filepath)
    if not filepath.exists():
        print(f"  警告: 图片不存在，跳过 — {filepath}")
        return None

    size_mb = filepath.stat().st_size / (1024 * 1024)
    if size_mb > 1:
        print(f"  警告: 图片超 1MB ({size_mb:.1f}MB)，可能失败 — {filepath}")

    url = f"https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token={token}"
    with open(filepath, "rb") as f:
        resp = requests.post(url, files={"media": (filepath.name, f)}, timeout=30)
    data = resp.json()

    if "url" in data:
        print(f"  ✓ 微信: {filepath.name} → {data['url'][:60]}...")
        return data["url"]

    print(f"  ✗ 微信上传失败: {filepath.name} — {data}")
    return None


def upload_cover_image(token, filepath):
    """上传封面图到微信（永久素材）→ 返回 media_id"""
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


def create_draft(token, title, content, thumb_media_id, author="", digest=""):
    """创建微信草稿"""
    url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}"
    article = {
        "title": title[:32],
        "author": author[:16] if author else "",
        "content": content,
        "thumb_media_id": thumb_media_id,
        "content_source_url": "",
        "need_open_comment": 0,
        "only_fans_can_comment": 0,
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
# 图片处理管线（自动选择 COS 或微信）
# ══════════════════════════════════════════════════════

IMG_SRC_RE = re.compile(r'<img\s+[^>]*src="([^"]+)"', re.IGNORECASE)


def is_local_path(src):
    return not src.startswith(("http://", "https://", "data:"))


def process_content_images(html, base_dir, wechat_token=None):
    """扫描 HTML 中的本地图片，上传后替换 URL（优先 COS，回退微信）"""
    matches = IMG_SRC_RE.findall(html)
    local_images = [m for m in matches if is_local_path(m)]

    if not local_images:
        print("内容中无本地图片")
        return html

    use_cos = cos_enabled()
    backend = "COS" if use_cos else "微信临时素材"
    print(f"发现 {len(local_images)} 张本地图片，上传到{backend}...")

    for src in local_images:
        img_path = Path(base_dir) / src if not os.path.isabs(src) else Path(src)

        if use_cos:
            cdn_url = upload_to_cos(img_path)
        else:
            cdn_url = upload_wechat_image(wechat_token, img_path)

        if cdn_url:
            html = html.replace(f'src="{src}"', f'src="{cdn_url}"')

    return html


# ══════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════


def main():
    parser = argparse.ArgumentParser(description="WebLog 微信公众号发布工具")
    parser.add_argument("--html", required=True, help="渲染后的 HTML 文件路径")
    parser.add_argument("--title", required=True, help="文章标题 (≤32字)")
    parser.add_argument("--cover", required=True, help="封面图路径 (推荐 900×383)")
    parser.add_argument("--author", default="", help="作者名 (≤16字)")
    parser.add_argument("--digest", default="", help="摘要 (≤128字)")
    args = parser.parse_args()

    html_path = Path(args.html)
    if not html_path.exists():
        print(f"错误: HTML 文件不存在 — {html_path}")
        sys.exit(1)

    # 图床选择
    use_cos = cos_enabled()
    if use_cos:
        print("图床: 腾讯云 COS")
    else:
        if not HAS_COS_SDK and os.getenv("COS_SECRET_ID"):
            print("提示: 检测到 COS 配置但未安装 SDK，请运行 pip install cos-python-sdk-v5")
        print("图床: 微信临时素材（如需跨平台复用图片，请配置 COS）")

    # 1. 获取微信 token
    print("获取微信 access_token...")
    token = get_access_token()
    print("认证成功\n")

    # 2. 读取 HTML
    html = html_path.read_text(encoding="utf-8")

    # 3. 处理内容图片
    base_dir = html_path.parent
    html = process_content_images(html, base_dir, wechat_token=token)

    # 4. 封面图
    print(f"\n上传封面图...")
    if use_cos:
        cover_cos_url = upload_to_cos(args.cover)
        if cover_cos_url:
            print(f"  封面 COS URL: {cover_cos_url}")
    thumb_media_id = upload_cover_image(token, args.cover)

    # 5. 创建草稿
    print(f"\n创建草稿: {args.title}")
    create_draft(token, args.title, html, thumb_media_id, args.author, args.digest)


if __name__ == "__main__":
    main()
