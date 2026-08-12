#!/usr/bin/env python3
"""Bring the approved Munaxa logo artwork into the platform, wearing the platform's colours.

    python3 scripts/import-brand-artwork.py <dir-of-approved-exports> [<out-dir>]

Run it when the approved artwork changes, and — this is the part that is easy to forget — when a
**canonical colour** changes. The assets under `assets/` are generated from the exports plus
`themes/<id>/brand.ts`; retuning a palette without re-running this leaves a product whose mark and
whose `--primary` are two different colours.

Offline tooling, deliberately outside the Node build: it runs once per artwork change, needs
Python and Pillow (`pip install pillow`), and nothing in the package depends on it at build or at
runtime. `assets/README.md` records what it does and why.

Two sources, and they answer different questions:

  the supplied ZIPs   → what the logo *is*: geometry, proportions, lockup, spacing, negative
                        space, typography, the square punctuation mark.
  @munaxa/platform    → what colour it is. `themes/<id>/brand.ts` is the canonical value and the
                        only one; the colour baked into a supplied PNG is not consulted.

So the artwork is recoloured rather than sampled. Nothing is redrawn, retraced, re-spaced or
rescaled non-uniformly — a pixel that was inside the mark is still inside the mark, at the same
place, with the same alpha.

Five operations, and only these:

  trim     — crop the empty margin around the artboard. Padding only; the ratio of the art is kept.
  key      — turn a flat white ground transparent, feathering the antialiased rim.
  recolour — every *chromatic* pixel is a blend of the product colour with its background. Recover
             how much of it was brand (in linear light, which is what the blend physically was) and
             re-lay the canonical colour at the same coverage. Neutral pixels — the `munaxa.`
             wordmark's ink, the white knockouts — are left exactly alone.
  on-dark  — the neutral ink of the wordmark is remapped to white, alpha preserved. The canonical
             product colour does not change between schemes; only the neutral does.
  compose  — placing finished artwork, unscaled in aspect, on a flat canvas for icons and the
             share image.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

PACKAGE = Path(__file__).resolve().parent.parent
PLATFORM_THEMES = PACKAGE / "themes"

# Where the approved exports were unpacked, and where the finished artwork lands. The default
# output is `assets/`, which is what the package ships — this script writes the real thing rather
# than something a human then copies, because a copy step is a step that gets skipped.
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else PACKAGE / "brand-artwork-source"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else PACKAGE / "assets"

# The ZIP names are inconsistent between products ("WordmarkLogo", "wordmarkLogo", "WordMarkLogo"),
# which is exactly why nothing downstream is allowed to reference them.
PRODUCTS = {
    "school": {
        "dir": "schoollogos",
        "horizontal": "school-horizontal logo.png",
        "stacked": "school-Vertical full logo.png",
        "wordmark": "school-WordmarkLogo.png",
        "symbol": "school-SymbolFaviconLogo.png",
        "tagline": "school-Tagline full logo.png",
        "app_icon": "school-app icon.png",
        "on_brand": "school-Cyan-background version.png",
    },
    "work": {
        "dir": "worklogos",
        "horizontal": "work-horizontal logo.png",
        "stacked": "work-Vertical full logo.png",
        "wordmark": "work-wordmarkLogo.png",
        "symbol": "work-SymbolFaviconLogo.png",
        "tagline": "work-Tagline full logo.png",
        "app_icon": "work-app icon.png",
        "on_brand": "work-Red-background version.png",
    },
    "docs": {
        "dir": "docslogos",
        "horizontal": "docs-horizontal logo.png",
        "stacked": "docs-Vertical full logo.png",
        "wordmark": "docs-WordMarkLogo.png",
        "symbol": "docs-SymbolFaviconLogo.png",
        "tagline": "docs-Tagline full logo.png",
        "app_icon": "docs-app icon.png",
        "on_brand": "docs-Teal-background version.png",
    },
}

# The corporate identity has no lockup of its own in the supplied artwork — no `munaxa. group`
# exists and inventing one is not this script's business. What it can honestly have is the two
# pieces that stand alone: the shared M symbol and the shared `munaxa.` wordmark, in the corporate
# colour. The geometry is taken from School's export because the three are pixel-identical
# artwork; only the colour differs, and the colour is about to be replaced anyway.
GROUP_GEOMETRY_FROM = "school"

# The page background the neutral ink is drawn against, for the dark share image. Matches
# `--background` in every dark palette (`themes/base/neutrals.css`, neutral-950).
DARK_CANVAS = (0x0A, 0x0F, 0x1A)

# How chromatic a pixel has to be before it counts as product colour rather than ink or paper.
CHROMA_FLOOR = 24


def canonical_colors() -> dict[str, str]:
    """Read the canonical product colours out of the platform, never out of a PNG."""
    node = subprocess.run(
        [
            "node",
            "-e",
            "const fs=require('fs');const out={};"
            "for (const id of ['group','school','work','docs']) {"
            f"  const s=fs.readFileSync('{PLATFORM_THEMES}/'+id+'/brand.ts','utf8');"
            "  out[id]=/DEFAULT: '(#[0-9A-Fa-f]{6})'/.exec(s)[1];"
            "}console.log(JSON.stringify(out));",
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(node.stdout)


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[1 + i : 3 + i], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def load(product: str, role: str) -> Image.Image:
    spec = PRODUCTS[product]
    return Image.open(SRC / spec["dir"] / spec[role]).convert("RGBA")


def key_white(im: Image.Image, threshold: int = 244) -> Image.Image:
    """Turn a flat white background transparent, feathering the near-white edge pixels."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lo = min(r, g, b)
            if lo >= threshold and max(r, g, b) - lo < 12:
                px[x, y] = (r, g, b, 0)
            elif lo > 225 and max(r, g, b) - lo < 12:
                px[x, y] = (r, g, b, int(a * (244 - lo) / 19))
    return out


