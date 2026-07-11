# -*- coding: utf-8 -*-
# chunks/*.py の DATA(ex/tr) を vocab_clean.json にマージし vocab_final.csv を出力
import json, csv, os, glob, importlib.util, re

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, 'vocab_clean.json'), encoding='utf-8'))

# chunk読み込み: 全 chunks/chunk_*.py の DATA を統合
merged = {}
for path in sorted(glob.glob(os.path.join(HERE, 'chunks', 'chunk_*.py'))):
    spec = importlib.util.spec_from_file_location('chunkmod', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    d = getattr(mod, 'DATA', {})
    for k, v in d.items():
        merged[str(k)] = v

header = ["番号","単語","発音記号","品詞","意味","補足","例文","例文訳"]
out = os.path.join(HERE, 'vocab_final.csv')
with open(out, 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
    w.writerow(header)
    for item in data:
        no = str(item['no'])
        ex_tr = merged.get(no, {})
        ex = ex_tr.get('ex', '')
        tr = ex_tr.get('tr', '')
        w.writerow([no, item['word'], item['ipa'], item['pos'],
                    item['meaning'], item.get('note',''), ex, tr])
print(f"merged entries: {len(merged)}  total words: {len(data)}  -> {out}")
