"""
build_assets.py
===============
Downloads libusb-1.0.dll (x64) and Zadig.exe, then generates the app icon.
Run ONCE before building the EXE:
    C:\Python312\python.exe build_assets.py
"""

import os
import io
import sys
import struct
import zipfile
import urllib.request
import urllib.error

ASSETS_DIR  = os.path.join(os.path.dirname(__file__), "assets")
LIBUSB_DIR  = os.path.join(ASSETS_DIR, "libusb")


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


# ── Download helper ───────────────────────────────────────────────────────────
def download(url: str, dest: str, label: str):
    if os.path.isfile(dest):
        print(f"  [skip] {label} already exists.")
        return
    print(f"  [....] Downloading {label} …", end="", flush=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        with open(dest, "wb") as f:
            f.write(data)
        print(f"  done  ({len(data)//1024} KB)")
    except Exception as exc:
        print(f"\n  [WARN] Could not download {label}: {exc}")
        print(f"         Manually place it at: {dest}")


# ── libusb ────────────────────────────────────────────────────────────────────
def download_libusb():
    ensure_dir(LIBUSB_DIR)
    dll_path = os.path.join(LIBUSB_DIR, "libusb-1.0.dll")
    if os.path.isfile(dll_path):
        print("  [skip] libusb-1.0.dll already exists.")
        return

    # Try the latest GitHub release zip
    zip_url  = "https://github.com/libusb/libusb/releases/download/v1.0.27/libusb-1.0.27.7z"
    # Fallback: use the pre-built Windows binaries zip from libusb releases page
    zip_url2 = "https://github.com/libusb/libusb/releases/download/v1.0.27/libusb-1.0.27-binaries.7z"
    # Direct DLL from a known good source (vs2022 x64 build)
    dll_url  = "https://github.com/libusb/libusb/releases/download/v1.0.27/libusb-1.0.27-binaries.7z"

    # Best approach: download the zip distribution
    zip_dest = os.path.join(LIBUSB_DIR, "libusb-dist.zip")
    zip_url_fallback = (
        "https://github.com/libusb/libusb/releases/download/v1.0.26/"
        "libusb-1.0.26-binaries.zip"
    )
    print("  [....] Downloading libusb Windows binaries…", end="", flush=True)
    downloaded = False
    for url in [zip_url_fallback]:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = resp.read()
            with open(zip_dest, "wb") as f:
                f.write(data)
            print(f" done ({len(data)//1024} KB)")
            downloaded = True
            break
        except Exception as exc:
            print(f"\n  [WARN] {exc}")

    if downloaded:
        try:
            with zipfile.ZipFile(zip_dest, "r") as zf:
                # Find the 64-bit DLL inside the archive
                dll_entries = [n for n in zf.namelist()
                               if n.lower().endswith("libusb-1.0.dll")
                               and ("x64" in n.lower() or "VS2022" in n or "MinGW64" in n.lower())]
                if not dll_entries:
                    dll_entries = [n for n in zf.namelist()
                                   if n.lower().endswith("libusb-1.0.dll")]
                if dll_entries:
                    with zf.open(dll_entries[0]) as src, open(dll_path, "wb") as dst:
                        dst.write(src.read())
                    print(f"  [OK]  Extracted: {dll_entries[0]} → libusb-1.0.dll")
                else:
                    print("  [WARN] Could not find libusb-1.0.dll in the archive.")
                    print(f"         Archive contents: {zf.namelist()[:10]}")
            os.remove(zip_dest)
        except Exception as exc:
            print(f"  [WARN] Extraction failed: {exc}")
    else:
        print("\n  [WARN] Could not download libusb automatically.")
        print(f"         Please manually download libusb-1.0.dll (x64) and place it at:")
        print(f"         {dll_path}")


# ── Zadig ─────────────────────────────────────────────────────────────────────
def download_zadig():
    zadig_path = os.path.join(ASSETS_DIR, "zadig.exe")
    download(
        "https://github.com/pbatard/zadig/releases/download/v2.9/zadig-2.9.exe",
        zadig_path,
        "Zadig v2.9"
    )


# ── Icon (generated programmatically) ─────────────────────────────────────────
def generate_icon():
    """Generate a simple .ico file using only stdlib."""
    icon_path = os.path.join(ASSETS_DIR, "icon.ico")
    if os.path.isfile(icon_path):
        print("  [skip] icon.ico already exists.")
        return

    try:
        from PIL import Image, ImageDraw, ImageFont
        _generate_icon_pil(icon_path)
    except ImportError:
        _generate_icon_raw(icon_path)


def _generate_icon_pil(icon_path: str):
    """Generate a nice icon using Pillow."""
    from PIL import Image, ImageDraw

    sizes = [256, 128, 64, 48, 32, 16]
    images = []

    for size in sizes:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d   = ImageDraw.Draw(img)

        # Background circle
        pad = size // 10
        d.ellipse([pad, pad, size - pad, size - pad], fill=(233, 69, 96, 255))

        # Inner white circle
        inner_pad = size // 4
        d.ellipse([inner_pad, inner_pad, size - inner_pad, size - inner_pad],
                  fill=(255, 255, 255, 255))

        # "E" letter
        cx, cy = size // 2, size // 2
        lw = max(1, size // 16)
        arm = size // 5
        d.rectangle([cx - arm, cy - arm, cx - arm + lw, cy + arm], fill=(233, 69, 96, 255))
        d.rectangle([cx - arm, cy - lw // 2, cx + arm, cy + lw // 2], fill=(233, 69, 96, 255))
        d.rectangle([cx - arm, cy - arm, cx + arm, cy - arm + lw], fill=(233, 69, 96, 255))
        d.rectangle([cx - arm, cy + arm - lw, cx + arm, cy + arm], fill=(233, 69, 96, 255))

        images.append(img)

    images[0].save(icon_path, format="ICO", sizes=[(s, s) for s in sizes],
                   append_images=images[1:])
    print(f"  [OK]  icon.ico generated with Pillow ({len(sizes)} sizes).")


def _generate_icon_raw(icon_path: str):
    """Fallback: write a minimal 16x16 and 32x32 .ico without Pillow."""
    def make_bmp(size, fg, bg):
        """Create a simple BMP pixel data for an ICO entry."""
        w = h = size
        # BITMAPINFOHEADER (40 bytes)
        header = struct.pack("<IiiHHIIiiII",
                             40, w, h * 2, 1, 32, 0, 0, 0, 0, 0, 0)
        # Pixel data: BGRA
        pixels = b""
        for y in range(h - 1, -1, -1):
            for x in range(w):
                # Draw a simple "E" pattern
                cx = x - w // 2
                cy = y - h // 2
                arm = w // 4
                lw  = max(1, w // 8)
                if (abs(cx + arm) <= lw or abs(cy) <= lw or
                        abs(cy - arm) <= lw or abs(cy + arm) <= lw):
                    if -arm - lw <= cx <= arm + lw:
                        pixels += fg
                        continue
                pixels += bg
        # AND mask (1-bit, padded to 4-byte row)
        row_bytes = ((w + 31) // 32) * 4
        mask = b"\x00" * (row_bytes * h)
        return header + pixels + mask

    fg = struct.pack("BBBB", 96, 69, 233, 255)   # #E94560 BGRA
    bg = struct.pack("BBBB", 46, 49, 26, 255)    # #1a312e BGRA

    bmp16 = make_bmp(16, fg, bg)
    bmp32 = make_bmp(32, fg, bg)

    # ICO header
    ico_header = struct.pack("<HHH", 0, 1, 2)  # reserved, type=1, count=2
    # Directory entries (16 bytes each)
    offset = 6 + 2 * 16
    dir16  = struct.pack("<BBBBHHII", 16, 16, 0, 0, 1, 32, len(bmp16), offset)
    offset += len(bmp16)
    dir32  = struct.pack("<BBBBHHII", 32, 32, 0, 0, 1, 32, len(bmp32), offset)

    with open(icon_path, "wb") as f:
        f.write(ico_header + dir16 + dir32 + bmp16 + bmp32)
    print("  [OK]  icon.ico generated (fallback mode — basic icon).")


# ── Wizard banner images ───────────────────────────────────────────────────────
def generate_wizard_images():
    """Generate the Inno Setup wizard banner and small images."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("  [skip] Pillow not available — skipping wizard images.")
        return

    # Banner: 497x314
    banner_path = os.path.join(ASSETS_DIR, "wizard_banner.bmp")
    if not os.path.isfile(banner_path):
        img = Image.new("RGB", (497, 314), (26, 26, 46))
        d   = ImageDraw.Draw(img)
        d.rectangle([0, 0, 6, 314], fill=(233, 69, 96))
        d.text((30, 40),  "EPSON",  fill=(255, 255, 255))
        d.text((30, 80),  "L120 Waste Ink",  fill=(78, 204, 163))
        d.text((30, 110), "Pad Resetter",    fill=(78, 204, 163))
        d.text((30, 160), "v1.0",            fill=(136, 146, 176))
        img.save(banner_path, format="BMP")
        print("  [OK]  wizard_banner.bmp generated.")

    # Small: 55x58
    small_path = os.path.join(ASSETS_DIR, "wizard_small.bmp")
    if not os.path.isfile(small_path):
        img = Image.new("RGB", (55, 58), (233, 69, 96))
        d   = ImageDraw.Draw(img)
        d.text((10, 20), "E", fill=(255, 255, 255))
        img.save(small_path, format="BMP")
        print("  [OK]  wizard_small.bmp generated.")


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("  Build Assets Downloader & Generator")
    print("=" * 60)

    ensure_dir(ASSETS_DIR)
    ensure_dir(LIBUSB_DIR)

    print("\n[1/4] Downloading libusb …")
    download_libusb()

    print("\n[2/4] Downloading Zadig …")
    download_zadig()

    print("\n[3/4] Generating app icon …")
    generate_icon()

    print("\n[4/4] Generating wizard images …")
    generate_wizard_images()

    print("\n" + "=" * 60)
    print("  Assets ready. Run  build.bat  to compile the EXE.")
    print("=" * 60 + "\n")