def trim(im: Image.Image) -> Image.Image:
    """Crop the empty margin around the artwork. Padding only — the ratio of the art is kept."""
    box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    return im if box is None else im.crop(box)


# --- colour ------------------------------------------------------------------------------------
#
# sRGB is gamma-encoded, so a half-covered edge pixel is *not* the arithmetic mean of the mark and
# the paper. Recovering coverage in linear light and re-laying the canonical colour there is what
# keeps an antialiased curve the same shape rather than making it bloom or thin.

_TO_LINEAR = [
    (c / 255 / 12.92) if (c / 255) <= 0.04045 else (((c / 255) + 0.055) / 1.055) ** 2.4
    for c in range(256)
]


def _to_srgb(value: float) -> int:
    value = min(1.0, max(0.0, value))
    encoded = 12.92 * value if value <= 0.0031308 else 1.055 * (value ** (1 / 2.4)) - 0.055
    return int(round(encoded * 255))


def source_ink(im: Image.Image) -> tuple[int, int, int]:
    """The flat product ink this export was drawn with.

    Measured, and measured for exactly one purpose: it is the reference length against which each
    pixel's *coverage* is recovered. It never reaches the output. The colour that gets laid back
    down is the platform's canonical value and nothing else — this is geometry recovery, not
    colour sampling.
    """
    tally: dict[tuple[int, int, int], int] = {}
    for r, g, b, a in im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata():
        if a > 250 and max(r, g, b) - min(r, g, b) >= CHROMA_FLOOR:
            tally[(r, g, b)] = tally.get((r, g, b), 0) + 1
    if not tally:
        raise ValueError("no product-coloured pixels found")
    return max(tally.items(), key=lambda item: item[1])[0]


