#!/usr/bin/env python3
"""vocab_final_corrected.csv (+extra_words.csv) → vocaforge データ生成
1) words_full.json : 全部バージョン（6559語・100語ごとセクション）
2) words_target.json : ターゲット1900バージョン。
   - 並び・セクション構成は既存 words.json（ターゲット1900）と同一
   - 内容（発音・品詞・意味・補足・例文）は新DBから抽出
   - id は既存の 'w-N' を維持（学習進捗の互換性）
3) ID共有: words_full.json 内の同一単語（ターゲット1900に含まれる語）は
   ターゲット側と同じ 'w-N' のidを使う。→ データセットを切り替えても
   同じ単語は同じカードとして学習進捗が共有される。
"""
import csv, json, math

SRC = '/home/user/uploaded_files/vocab_final_corrected.csv'
EXTRA = '/home/user/webapp/vocab_work/extra_words.csv'
DATA_DIR = '/home/user/webapp/vocaforge/public/static/data'

def read_csv(path):
    rows = list(csv.reader(open(path, encoding='utf-8-sig')))
    header, data = rows[0], rows[1:]
    assert header == ['番号','単語','発音記号','品詞','意味','補足','例文','例文訳'], (path, header)
    return data

data = read_csv(SRC) + read_csv(EXTRA)

full = []
for r in data:
    no = int(r[0])
    full.append({
        'id': f'wf-{no}', 'no': no,
        'term': r[1].strip(), 'ipa': r[2].strip(), 'pos': r[3].strip(),
        'meaning': r[4].strip(), 'note': r[5].strip(),
        'example': r[6].strip(), 'exampleJa': r[7].strip(),
        'section': (no - 1) // 100 + 1,
    })
full.sort(key=lambda x: x['no'])
assert [x['no'] for x in full] == list(range(1, len(full) + 1)), '番号が連番でない'
n_sec_full = math.ceil(len(full) / 100)

# ---- ターゲット1900: 既存の並びを維持し、内容は新DBから抽出 ----
tgt_orig = json.load(open(f'{DATA_DIR}/words.json', encoding='utf-8'))
fullmap = {}
for w in full:
    fullmap.setdefault(w['term'].strip().lower(), w)  # 重複時は先勝ち（番号が小さい方）

target, missing = [], []
for w in tgt_orig:
    src = fullmap.get(w['term'].strip().lower())
    if not src:
        missing.append(w['term']); continue
    target.append({
        'id': w['id'],                    # 既存id維持（進捗互換）
        'no': w['no'],                    # ターゲット1900の番号・並び
        'term': src['term'],
        'ipa': src['ipa'], 'pos': src['pos'],
        'meaning': src['meaning'],        # 新DBの意味
        'note': src['note'],
        'example': src['example'], 'exampleJa': src['exampleJa'],
        'section': w['section'],          # 元のセクション構成
        'sectionCode': w.get('sectionCode') or f"Section {w['section']}",
    })
assert not missing, f'新DBに見つからない語: {missing}'
assert len(target) == 1900
json.dump(target, open(f'{DATA_DIR}/words_target.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print(f'words_target.json: {len(target)} words (order preserved)')

# ---- ID共有: full側の同一単語にターゲットの id (w-N) を付与 ----
tgt_id_by_term = {w['term'].strip().lower(): w['id'] for w in target}
assert len(tgt_id_by_term) == 1900, 'ターゲット内に重複termあり'
shared = 0
for w in full:
    tid = tgt_id_by_term.get(w['term'].strip().lower())
    if tid:
        w['id'] = tid  # 進捗共有のため同一id
        shared += 1
assert shared == 1900, f'共有語数が不正: {shared}'
assert len({w['id'] for w in full}) == len(full), 'full内でid重複'

json.dump(full, open(f'{DATA_DIR}/words_full.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print(f'words_full.json: {len(full)} words, {n_sec_full} sections, {shared} shared ids')

# ---- meta 更新 ----
META = f'{DATA_DIR}/meta.json'
meta = json.load(open(META, encoding='utf-8'))
meta['words_full'] = len(full)
meta['words_full_sections'] = n_sec_full
json.dump(meta, open(META, 'w', encoding='utf-8'), ensure_ascii=False)
print('meta updated')
