#!/usr/bin/env python3
"""vocab_final_corrected.csv → vocaforge words_full.json 変換
- 100語ごとにセクション分割（Section 1..66）
- フィールド: id, no, term, ipa, pos, meaning, note, example, exampleJa, section, sectionRange
"""
import csv, json, math, sys

SRC = '/home/user/uploaded_files/vocab_final_corrected.csv'
DST = '/home/user/webapp/vocaforge/public/static/data/words_full.json'

rows = list(csv.reader(open(SRC, encoding='utf-8-sig')))
header, data = rows[0], rows[1:]
assert header == ['番号','単語','発音記号','品詞','意味','補足','例文','例文訳'], header

out = []
for r in data:
    no = int(r[0])
    sec = (no - 1) // 100 + 1
    lo = (sec - 1) * 100 + 1
    out.append({
        'id': f'wf-{no}',
        'no': no,
        'term': r[1].strip(),
        'ipa': r[2].strip(),
        'pos': r[3].strip(),
        'meaning': r[4].strip(),
        'note': r[5].strip(),
        'example': r[6].strip(),
        'exampleJa': r[7].strip(),
        'section': sec,
    })

out.sort(key=lambda x: x['no'])
assert [x['no'] for x in out] == list(range(1, len(out) + 1)), '番号が連番でない'

n_sec = math.ceil(len(out) / 100)
json.dump(out, open(DST, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'wrote {DST}: {len(out)} words, {n_sec} sections')

# meta.json に full 情報を追記
META = '/home/user/webapp/vocaforge/public/static/data/meta.json'
meta = json.load(open(META, encoding='utf-8'))
meta['words_full'] = len(out)
meta['words_full_sections'] = n_sec
json.dump(meta, open(META, 'w', encoding='utf-8'), ensure_ascii=False)
print('meta updated:', meta['words_full'], meta['words_full_sections'])