def recolour(im: Image.Image, canonical: tuple[int, int, int]) -> Image.Image:
    """Re-lay every product-coloured pixel in the canonical colour, at its original coverage.

    A flat-colour logo has two inks: the product colour and a neutral — the wordmark's black, the
    white knocked out of the app icon, the paper. Every chromatic pixel is therefore the product
    ink blended with one of those neutrals at some coverage `k`, and an antialiased curve is
    nothing but a run of pixels at intermediate `k`.

    So `k` is recovered rather than guessed: the pixel is projected onto the segment from the
    neutral to the source ink, in **linear light**, because that is the space the blend physically
    happened in — averaging gamma-encoded values would thicken or thin every edge in the mark.
    Both candidate neutrals are tried and the one that reconstructs the pixel with less error
    wins, which is what lets one function handle a mark sitting on nothing and a mark knocked out
    of a coloured tile. The canonical colour is then laid down at that same `k` against that same
    neutral.

    The result is the supplied silhouette, to the pixel and to the sub-pixel, in the platform's
    colour. Neutral pixels are returned untouched: the `munaxa.` wordmark is not the product's
    colour and never was.
    """
    ink = [_TO_LINEAR[c] for c in source_ink(im)]
    canon = [_TO_LINEAR[c] for c in canonical]
    cache: dict[tuple[int, int, int], tuple[int, int, int]] = {}

    def mapped(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
        if rgb in cache:
            return cache[rgb]
        pixel = [_TO_LINEAR[c] for c in rgb]
        best = None
        for ground in (0.0, 1.0):
            axis = [ink[c] - ground for c in range(3)]
            denominator = sum(component * component for component in axis)
            if denominator < 1e-9:
                continue
            k = sum((pixel[c] - ground) * axis[c] for c in range(3)) / denominator
            k = min(1.0, max(0.0, k))
            # Snap the flat interior to full coverage. The supplied exports carry a little
            # compression noise, so a solidly-inked pixel solves to 0.997 rather than 1.0 and the
            # canonical colour lands a bit-value light — #00CEC0 where #00CFC1 was asked for.
            # Only the ends are snapped; genuine antialiasing lives well inside the band.
            k = 1.0 if k > 0.99 else 0.0 if k < 0.01 else k
            error = sum((ground + k * axis[c] - pixel[c]) ** 2 for c in range(3))
            if best is None or error < best[0]:
                best = (error, k, ground)
        if best is None:
            cache[rgb] = rgb
            return rgb
        _, k, ground = best
        out = tuple(_to_srgb(ground + k * (canon[c] - ground)) for c in range(3))
        cache[rgb] = out  # type: ignore[assignment]
        return out  # type: ignore[return-value]

    source = im.copy()
    px = source.load()
    for y in range(source.height):
        for x in range(source.width):
            r, g, b, a = px[x, y]
            if a == 0 or max(r, g, b) - min(r, g, b) < CHROMA_FLOOR:
                continue  # transparent, or ink and paper rather than the product colour
            px[x, y] = (*mapped((r, g, b)), a)
    return source


def to_dark_background(im: Image.Image) -> Image.Image:
    """Remap the neutral ink of the wordmark to white; leave every branded pixel alone.

    The chromatic test is `CHROMA_FLOOR`, the same one `recolour` uses, and it has to be: run this
    at a looser threshold and Docs loses its mark. Its canonical olive `#6B8E62` spans only 44
    between its brightest and darkest channel and is dark enough to read as ink, so a threshold of
    46 classified the entire M as neutral and painted it white — a dark-mode Docs logo with no
    logo in it. One constant, used by both, is what stops the two functions from disagreeing about
    what counts as the product's colour.
    """
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if max(r, g, b) - min(r, g, b) < CHROMA_FLOOR and (
                0.299 * r + 0.587 * g + 0.114 * b
            ) < 150:
                px[x, y] = (255, 255, 255, a)
    return out


# --- layout ------------------------------------------------------------------------------------


def square(im: Image.Image, size: int, margin: float = 0.0) -> Image.Image:
    art = im.copy()
    inner = int(size * (1 - 2 * margin))
    art.thumbnail((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(art, ((size - art.width) // 2, (size - art.height) // 2), art)
    return canvas


def fit_width(im: Image.Image, width: int) -> Image.Image:
    return im.resize((width, max(1, round(im.height * width / im.width))), Image.LANCZOS)


def share_image(im: Image.Image) -> Image.Image:
    """The dark share card: the on-dark stacked lockup on the palette's own dark background."""
    art = im.copy()
    art.thumbnail((660, 400), Image.LANCZOS)
    canvas = Image.new("RGBA", (1200, 630), (*DARK_CANVAS, 255))
    canvas.paste(art, ((1200 - art.width) // 2, (630 - art.height) // 2), art)
    return canvas


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, optimize=True)
    print(f"  {path.relative_to(OUT)}  {im.width}x{im.height}")


def build(product: str, geometry_from: str, canonical_hex: str) -> None:
    canonical = hex_to_rgb(canonical_hex)
    print(f"== {product}  →  {canonical_hex}  (geometry from {geometry_from})")
    root = OUT / product

    def prepared(role: str) -> Image.Image:
        return recolour(trim(key_white(load(geometry_from, role))), canonical)

    symbol = prepared("symbol")

    # The corporate identity gets the mark and nothing else, and that is a limit of the supplied
    # artwork rather than a choice. Every lockup in the ZIPs carries a product word — even the
    # file named "wordmark" sets `school` under `munaxa.` — so a corporate lockup would have to be
    # composed, and composing one is redrawing the logo. What the M *is* is product-independent,
    # so recolouring it to the corporate navy is honest; anything more is not.
    if product != "group":
        wordmark = prepared("wordmark")
        save(fit_width(wordmark, 1200), root / "logos/wordmark.png")
        save(fit_width(to_dark_background(wordmark), 1200), root / "logos/wordmark-on-dark.png")
        horizontal = prepared("horizontal")
        stacked = prepared("stacked")
        save(fit_width(horizontal, 1600), root / "logos/horizontal-lockup.png")
        save(
            fit_width(to_dark_background(horizontal), 1600),
            root / "logos/horizontal-lockup-on-dark.png",
        )
        save(fit_width(stacked, 1000), root / "logos/stacked-lockup.png")
        save(fit_width(to_dark_background(stacked), 1000), root / "logos/stacked-lockup-on-dark.png")
        # The descriptor lockup is a marketing asset, never the default application logo.
        save(fit_width(prepared("tagline"), 1000), root / "logos/tagline-lockup.png")
        save(share_image(to_dark_background(stacked)), root / "social/og-default.png")
        save(square(recolour(load(geometry_from, "on_brand"), canonical), 1024),
             root / "logos/primary-on-brand.png")

    # One file for both schemes: a flat canonical-colour mark reads on either ground.
    save(square(symbol, 512), root / "logos/symbol.png")

    app_icon = recolour(trim(key_white(load(geometry_from, "app_icon"))), canonical)
    save(square(app_icon, 512), root / "favicon/app-icon.png")
    save(square(app_icon, 180), root / "favicon/apple-touch-icon.png")
    save(square(symbol, 512, margin=0.06), root / "favicon/favicon.png")
    save(square(symbol, 32, margin=0.06), root / "favicon/favicon-32.png")


def main() -> None:
    if not SRC.is_dir():
        sys.exit(f"no approved exports at {SRC}\nusage: import-brand-artwork.py <src> [<out>]")

    colours = canonical_colors()
    print("canonical colours, read from @munaxa/platform:")
    for name, value in colours.items():
        print(f"  {name:8} {value}")
    print()

    # Only the generated buckets are replaced. `illustrations/` and anything else a human put
    # there is not this script's to delete.
    for product in (*PRODUCTS, "group"):
        for bucket in ("logos", "favicon", "social"):
            shutil.rmtree(OUT / product / bucket, ignore_errors=True)

    for name in PRODUCTS:
        build(name, name, colours[name])
    build("group", GROUP_GEOMETRY_FROM, colours["group"])

    # A bucket this run left empty keeps its marker, per the folder convention in
    # `assets/README.md` — an empty directory does not survive a git checkout otherwise.
    for product in (*PRODUCTS, "group"):
        for bucket in ("logos", "favicon", "social", "illustrations"):
            folder = OUT / product / bucket
            folder.mkdir(parents=True, exist_ok=True)
            if not any(folder.iterdir()):
                (folder / ".gitkeep").touch()


if __name__ == "__main__":
    main()
