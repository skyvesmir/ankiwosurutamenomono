#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import csv, json, re, os

SRC = "/home/user/uploaded_files/full"
OUT = "/home/user/webapp/public/static/data"
os.makedirs(OUT, exist_ok=True)

# ---------- 単語 ----------
# 英熟語ターゲット1000 5訂版 公式パート構成（旺文社 product/detail/034649）
#   Part 1 絶対覚えておきたい180        : 1-180
#   Part 2 グルーピングで覚える240      : 181-420
#   Part 3 形で覚える240                : 421-660
#   Part 4 文法・構文で覚える170        : 661-830
#   Part 5 ここで差がつく難熟語170      : 831-1000
PHRASE_PARTS = [
    (1, 180,  "Part 1", "絶対覚えておきたい180"),
    (181, 420, "Part 2", "グルーピングで覚える240"),
    (421, 660, "Part 3", "形で覚える240"),
    (661, 830, "Part 4", "文法・構文で覚える170"),
    (831, 1000, "Part 5", "ここで差がつく難熟語170"),
]

def phrase_part(num):
    for i, (lo, hi, code, title) in enumerate(PHRASE_PARTS, start=1):
        if lo <= num <= hi:
            return i, code, title, lo, hi
    return 0, "", "", 0, 0

def parse_vocab(path, kind):
    items = []
    with open(path, encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            if not re.match(r'^\d+$', row[0].strip()):
                continue
            num = int(row[0].strip())
            term = row[1].strip()
            # 意味は残り全部を結合（クォート済みなので通常row[2]だが念のため）
            meaning = ",".join(c for c in row[2:]).strip()
            if not term or not meaning:
                continue
            rec = {
                "id": f"{kind}-{num}",
                "no": num,
                "term": term,
                "meaning": meaning,
            }
            if kind == "p":
                sec, code, title, lo, hi = phrase_part(num)
                rec["section"] = sec
                rec["sectionCode"] = code      # 例: "Part 2"
                rec["sectionTitle"] = title    # 例: "グルーピングで覚える240"
                rec["sectionRange"] = [lo, hi]
            else:
                sec = (num - 1) // 100 + 1
                rec["section"] = sec
                rec["sectionCode"] = f"Section {sec}"
                rec["sectionTitle"] = ""
                rec["sectionRange"] = [(sec-1)*100+1, sec*100]
            items.append(rec)
    return items

words = parse_vocab(os.path.join(SRC, "tango.csv"), "w")
phrases = parse_vocab(os.path.join(SRC, "jukugo.csv"), "p")
print("words:", len(words), "max", max(w["no"] for w in words))
print("phrases:", len(phrases), "max", max(p["no"] for p in phrases))

# ---------- 語源 ----------
def parse_etym(path):
    text = open(path, encoding="utf-8").read()
    # エントリ単位に分割
    blocks = re.split(r'(?m)^### ((?:Pref|Suf|Root)-\d+):\s*(.+)$', text)
    # blocks: [pre, id1, head1, body1, id2, head2, body2, ...]
    items = []
    for i in range(1, len(blocks), 3):
        eid = blocks[i].strip()
        head = blocks[i+1].strip()
        body = blocks[i+2]
        # 本体は次の --- まで
        body = body.split("\n---")[0]
        def field(name):
            m = re.search(r'\*\*'+re.escape(name)+r'\*\*[:：]\s*(.+)', body)
            return m.group(1).strip() if m else ""
        # カテゴリ
        if eid.startswith("Pref"): cat = "prefix"
        elif eid.startswith("Suf"): cat = "suffix"
        else: cat = "root"
        # 例単語テーブル
        examples = []
        tbl = re.search(r'\*\*コア例単語\*\*[:：]?\s*\n(.*?)(?:\n\s*\n- \*\*覚え方)', body, re.S)
        if tbl:
            for line in tbl.group(1).splitlines():
                line = line.strip()
                if not line.startswith("|"): continue
                cells = [c.strip() for c in line.strip("|").split("|")]
                if len(cells) < 3: continue
                if cells[0] in ("英単語","---") or set(cells[0])<=set("-"): continue
                examples.append({"word": cells[0], "ja": cells[1], "level": cells[2]})
        imp = field("重要度")
        stars = imp.count("★")
        core = field("コアの意味")
        note = field("特記")
        items.append({
            "id": eid,
            "category": cat,
            "headword": head,
            "variants": field("見出し / 異形"),
            "theme": field("テーマ分類"),
            "core": core,
            "derived": field("派生的な意味"),
            "origin": field("語源"),
            "image_hint": field("イメージ化ヒント"),
            "examples": examples,
            "tips": field("覚え方のコツ"),
            "confusion": field("混同注意"),
            "note": note,
            "importance": stars,
            "learnable": bool(core),  # コア意味を持つものを学習カード対象とする
        })
    return items

etym = parse_etym(os.path.join(SRC, "etymology.md"))
from collections import Counter
print("etym total:", len(etym), Counter(e["category"] for e in etym))
print("etym with examples:", sum(1 for e in etym if e["examples"]))

# 出力
json.dump(words, open(os.path.join(OUT,"words.json"),"w",encoding="utf-8"), ensure_ascii=False)
json.dump(phrases, open(os.path.join(OUT,"phrases.json"),"w",encoding="utf-8"), ensure_ascii=False)
json.dump(etym, open(os.path.join(OUT,"etymology.json"),"w",encoding="utf-8"), ensure_ascii=False)
# メタ
meta = {
  "words": len(words), "phrases": len(phrases),
  "prefix": sum(1 for e in etym if e["category"]=="prefix"),
  "suffix": sum(1 for e in etym if e["category"]=="suffix"),
  "root": sum(1 for e in etym if e["category"]=="root"),
  "word_sections": max(w["section"] for w in words),
  "phrase_sections": max(p["section"] for p in phrases),
  "etym_learnable": sum(1 for e in etym if e["learnable"]),
  "phrase_parts": [
    {"section": i+1, "code": code, "title": title, "range": [lo, hi], "count": hi-lo+1}
    for i, (lo, hi, code, title) in enumerate(PHRASE_PARTS)
  ],
}
json.dump(meta, open(os.path.join(OUT,"meta.json"),"w",encoding="utf-8"), ensure_ascii=False, indent=2)
print("meta:", meta)
