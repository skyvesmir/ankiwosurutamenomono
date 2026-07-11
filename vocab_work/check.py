# -*- coding: utf-8 -*-
# 使い方: python3 check.py output.csv
import csv, re, sys

path = sys.argv[1] if len(sys.argv) > 1 else 'vocab_final.csv'
rows = []
with open(path, encoding='utf-8-sig', newline='') as f:
    r = csv.reader(f)
    header = next(r)
    for row in r:
        rows.append(row)

errors = 0
def err(msg):
    global errors
    errors += 1
    if errors <= 50:
        print("NG:", msg)

# 列数
if header[:8] != ["番号","単語","発音記号","品詞","意味","補足","例文","例文訳"]:
    err(f"ヘッダ不一致: {header}")
for i, row in enumerate(rows, start=2):
    if len(row) != 8:
        err(f"line {i}: 列数 {len(row)}")

# 番号連番
for idx, row in enumerate(rows, start=1):
    if len(row) >= 1 and row[0] != str(idx):
        err(f"番号ずれ: 期待 {idx} 実際 {row[0]}")
        break

# 品詞数 == 例文/訳の<br>+1、空チェック
for row in rows:
    if len(row) != 8:
        continue
    no, word, ipa, pos, meaning, note, ex, tr = row
    posn = len([p for p in re.split(r'[、]', pos) if p.strip()])
    if not ex.strip():
        err(f"No.{no} {word}: 例文が空")
    if not tr.strip():
        err(f"No.{no} {word}: 例文訳が空")
    if posn > 1:
        if ex.count('<br>') != posn - 1:
            err(f"No.{no} {word}: 品詞{posn} だが例文<br>={ex.count('<br>')}")
        if tr.count('<br>') != posn - 1:
            err(f"No.{no} {word}: 品詞{posn} だが例文訳<br>={tr.count('<br>')}")

print(f"総行数: {len(rows)}")
print(f"エラー数: {errors}")
print("OK" if errors == 0 else "要修正")
