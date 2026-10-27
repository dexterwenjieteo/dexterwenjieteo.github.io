"""Convert the supplied HEIC portrait locally; keep the original unchanged.

Requires Pillow and pillow-heif. This is a file-format conversion and resize,
with no crop, retouching, or generated image content.
"""
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageCms, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()
source = Path('Google Scholar Photo.heic')
target = Path('public/images/portrait.webp')

with Image.open(source) as original:
    image = ImageOps.exif_transpose(original)
    embedded_profile = image.info.get('icc_profile')
    if embedded_profile:
        image = ImageCms.profileToProfile(
            image,
            ImageCms.ImageCmsProfile(BytesIO(embedded_profile)),
            ImageCms.createProfile('sRGB'),
            outputMode='RGB',
        )
    else:
        image = image.convert('RGB')
    image.thumbnail((800, 800), Image.Resampling.LANCZOS)
    # A fresh image strips source EXIF, GPS, XMP, and other embedded metadata.
    clean = Image.new('RGB', image.size)
    clean.paste(image)
    target.parent.mkdir(parents=True, exist_ok=True)
    clean.save(target, 'WEBP', quality=88, method=6)

with Image.open(target) as check:
    assert check.width == check.height, 'Expected a square source photo; review before displaying.'
    assert not check.getexif() and not check.info.get('xmp')
    print(f'Prepared {target.as_posix()}: {check.width} x {check.height}, {target.stat().st_size:,} bytes; no crop or embedded personal metadata.')
