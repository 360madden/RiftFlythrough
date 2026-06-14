#!/usr/bin/env python3
"""DDS to PNG converter for RIFT texture pipeline (Phase 41).

Handles DXT1 (BC1) compressed DDS files - the only format found in the
Assets repo's extracted texture archives. Produces standard PNG output
via Pillow.

Usage:
    python convert_dds.py <input.dds> [output.png]   # single file
    python convert_dds.py --all                       # batch convert all files
    python convert_dds.py --all --outdir textures/    # batch with custom output dir
"""

import argparse
import os
import struct
import sys
from pathlib import Path

from PIL import Image

# ── DDS header constants ──
DDS_MAGIC = b"DDS "
DDS_HEADER_SIZE = 128  # magic(4) + header(124)
DDSD_CAPS = 0x1
DDSD_HEIGHT = 0x2
DDSD_WIDTH = 0x4
DDSD_PITCH = 0x8
DDSD_PIXELFORMAT = 0x1000
DDSD_MIPMAPCOUNT = 0x20000

# Pixel format flags
DDPF_FOURCC = 0x4

# FourCC codes
FOURCC_DXT1 = b"DXT1"
FOURCC_DXT3 = b"DXT3"
FOURCC_DXT5 = b"DXT5"


def rgb565_to_rgb888(c):
    """Convert a 16-bit RGB565 color to (R, G, B) 8-bit tuple."""
    r = ((c >> 11) & 0x1F) << 3
    g = ((c >> 5) & 0x3F) << 2
    b = (c & 0x1F) << 3
    # Replicate high bits into low bits for full range
    r |= r >> 5
    g |= g >> 6
    b |= b >> 5
    return (r, g, b)


def decode_dxt1_block(data, offset):
    """Decode a single 4x4 DXT1 block into 16 RGBA pixels.

    Args:
        data: bytes of compressed data
        offset: byte offset of this block (8 bytes per block)

    Returns:
        list of 16 (R, G, B, A) tuples
    """
    color0 = struct.unpack_from("<H", data, offset)[0]
    color1 = struct.unpack_from("<H", data, offset + 2)[0]
    indices = struct.unpack_from("<I", data, offset + 4)[0]

    c0 = rgb565_to_rgb888(color0)
    c1 = rgb565_to_rgb888(color1)

    # Build 4-color lookup table
    if color0 > color1:
        colors = [
            (*c0, 255),
            (*c1, 255),
            (
                (2 * c0[0] + c1[0]) // 3,
                (2 * c0[1] + c1[1]) // 3,
                (2 * c0[2] + c1[2]) // 3,
                255,
            ),
            (
                (c0[0] + 2 * c1[0]) // 3,
                (c0[1] + 2 * c1[1]) // 3,
                (c0[2] + 2 * c1[2]) // 3,
                255,
            ),
        ]
    else:
        colors = [
            (*c0, 255),
            (*c1, 255),
            (
                (c0[0] + c1[0]) // 2,
                (c0[1] + c1[1]) // 2,
                (c0[2] + c1[2]) // 2,
                255,
            ),
            (0, 0, 0, 0),  # transparent
        ]

    pixels = []
    for i in range(16):
        idx = (indices >> (i * 2)) & 0x3
        pixels.append(colors[idx])

    return pixels


def decode_dxt3_block(data, offset):
    """Decode a single 4x4 DXT3 block (explicit alpha + DXT1 color).

    DXT3 layout (16 bytes):
      - Bytes 0-7:  alpha (4 bits per pixel, 16 pixels = 8 bytes)
      - Bytes 8-15: color (same as DXT1, 8 bytes)
    """
    # Decode alpha: 4 bits per pixel, stored in rows
    # Per DirectX DDS spec: first pixel gets low nibble (bits 0-3),
    # second pixel gets high nibble (bits 4-7) of each byte.
    alphas = []
    for i in range(8):
        byte = data[offset + i]
        alphas.append((byte & 0xF) * 17)  # pixel 2n: low nibble
        alphas.append(((byte >> 4) & 0xF) * 17)  # pixel 2n+1: high nibble

    # Decode color using DXT1 logic
    color_pixels = decode_dxt1_block(data, offset + 8)

    # Combine alpha + color
    pixels = []
    for i in range(16):
        r, g, b, _ = color_pixels[i]
        pixels.append((r, g, b, alphas[i]))
    return pixels


