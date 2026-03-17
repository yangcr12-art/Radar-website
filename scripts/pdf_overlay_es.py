#!/usr/bin/env python3
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import fitz  # PyMuPDF
import numpy as np


def norm_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def has_cjk(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text))


def load_mappings(mapping_path: Path):
    data = {"exact": [], "phrase": {}}
    if mapping_path.exists():
        with mapping_path.open("r", encoding="utf-8") as f:
            data = json.load(f)

    exact_map = {}
    for item in data.get("exact", []):
        cn = item.get("cn", "")
        es = item.get("es", "")
        if cn and es:
            exact_map[norm_text(cn)] = es

    phrase_map = data.get("phrase", {})
    phrase_keys = sorted(phrase_map.keys(), key=len, reverse=True)
    return exact_map, phrase_map, phrase_keys


def replace_phrases(text: str, phrase_map, phrase_keys) -> str:
    out = text
    for key in phrase_keys:
        out = out.replace(key, phrase_map[key])
    return out


def translate_structured(text: str) -> str:
    out = text
    out = out.replace("右脚", "diestro").replace("左脚", "zurdo")
    out = out.replace("岁", " años")
    out = out.replace("加盟", "llegó en")
    out = re.sub(r"中超(\d+)场", r"CSL \1 pj", out)
    out = re.sub(r"失(\d+)球", r"encajó \1", out)
    out = re.sub(r"(\d+)球(\d+)助", r"\1 G \2 A", out)
    return out


def translate_text(text: str, exact_map, phrase_map, phrase_keys) -> str:
    normalized = norm_text(text)
    if normalized in exact_map:
        return exact_map[normalized]

    lines = text.splitlines()
    out_lines = []
    for line in lines:
        if not line.strip():
            out_lines.append("")
            continue

        nn = norm_text(line)
        if nn in exact_map:
            out_lines.append(exact_map[nn])
            continue

        translated = replace_phrases(line, phrase_map, phrase_keys)
        translated = translate_structured(translated)
        out_lines.append(translated)
    return "\n".join(out_lines)


def pix_to_np(pix):
    img = np.frombuffer(pix.samples, dtype=np.uint8)
    return img.reshape(pix.height, pix.width, 3)


def sample_bg(img, bbox, scale):
    x0, y0, x1, y1 = bbox
    px0 = int(max(0, min(img.shape[1] - 1, x0 * scale)))
    px1 = int(max(0, min(img.shape[1], x1 * scale)))
    py0 = int(max(0, min(img.shape[0] - 1, y0 * scale)))
    py1 = int(max(0, min(img.shape[0], y1 * scale)))
    if px1 <= px0 + 1 or py1 <= py0 + 1:
        return (1, 1, 1)

    region = img[py0:py1, px0:px1, :]
    q = (region // 16).astype(np.uint16)
    key = q[:, :, 0] * 256 + q[:, :, 1] * 16 + q[:, :, 2]
    vals, counts = np.unique(key.reshape(-1), return_counts=True)
    mk = vals[counts.argmax()]
    r = int((mk // 256) % 16) * 16 + 8
    g = int((mk // 16) % 16) * 16 + 8
    b = int(mk % 16) * 16 + 8
    return (r / 255, g / 255, b / 255)


def choose_align(rect, page_rect):
    cx = (rect.x0 + rect.x1) / 2
    if abs(cx - page_rect.width / 2) < 40 and rect.width < page_rect.width * 0.7:
        return 1  # center
    return 0


def find_fontsize_that_fits(page_w, page_h, rect, text, fs_start, align, fontname="helv"):
    # Create a temp page to test fontsize without polluting output page.
    tmp = fitz.open()
    page = tmp.new_page(width=page_w, height=page_h)
    for fs in [fs_start, fs_start - 1, fs_start - 2, fs_start - 3, fs_start - 4, fs_start - 5, 10, 9, 8, 7, 6, 5]:
        if fs <= 4:
            continue
        rc = page.insert_textbox(rect, text, fontsize=fs, fontname=fontname, align=align)
        if rc >= 0:
            tmp.close()
            return fs
    tmp.close()
    return 5


def overlay_pdf(input_pdf, output_pdf, exact_map, phrase_map, phrase_keys):
    doc = fitz.open(input_pdf)
    out = fitz.open()

    for i in range(len(doc)):
        page = doc[i]
        newp = out.new_page(width=page.rect.width, height=page.rect.height)
        newp.show_pdf_page(newp.rect, doc, i)

        scale = 2
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        img = pix_to_np(pix)

        blocks = page.get_text("dict")["blocks"]
        for blk in blocks:
            if blk["type"] != 0:
                continue

            spans = []
            lines = []
            for line in blk.get("lines", []):
                text_line = ""
                for span in line.get("spans", []):
                    spans.append(span)
                    text_line += span.get("text", "")
                lines.append(text_line.rstrip())
            raw = "\n".join(lines).strip()
            if not raw or not has_cjk(raw):
                continue

            translated = translate_text(raw, exact_map, phrase_map, phrase_keys).strip()
            if translated == raw:
                continue

            rect = fitz.Rect(blk["bbox"])
            bg = sample_bg(img, blk["bbox"], scale)

            pad = 0.6
            cover = fitz.Rect(rect.x0 - pad, rect.y0 - pad, rect.x1 + pad, rect.y1 + pad)
            shape = newp.new_shape()
            shape.draw_rect(cover)
            shape.finish(color=None, fill=bg)
            shape.commit()

            color = (0, 0, 0)
            fs = 12
            if spans:
                colors = [sp.get("color", 0) for sp in spans]
                mc = Counter(colors).most_common(1)[0][0]
                color = ((mc >> 16 & 255) / 255, (mc >> 8 & 255) / 255, (mc & 255) / 255)
                fs = max(sp.get("size", fs) for sp in spans)

            align = choose_align(rect, newp.rect)
            fs_fit = find_fontsize_that_fits(newp.rect.width, newp.rect.height, rect, translated, int(fs), align)
            newp.insert_textbox(rect, translated, fontsize=fs_fit, fontname="helv", color=color, align=align)

    out.save(output_pdf)
    out.close()
    doc.close()


def parse_args():
    parser = argparse.ArgumentParser(
        description="Overlay Chinese text blocks in a PDF with Spanish translations."
    )
    parser.add_argument("input_pdf", help="Path to input PDF")
    parser.add_argument("output_pdf", help="Path to output PDF")
    parser.add_argument(
        "--mapping",
        default="templates/pdf_overlay_es_mapping.json",
        help="JSON file containing exact/phrase mappings.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    mapping_path = Path(args.mapping)
    exact_map, phrase_map, phrase_keys = load_mappings(mapping_path)
    if not exact_map and not phrase_map:
        print(f"[ERROR] Mapping is empty: {mapping_path}", file=sys.stderr)
        sys.exit(2)

    overlay_pdf(args.input_pdf, args.output_pdf, exact_map, phrase_map, phrase_keys)
    print(f"DONE: {args.output_pdf}")


if __name__ == "__main__":
    main()
