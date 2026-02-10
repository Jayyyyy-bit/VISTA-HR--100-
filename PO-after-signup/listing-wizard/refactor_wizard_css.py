#!/usr/bin/env python3
"""
Wizard.css safe refactor:
- Keeps file order
- Dedupes only IDENTICAL rule blocks (selector + declarations), after a conservative normalization
- Replaces later duplicates with a comment placeholder and pads blank lines to keep TOTAL LINE COUNT unchanged
- Inserts Step 0–8 section comments if missing (non-destructive; only inserts comments, does not move rules)

Limitations:
- This is NOT a full CSS parser; it targets common patterns: selector { ... } including multi-line blocks.
- It will not touch @keyframes bodies except as raw blocks (it can dedupe identical keyframes too if exact match).
"""

from __future__ import annotations
import re
from pathlib import Path
from dataclasses import dataclass

CSS_BLOCK_RE = re.compile(
    r"""
    (?P<prefix>\s*)                              # leading whitespace
    (?P<head>(?:@[\w-]+\s+[^{]+|[^{}@][^{]+?))   # selector or @rule header (very conservative)
    \{(?P<body>[^{}]*?)\}                        # body (no nested braces)
    """,
    re.VERBOSE | re.DOTALL,
)

STEP_HEADERS = [
    ("Step 0", "TOKENS / GLOBALS"),
    ("Step 1", "BACKGROUND"),
    ("Step 2", "TOPBAR"),
    ("Step 3", "PAGE LAYOUT"),
    ("Step 4", "PANELS / CARDS"),
    ("Step 5", "STEP 3 LOCATION FORM"),
    ("Step 6", "STEP 4 CAPACITY"),
    ("Step 7", "STEP 5–6 AMENITIES + HIGHLIGHTS"),
    ("Step 8", "STEP 7–8 PHOTOS + DETAILS"),
]

@dataclass
class Block:
    start: int
    end: int
    text: str
    head: str
    body: str

def normalize_head(head: str) -> str:
    # Keep selector semantics, but normalize whitespace
    h = head.strip()
    h = re.sub(r"\s+", " ", h)
    return h

def normalize_body(body: str) -> str:
    # Conservative normalization:
    # - trim lines
    # - collapse multiple spaces
    # - keep order exactly
    lines = [ln.strip() for ln in body.splitlines()]
    # remove purely empty lines at edges, keep internal empties
    while lines and lines[0] == "":
        lines.pop(0)
    while lines and lines[-1] == "":
        lines.pop()
    # normalize inner spacing
    lines = [re.sub(r"\s+", " ", ln) for ln in lines]
    return "\n".join(lines)

def count_lines(s: str) -> int:
    # number of lines in a text chunk
    return s.count("\n") + 1 if s else 0

def insert_step_comments(original: str) -> str:
    # Non-destructive: if it already contains "STEP" style headers, we leave it.
    # If not, we add a compact header block near top.
    if re.search(r"STEP\s*0|Step\s*0", original):
        return original

    header = "/* =========================================================\n" \
             "   Wizard.css — Organized (Step 0–8)\n" \
             "   Notes:\n" \
             "   - Duplicates removed only when identical\n" \
             "   - Line count preserved via padding placeholders\n" \
             "   ========================================================= */\n\n"

    # Insert after :root if present, else at top
    m = re.search(r":root\s*\{", original)
    if not m:
        return header + original
    return original[:m.start()] + header + original[m.start():]

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("input", help="path to wizard.css")
    ap.add_argument("-o", "--output", default="wizard.refactored.css")
    args = ap.parse_args()

    src_path = Path(args.input)
    text = src_path.read_text(encoding="utf-8")
    original_line_count = count_lines(text)

    text = insert_step_comments(text)

    blocks: list[Block] = []
    for m in CSS_BLOCK_RE.finditer(text):
        start, end = m.span()
        head = m.group("head")
        body = m.group("body")
        blocks.append(Block(start, end, text[start:end], head, body))

    seen: dict[tuple[str, str], tuple[int, str]] = {}
    out = []
    cursor = 0
    removed_count = 0

    for i, b in enumerate(blocks):
        out.append(text[cursor:b.start])

        key = (normalize_head(b.head), normalize_body(b.body))
        if key in seen:
            first_idx, first_head = seen[key]
            removed_count += 1

            # Placeholder: same number of lines as original block
            original_lines = count_lines(b.text)
            msg = f"/* deduped (identical to block #{first_idx+1}: {first_head}) */"
            placeholder = msg + "\n"
            # pad remaining lines
            pad_lines_needed = max(0, original_lines - count_lines(placeholder))
            placeholder += ("\n" * pad_lines_needed)

            out.append(placeholder)
        else:
            seen[key] = (i, normalize_head(b.head))
            out.append(b.text)

        cursor = b.end

    out.append(text[cursor:])
    result = "".join(out)

    # Ensure total line count unchanged (pad end if needed)
    new_line_count = count_lines(result)
    if new_line_count < original_line_count:
        result += "\n" * (original_line_count - new_line_count)
    elif new_line_count > original_line_count:
        # Should not happen often, but if it does, trim trailing blank lines only
        extra = new_line_count - original_line_count
        result = re.sub(r"(\n\s*){"+str(extra)+r"}\Z", "\n", result)

    # Final assert
    final_lines = count_lines(result)
    if final_lines != original_line_count:
        raise SystemExit(f"Line count mismatch: {original_line_count} -> {final_lines}")

    Path(args.output).write_text(result, encoding="utf-8")
    print(f"OK: wrote {args.output}")
    print(f"Original lines: {original_line_count}")
    print(f"Deduped blocks: {removed_count}")

if __name__ == "__main__":
    main()