def decode_dxt5_block(data, offset):
    """Decode a single 4x4 DXT5 block (interpolated alpha + DXT1 color).

    DXT5 layout (16 bytes):
      - Bytes 0-1:  alpha0, alpha1 (reference alpha values)
      - Bytes 2-7:  16 x 3-bit indices into 8-alpha lookup table
      - Bytes 8-15:  color (same as DXT1, 8 bytes)
    """
    alpha0 = data[offset]
    alpha1 = data[offset + 1]

    # Build 8-alpha lookup table
    if alpha0 > alpha1:
        alpha_table = [
            alpha0,
            alpha1,
            (6 * alpha0 + 1 * alpha1) // 7,
            (5 * alpha0 + 2 * alpha1) // 7,
            (4 * alpha0 + 3 * alpha1) // 7,
            (3 * alpha0 + 4 * alpha1) // 7,
            (2 * alpha0 + 5 * alpha1) // 7,
            (1 * alpha0 + 6 * alpha1) // 7,
        ]
    else:
        alpha_table = [
            alpha0,
            alpha1,
            (4 * alpha0 + 1 * alpha1) // 5,
            (3 * alpha0 + 2 * alpha1) // 5,
            (2 * alpha0 + 3 * alpha1) // 5,
            (1 * alpha0 + 4 * alpha1) // 5,
            0,
            255,
        ]

    # Decode 3-bit indices: 48 bits (6 bytes) encode 16 x 3-bit values.
    # Read as a single 48-bit integer and extract sequentially.
    bits48 = (
        data[offset + 2]
        | (data[offset + 3] << 8)
        | (data[offset + 4] << 16)
        | (data[offset + 5] << 24)
        | (data[offset + 6] << 32)
        | (data[offset + 7] << 40)
    )
    alphas = []
    for i in range(16):
        idx = (bits48 >> (i * 3)) & 0x7
        alphas.append(alpha_table[idx])

    # Decode color using DXT1 logic
    color_pixels = decode_dxt1_block(data, offset + 8)

    # Combine alpha + color
    pixels = []
    for i in range(16):
        r, g, b, _ = color_pixels[i]
        pixels.append((r, g, b, alphas[i]))
    return pixels


def read_dds_header(filepath):
    """Parse a DDS file header and return (width, height, mipmaps, fourcc, data_offset).

    Raises ValueError if the file is not a valid DDS or uses an unsupported format.
    """
    with open(filepath, "rb") as f:
        magic = f.read(4)
        if magic != DDS_MAGIC:
            raise ValueError(f"Not a DDS file (bad magic: {magic!r})")

        header = f.read(124)
        if len(header) < 124:
            raise ValueError("Truncated DDS header")

        flags = struct.unpack_from("<I", header, 4)[0]
        height = struct.unpack_from("<I", header, 8)[0]
        width = struct.unpack_from("<I", header, 12)[0]
        mipmaps = struct.unpack_from("<I", header, 24)[0]
        pf_flags = struct.unpack_from("<I", header, 76)[0]
        fourcc = header[80:84]

        # Validate required fields
        if not (flags & DDSD_HEIGHT) or not (flags & DDSD_WIDTH):
            raise ValueError("DDS header missing width/height")
        if not (flags & DDSD_PIXELFORMAT):
            raise ValueError("DDS header missing pixel format")
        if not (pf_flags & DDPF_FOURCC):
            raise ValueError(f"Unsupported DDS format (not FourCC, pf_flags={pf_flags:#x})")
        if fourcc not in (FOURCC_DXT1, FOURCC_DXT3, FOURCC_DXT5):
            raise ValueError(f"Unsupported FourCC: {fourcc!r} (only DXT1/DXT3/DXT5 are supported)")

    return width, height, mipmaps, fourcc, DDS_HEADER_SIZE


