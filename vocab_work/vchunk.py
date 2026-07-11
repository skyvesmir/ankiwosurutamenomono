# -*- coding: utf-8 -*-
# 使い方: python3 vchunk.py <lo> <hi>
# vocab_final.csv を読み、[lo,hi] 範囲の行を検証する。
import csv, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
lo = int(sys.argv[1]); hi = int(sys.argv[2])
path = os.path.join(HERE, 'vocab_final.csv')

errors = 0
with open(path, encoding='utf-8-sig', newline='') as f:
    r = csv.reader(f)
    next(r)
    for row in r:
        if len(row) != 8:
            continue
        no, word, ipa, pos, meaning, note, ex, tr = row
        try:
            n = int(no)
        except ValueError:
            continue
        if not (lo <= n <= hi):
            continue
        pn = len([p for p in re.split(r'[、]', pos) if p.strip()])
        if not ex.strip():
            print(f"NG {no} {word}: 例文が空"); errors += 1
        if not tr.strip():
            print(f"NG {no} {word}: 例文訳が空"); errors += 1
        if pn > 1:
            if ex.count('<br>') != pn - 1:
                print(f"NG {no} {word}: pos{pn} ex<br>={ex.count('<br>')}"); errors += 1
            if tr.count('<br>') != pn - 1:
                print(f"NG {no} {word}: pos{pn} tr<br>={tr.count('<br>')}"); errors += 1
            if ex.count('【') != pn or tr.count('【') != pn:
                print(f"NG {no} {word}: マーカー数 ex={ex.count('【')} tr={tr.count('【')} pos={pn}"); errors += 1

print(f"[{lo}-{hi}] エラー数: {errors}")