def dds_to_png(input_path, output_path=None):
    """Convert a DXT1 DDS file to PNG.

    Args:
        input_path: path to .dds file
        output_path: path for .png output (default: same name with .png extension)

    Returns:
        Path to the created PNG file.
    """
    if output_path is None:
        output_path = str(Path(input_path).with_suffix(".png"))

    width, height, _mipmaps, fourcc, data_offset = read_dds_header(input_path)

    with open(input_path, "rb") as f:
        f.seek(data_offset)
        compressed = f.read()

    # Calculate block dimensions and bytes per block
    blocks_x = (width + 3) // 4
    blocks_y = (height + 3) // 4
    bytes_per_block = 8 if fourcc == FOURCC_DXT1 else 16  # DXT3 or DXT5
    expected_size = blocks_x * blocks_y * bytes_per_block

    if len(compressed) < expected_size:
        raise ValueError(f"Truncated DDS data: expected {expected_size} bytes, got {len(compressed)}")

    # Create output image
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    pixels = img.load()

    # Decode all blocks
    block_idx = 0
    for by in range(blocks_y):
        for bx in range(blocks_x):
            offset = block_idx * bytes_per_block
            if fourcc == FOURCC_DXT1:
                block_pixels = decode_dxt1_block(compressed, offset)
            elif fourcc == FOURCC_DXT3:
                block_pixels = decode_dxt3_block(compressed, offset)
            else:
                block_pixels = decode_dxt5_block(compressed, offset)
            block_idx += 1

            # Write 4x4 block into image
            base_x = bx * 4
            base_y = by * 4
            for py in range(4):
                for px in range(4):
                    img_x = base_x + px
                    img_y = base_y + py
                    if img_x < width and img_y < height:
                        pixels[img_x, img_y] = block_pixels[py * 4 + px]

    img.save(output_path, "PNG")
    return output_path


def find_all_dds(base_dir):
    """Recursively find all .dds files under a directory."""
    dds_files = []
    for root, _dirs, files in os.walk(base_dir):
        for f in files:
            if f.lower().endswith(".dds"):
                dds_files.append(os.path.join(root, f))
    return dds_files


def batch_convert(input_dir, output_dir):
    """Convert all DDS files in input_dir to PNG files in output_dir.

    Preserves the relative directory structure.
    """
    dds_files = find_all_dds(input_dir)
    if not dds_files:
        print(f"No DDS files found in {input_dir}")
        return

    success = 0
    skipped = 0
    errors = 0

    for dds_path in dds_files:
        # Compute output path preserving subdirectory structure
        rel_path = os.path.relpath(dds_path, input_dir)
        png_path = os.path.join(output_dir, rel_path)
        png_path = str(Path(png_path).with_suffix(".png"))

        # Skip if output already exists
        if os.path.exists(png_path):
            skipped += 1
            continue

        try:
            os.makedirs(os.path.dirname(png_path), exist_ok=True)
            dds_to_png(dds_path, png_path)
            success += 1
            if success % 20 == 0 or success == 1:
                print(f"  [{success}/{len(dds_files)}] {os.path.basename(dds_path)} -> OK")
        except Exception as e:
            errors += 1
            print(f"  ERROR: {os.path.basename(dds_path)}: {e}")

    print()
    print(f"Converted: {success}  Skipped (exist): {skipped}  Errors: {errors}")
    print(f"Output: {output_dir}")


# ── CLI ──


def main():
    parser = argparse.ArgumentParser(description="Convert DXT1 DDS files to PNG for the RIFT texture pipeline.")
    parser.add_argument("input", nargs="?", help="Input .dds file (omit with --all for batch mode)")
    parser.add_argument("output", nargs="?", help="Output .png file (optional)")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Batch convert all DDS files from the Assets Extracted directory",
    )
    parser.add_argument(
        "--indir",
        default=None,
        help="Input directory for batch mode (default: Assets/Extracted)",
    )
    parser.add_argument(
        "--outdir",
        default=None,
        help="Output directory for batch mode (default: RiftFlythrough/textures/)",
    )
    args = parser.parse_args()

    if args.all:
        # Resolve paths relative to this project
        script_dir = Path(__file__).resolve().parent
        riftfly_dir = script_dir

        indir = args.indir or str(script_dir.parent / "Assets" / "Extracted")
        outdir = args.outdir or str(riftfly_dir / "textures" / "converted")

        if not os.path.isdir(indir):
            print(f"Error: input directory not found: {indir}")
            print("Use --indir to specify the Assets Extracted directory path.")
            sys.exit(1)

        print("Batch converting DDS to PNG...")
        print(f"  Source: {indir}")
        print(f"  Output: {outdir}")
        print()
        batch_convert(indir, outdir)
    elif args.input:
        output = args.output
        try:
            result = dds_to_png(args.input, output)
            print(f"Converted: {args.input} -> {result}")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
