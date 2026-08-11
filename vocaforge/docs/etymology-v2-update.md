# 語源データ v2 更新レポート

`etymology_dataset_v2.xlsx` を取り込み、`etymology.json` / `etym_links.json` / `meta.json` を
再生成した作業の記録。**何をどう振り分けたか**を追跡できるようにするためのドキュメント。

- 作業日: 2026-08-11
- 入力: `etymology_dataset_v2.xlsx`（entries 689行 / example_words 3686行 / additions_audit 150行 / grouping_map 150行）
- 生成スクリプト: `/home/user/etymwork/build_etym.py`（`ja_manual.py` / `theme_remap.py` を読む）

---

## 1. 全体の増減

| 項目 | v1（旧） | v2（新） | 差分 |
|---|---:|---:|---:|
| 接頭辞 | 140 | 159 | +19 |
| 接尾辞 | 140 | 159 | +19 |
| 語根 | 310 | 370 | +60 |
| **合計** | **590** | **688** | **+98** |
| うち学習カード（learnable） | 539 | 688 | +149 |
| 例単語 | 3234 | 3685 | +451 |
| 語源グループ（meta.etym_groups） | 38 | 39 | +1 |

内訳:

- 新規追加 **149件**（`Add-1001`〜、すべて v2 で新設）
- 統合削除 **51件**（重複掲載エントリを本体へ統合。→ §2）
- 継続 **539件**

### 学習進捗への影響：なし

語源カードのカードIDは entry_id そのまま（`Pref-001` など。接頭辞を付けていない）ため、
エントリを削除するとその進捗行（`card_states`）が孤児になる。今回は次の理由で影響ゼロ。

- 削除された51件は **すべて v1 で `learnable: false`**（= 一度も出題されていない参照ノート）
- v1 で `learnable: true` だった **539件の ID は全件そのまま生存**

```
v1 learnable 539件 のうち v2 で消えたもの: 0件
削除51件のうち learnable だったもの:      0件
```

---

## 2. 統合削除した51件（旧「参照ノート」）

v1 には「同じ語源を2箇所に載せた重複エントリ」が51件あった。いずれも `theme` が空・
`core` が空・`learnable: false` で、テーマ索引では `(未分類)` に落ちていたもの。
v2 ではこれらが本体エントリへ統合され、重複が解消された。

> v1 の `themeGroup === '(未分類)'` の集合と、今回削除された集合は**完全に一致**（差分0件）。

| 削除された旧ID | 旧見出し | 統合先 | 統合先の見出し |
|---|---|---|---|
| `Pref-072` | hetero- / homo- セット記憶 | `Pref-069` | hetero- |
| `Pref-112` | amphi-（独立記述） | `Pref-111` | ambi- / amphi- |
| `Root-023` | spec- / spect- / spic- | `Root-001` | spec- / spect- / spic- |
| `Root-024` | vid- / vis- | `Root-004` | vid- / vis- |
| `Root-028` | dic- / dict- | `Root-002` | dic- / dict- |
| `Root-050` | sta-² / stab- / stan- | `Root-049` | stat- / stit- / sist- |
| `Root-051` | gen- / gener- | `Root-005` | gen- / gener- / genit- |
| `Root-109` | medi-² | `Pref-048` | medi- / med- |
| `Root-132` | tang- / tact-² | `Root-027` | tact- / tang- / ting- |
| `Root-134` | bell-² / belli- | `Root-099` | bell- |
| `Root-160` | ge- / geo- | `Pref-126` | geo- |
| `Root-161` | hydr- / hydro- | `Pref-127` | hydro- |
| `Root-183` | lith- | `Suf-130` | -lith |
| `Root-188` | macr- | `Pref-113` | macro- |
| `Root-189` | micr- | `Pref-044` | micro- |
| `Root-190` | mega-² / megal- | `Pref-043` | mega- |
| `Root-191` | meta-² | `Pref-079` | meta- |
| `Root-192` | hetero-² / homo-² | `Pref-069` | hetero- |
| `Root-193` | ortho-² | `Pref-140` | ortho- |
| `Root-204` | scop- | `Suf-065` | -scope |
| `Root-205` | psych- | `Pref-130` | psycho- |
| `Root-206` | neur- | `Pref-131` | neuro- |
| `Root-207` | cardi- | `Pref-132` | cardio- |
| `Root-208` | derm- | `Pref-133` | derm- / dermato- |
| `Root-218` | zo- | `Pref-134` | zoo- |
| `Root-221` | phyt- | `Suf-131` | -phyte |
| `Root-222` | bio-² | `Pref-125` | bio- |
| `Root-223` | gen-² / genesis- | `Suf-080` | -genesis / -gen / -genic |
| `Root-224` | meter- | `Suf-064` | -metry / -meter |
| `Root-228` | techn-² / -tect | `Root-177` | techn- |
| `Root-229` | ge-² / -gee | `Pref-126` | geo- |
| `Root-232` | andr- | `Pref-135` | andro- |
| `Root-233` | gyn- | `Pref-136` | gyn- / gyno- |
| `Root-235` | the- / theo- | `Pref-137` | theo- |
| `Root-237` | orth-² | `Pref-140` | ortho- |
| `Root-245` | xen- | `Pref-139` | xeno- |
| `Root-252` | pol- / poli-² | `Root-176` | poli- |
| `Suf-105` | -ery / 集合名詞用法 | `Suf-037` | -ery / -ry |
| `Suf-108` | -ade² / 動作 | `Suf-107` | -ade |
| `Suf-109` | -ee² / 数量 | `Suf-035` | -ee |
| `Suf-116` | -ie² / -y² 軽蔑 | `Suf-104` | -y² / -ie（指小名詞） |
| `Suf-118` | -ant³（人） | `Suf-010` | -ant / -ent |
| `Suf-119` | -en⁵（指小・ペット名） | `Suf-026` | -en¹（動詞化） |
| `Suf-120` | -y³（抽象） | `Suf-017` | -y |
| `Suf-121` | -al²（動作名詞） | `Suf-012` | -al |
| `Suf-122` | -ation | `Suf-001` | -tion / -sion / -ation / -ion |
| `Suf-123` | -tion² / -sion² | `Suf-001` | -tion / -sion / -ation / -ion |
| `Suf-124` | -sion | `Suf-001` | -tion / -sion / -ation / -ion |
| `Suf-125` | -ion | `Suf-001` | -tion / -sion / -ation / -ion |
| `Suf-134` | -ade²（保存食・飲料） | `Suf-107` | -ade |
| `Suf-137` | -ster² 軽蔑 | `Suf-115` | -ster |

### 単語カードからの語源リンク（etym_links.json）の付け替え

- 削除された51件を指していた参照 **152件** を、すべて統合先IDへ付け替え
- 解決できず削除した参照: **0件**
- 付け替え後、存在しないIDを指す参照: **0件**
- リンクを持つ単語カード数: 2355 → 2355（変化なし）

---

## 3. 「その他」80件のテーマ振り分け ★本題

v2 の新規149件のうち **80件がテーマ大分類「その他」** のまま入っていた。
「その他」に溜まるとテーマ別学習（`ROOT_THEMES` 15分類）で意味のグルーピングが効かないため、
全件を15分類のいずれかへ振り分けた（`/home/user/etymwork/theme_remap.py`）。

### 振り分け後の分布

| テーマ大分類 | 件数 |
|---|---:|
| 動作・運動 | 21 |
| 身体 | 20 |
| 関係・社会 | 10 |
| 状態・存在 | 6 |
| 自然・物質 | 5 |
| 価値・善悪 | 4 |
| 感覚 | 4 |
| 言語・伝達 | 4 |
| 形・構造 | 2 |
| 思考・知識 | 2 |
| 数量・程度 | 1 |
| 生命 | 1 |
| **合計** | **80** |

### 振り分けの方針

| 対象 | 振り分け先 | 理由 |
|---|---|---|
| 医学系接尾辞（`-centesis` `-emia` `-megaly` `-penia` `-pexy` `-phagia` `-plegia` `-pnea` `-rrhage` `-rrhea` `-uria` など） | **身体** | いずれも身体の部位・症状・処置を表す。医学用語としてまとまって覚えられる |
| 動作を表すラテン・ギリシャ語根（`bol-`（投げる）`clud-`（閉じる）`flect-`（曲げる）など） | **動作・運動** | コア意味がそのまま動作 |
| 現代造語系接尾辞（`-athon` `-core` `-gate` `-holic` `-preneur` `-scape` `-splain` `-ware`） | **関係・社会** | 社会現象・文化・流行から生まれた語。**「品詞化」には入れない**（品詞化は文法的な品詞転換専用のため） |
| 感覚・知覚系（`-esthesia` など） | **感覚** / **身体** | 医学文脈のものは身体、一般的な知覚は感覚 |
| 言語・記号系（`glyph-` `-graphy` 系など） | **言語・伝達** | 書く・刻む・伝えるの意味 |

> **「品詞化」を使わなかった理由**: `品詞化` は `-tion` `-ly` `-ness` のように「品詞を変える働き」に
> 限定された分類。`-gate`（〜疑惑）や `-holic`（〜中毒）は品詞を変えるものではなく意味を足す語なので、
> 意味内容にもとづき **関係・社会** に置いた。

### 全80件の対応表

`小分類` は `theme` フィールドの右側（`大分類 ＞ 小分類` の形で保存される）。

| ID | 見出し | コア意味 | 振り分け先（大分類 ＞ 小分類） |
|---|---|---|---|
| `Add-1006` | bol- / bal- / blem- | 投げる | 動作・運動 ＞ 投げる |
| `Add-1007` | clud- / clus- / clos- | 閉じる | 動作・運動 ＞ 閉じる |
| `Add-1008` | flect- / flex- | 曲げる | 動作・運動 ＞ 曲げる |
| `Add-1009` | fus- / fund- / found- | 注ぐ、溶かす | 動作・運動 ＞ 注ぐ |
| `Add-1010` | her- / hes- | くっつく、付着する | 動作・運動 ＞ 付着する |
| `Add-1011` | phor- / pher- | 運ぶ、担う | 動作・運動 ＞ 運ぶ |
| `Add-1012` | prehend- / pris- | つかむ、取る | 動作・運動 ＞ つかむ |
| `Add-1013` | press- | 押す | 動作・運動 ＞ 押す |
| `Add-1014` | the- / thes- / thet- | 置く | 動作・運動 ＞ 置く |
| `Add-1061` | drom- | 走る・走路 | 動作・運動 ＞ 走る |
| `Add-1062` | fug- | 逃げる | 動作・運動 ＞ 逃げる |
| `Add-1063` | glyph- / glypt- | 彫る・刻む | 動作・運動 ＞ 彫る・刻む |
| `Add-1068` | junct- / jug- | つなぐ | 動作・運動 ＞ つなぐ |
| `Add-1069` | lig- / ly- | 縛る・結ぶ | 動作・運動 ＞ 縛る・結ぶ |
| `Add-1072` | mut- | 変える | 動作・運動 ＞ 変える |
| `Add-1078` | punct- / pung- | 刺す・点 | 動作・運動 ＞ 刺す |
| `Add-1086` | string- / strict- | 締める | 動作・運動 ＞ 締める |
| `Add-1088` | text- | 織る | 動作・運動 ＞ 織る |
| `Add-1092` | tom- / tem- | 切る | 動作・運動 ＞ 切る |
| `Add-1094` | turb- | かき乱す | 動作・運動 ＞ かき乱す |
| `Add-1097` | veh- / vect- | 運ぶ | 動作・運動 ＞ 運ぶ |
| `Add-1015` | -centesis | 穿刺 | 身体 ＞ 処置（穿刺） |
| `Add-1016` | -emia | 血液の状態 | 身体 ＞ 血液の状態 |
| `Add-1017` | -esthesia | 感覚 | 身体 ＞ 感覚 |
| `Add-1019` | -megaly | 肥大 | 身体 ＞ 肥大 |
| `Add-1020` | -penia | 減少・欠乏 | 身体 ＞ 減少・欠乏 |
| `Add-1021` | -pexy | 固定 | 身体 ＞ 処置（固定） |
| `Add-1022` | -phagia | 食べる・嚥下 | 身体 ＞ 食べる・嚥下 |
| `Add-1025` | -plegia / -paresis | 麻痺・不全麻痺 | 身体 ＞ 麻痺 |
| `Add-1026` | -pnea | 呼吸 | 身体 ＞ 呼吸 |
| `Add-1027` | -rrhage / -rrhagia | 破裂性出血 | 身体 ＞ 出血 |
| `Add-1028` | -rrhea / -rrhoea | 流出 | 身体 ＞ 流出 |
| `Add-1033` | -uria | 尿・尿の状態 | 身体 ＞ 尿 |
| `Add-1054` | carn- | 肉 | 身体 ＞ 肉 |
| `Add-1058` | dactyl- | 指 | 身体 ＞ 指 |
| `Add-1075` | pneum- / pneumon- | 息・肺・空気 | 身体 ＞ 息・肺 |
| `Add-1080` | rhe- / rrh- | 流れる | 身体 ＞ 流れる |
| `Add-1089` | thanat- | 死 | 身体 ＞ 死 |
| `Add-1091` | thym- | 気・魂 | 身体 ＞ 気・魂 |
| `Add-1114` | capit- / chief- | 頭・主要な | 身体 ＞ 頭・主要 |
| `Add-1117` | cord- / cor- | 心 | 身体 ＞ 心 |
| `Add-1076` | polem- | 戦争・論争 | 関係・社会 ＞ 戦争・論争 |
| `Add-1085` | strat- | 軍・軍隊 | 関係・社会 ＞ 軍・軍隊 |
| `Add-1101` | -athon | 長時間イベント | 関係・社会 ＞ 現代造語 |
| `Add-1102` | -core | ジャンル・美学 | 関係・社会 ＞ 現代造語 |
| `Add-1103` | -gate | 事件・スキャンダル | 関係・社会 ＞ 現代造語 |
| `Add-1104` | -holic / -aholic | 〜中毒者 | 関係・社会 ＞ 現代造語 |
| `Add-1105` | -preneur | 〜起業家 | 関係・社会 ＞ 現代造語 |
| `Add-1106` | -scape | 〜の景観 | 関係・社会 ＞ 現代造語 |
| `Add-1107` | -splain | 上から目線の説明 | 関係・社会 ＞ 現代造語 |
| `Add-1108` | -ware | 製品・ソフト類 | 関係・社会 ＞ 現代造語 |
| `Add-1056` | cresc- / cret- | 育つ・増える | 状態・存在 ＞ 育つ・増える |
| `Add-1060` | dorm- | 眠る | 状態・存在 ＞ 眠る |
| `Add-1066` | habit- / hibit- | 持つ・住む | 状態・存在 ＞ 持つ・住む |
| `Add-1087` | termin- | 境界・終わり | 状態・存在 ＞ 境界・終わり |
| `Add-1096` | vac- / van- | 空・空にする | 状態・存在 ＞ 空・無 |
| `Add-1098` | vig- / veg- | 活発 | 状態・存在 ＞ 活発 |
| `Add-1053` | agr- / agri- | 畑・農業 | 自然・物質 ＞ 畑・農業 |
| `Add-1079` | rad- / ras- | 根・削る | 自然・物質 ＞ 根 |
| `Add-1081` | scler- | 硬い | 自然・物質 ＞ 硬い |
| `Add-1082` | seism- | 揺れる | 自然・物質 ＞ 揺れる |
| `Add-1100` | zym- | 酵母・発酵 | 自然・物質 ＞ 発酵 |
| `Add-1057` | culp- | 罪・過ち | 価値・善悪 ＞ 罪・過ち |
| `Add-1059` | dign- | 価値ある | 価値・善悪 ＞ 価値ある |
| `Add-1064` | grav- / griev- | 重い | 価値・善悪 ＞ 重い |
| `Add-1074` | plac- | 喜ばせる・なだめる | 価値・善悪 ＞ 喜ばせる |
| `Add-1052` | acu- / acr- | 鋭い | 感覚 ＞ 鋭い |
| `Add-1055` | clar- | 明るい・明快 | 感覚 ＞ 明るい・明快 |
| `Add-1090` | theat- / thea- | 見る・観察する | 感覚 ＞ 見る |
| `Add-1093` | ton- | 音・張り | 感覚 ＞ 音 |
| `Add-1070` | liter- | 文字 | 言語・伝達 ＞ 文字 |
| `Add-1083` | sema- / semio- | しるし | 言語・伝達 ＞ しるし |
| `Add-1084` | spond- / spons- | 誓う・約束する | 言語・伝達 ＞ 誓う・約束 |
| `Add-1099` | vot- / vow- | 誓う・願う | 言語・伝達 ＞ 誓う・願う |
| `Add-1067` | icon- | 像 | 形・構造 ＞ 像 |
| `Add-1095` | typ- | 型・刻印 | 形・構造 ＞ 型・刻印 |
| `Add-1071` | mne- / mnes- | 記憶 | 思考・知識 ＞ 記憶 |
| `Add-1077` | prag- | 行為・事柄 | 思考・知識 ＞ 行為・事柄 |
| `Add-1073` | numer- | 数える | 数量・程度 ＞ 数える |
| `Add-1065` | gymn- | 裸 | 生命 ＞ 裸 |

### 触らなかった「その他」28件

v2 で「その他」だった108件のうち、**残る28件は v1 からずっと「その他」だった既存エントリ**。
これらは既に学習カードとして出題され進捗が付いている可能性があるため、
テーマを動かすと「テーマ別の学習履歴の見え方」が変わってしまう。今回は意図的に据え置いた。

| ID | 見出し | v1のテーマ |
|---|---|---|
| `Pref-137` | theo- | その他 |
| `Root-072` | terr-² / terror- | その他 |
| `Root-094` | amic- / amor- | その他 |
| `Root-172` | phil- | その他 |
| `Root-217` | gluc- / glyc- | その他 |
| `Root-236` | hier- | その他 |
| `Root-254` | iatr- | その他 |
| `Root-267` | love- | その他 |
| `Suf-067` | -phobia | その他 |
| `Suf-068` | -philia / -phile | その他 |
| `Suf-069` | -mania / -maniac | その他 |
| `Suf-070` | -pathy | その他 |
| `Suf-071` | -itis | その他 |
| `Suf-072` | -oma | その他 |
| `Suf-073` | -osis | その他 |
| `Suf-074` | -ectomy | その他 |
| `Suf-075` | -tomy | その他 |
| `Suf-076` | -plasty | その他 |
| `Suf-077` | -plegia | その他 |
| `Suf-078` | -emia / -aemia | その他 |
| `Suf-079` | -algia | その他 |
| `Suf-088` | -ase | その他 |
| `Suf-089` | -ide | その他 |
| `Suf-090` | -ate²（化学塩） | その他 |
| `Suf-091` | -ite | その他 |
| `Suf-092` | -ium | その他 |
| `Suf-112` | -ine²（化学・薬品） | その他 |
| `Suf-126` | -y⁴（病名・状態） | その他 |

---

## 4. 例単語の日本語訳195語（エージェント生成）

v2 で追加された例単語451語のうち、**195語には日本語訳が入っていなかった**（`日本語訳` 列が空）。
訳が無いと解答後の派生語リストが空欄になるため、以下の方針で補った。

1. まず既存データから自動で引き当て（`words_full.json` 6559語 + v1 `etymology.json` の例単語 → 計8322語の辞書）→ 451語のうち **256語**が一致
2. 残る **195語** は既存データにも無いため、**私（エージェント）が作成**

> ⚠️ **出典に関する注意**
> この195語の訳は既存データセット由来ではなく、**エージェントが生成したもの**です。
> ユーザーの了承（Option C）のうえで採用しています。医学用語は標準的な日本語医学用語に
> 合わせていますが、気になる訳があれば個別に直してください。定義元は
> `/home/user/etymwork/ja_manual.py` の `JA_MANUAL` にまとまっています。

### 訳の付け方の方針

- 20字程度までの簡潔な訳にする（一覧表示で折り返さない長さ）
- 語源が分かりにくい語は括弧で補足（例 `palindrome` →「回文（前後どちらから読んでも同じ）」）
- 医学用語は日本語の標準病名・術式名を使う（例 `bradycardia` →「徐脈（脈が遅い）」、`colectomy` →「結腸切除術」）
- 現代造語はカタカナ＋意味の補足（例 `cottagecore` →「コテージコア（田舎暮らし志向の美学）」）

### 195語の一覧

| 英単語 | 付けた訳 | 出てくる語源エントリ |
|---|---|---|
| adhesive | 接着剤、粘着性の | `Add-1010` |
| allophone | 異音（同一音素の変種） | `Add-1034` |
| allotrope | 同素体 | `Add-1034` |
| amnesty | 恩赦、大赦 | `Add-1071` |
| amniocentesis | 羊水検査 | `Add-1015` |
| analgesic | 鎮痛剤、鎮痛性の | `Add-1110` |
| aorta | 大動脈 | `Add-1111` |
| aortic | 大動脈の | `Add-1111` |
| aortography | 大動脈造影法 | `Add-1111` |
| apnea | 無呼吸 | `Add-1026` |
| apotheosis | 神格化、極致 | `Add-1014` |
| arteriography | 動脈造影法 | `Add-1112` |
| arteritis | 動脈炎 | `Add-1112` |
| astrophysics | 天体物理学 | `Add-1036` |
| bearded | あごひげのある | `Add-1001` |
| bradycardia | 徐脈（脈が遅い） | `Add-1037` |
| bradykinesia | 運動緩慢 | `Add-1037` |
| building | 建物、建築 | `Add-1004` |
| cardiomegaly | 心拡大 | `Add-1019` |
| carnal | 肉体の、肉欲の | `Add-1054` |
| catarrh | カタル（粘膜の炎症） | `Add-1080` |
| cellular | 細胞の、携帯電話の | `Add-1146` |
| chemotherapy | 化学療法 | `Add-1031` |
| cityscape | 都市景観 | `Add-1106` |
| clarity | 明晰さ、透明度 | `Add-1055` |
| colectomy | 結腸切除術 | `Add-1116` |
| colonoscopy | 大腸内視鏡検査 | `Add-1029`, `Add-1116` |
| colostomy | 人工結腸肛門造設術 | `Add-1030`, `Add-1116` |
| concord | 一致、協調 | `Add-1117` |
| conjugal | 夫婦の、婚姻の | `Add-1068` |
| cottagecore | コテージコア（田舎暮らし志向の美学） | `Add-1102` |
| craniotomy | 開頭術 | `Add-1118` |
| cranium | 頭蓋 | `Add-1118` |
| cryptography | 暗号学、暗号技術 | `Add-1039` |
| dactylic | 長短短格の（詩の韻律） | `Add-1058` |
| decimeter | デシメートル（1/10メートル） | `Add-1040` |
| Deflategate | デフレートゲート（NFL空気圧不正疑惑） | `Add-1103` |
| defrost | 霜取りする、解凍する | `Add-1005` |
| dehydrate | 脱水する | `Add-1005` |
| deign | 恐れ多くも〜する | `Add-1059` |
| denomination | 名称、宗派、額面 | `Add-1131` |
| dysphagia | 嚥下障害 | `Add-1022` |
| dysplasia | 異形成 | `Add-1024` |
| dysthymia | 気分変調症 | `Add-1091` |
| echocardiogram | 心エコー図 | `Add-1122` |
| echograph | 超音波検査装置 | `Add-1122` |
| echolocation | 反響定位（エコーロケーション） | `Add-1122` |
| ectoderm | 外胚葉 | `Add-1044` |
| electrocardiogram | 心電図 | `Add-1018` |
| endocrine | 内分泌の | `Add-1043` |
| endogenous | 内因性の | `Add-1043` |
| endoscope | 内視鏡 | `Add-1043` |
| endoscopy | 内視鏡検査 | `Add-1029` |
| exculpate | 無罪にする、罪を免じる | `Add-1057` |
| exoskeleton | 外骨格 | `Add-1044` |
| exsanguinate | 失血させる | `Add-1136` |
| fugitive | 逃亡者、逃亡中の | `Add-1062` |
| gamete | 生殖細胞、配偶子 | `Add-1124` |
| gastropexy | 胃固定術 | `Add-1021` |
| gonad | 生殖腺 | `Add-1126` |
| grievance | 不満、苦情 | `Add-1064` |
| gymnasium | 体育館 | `Add-1065` |
| gymnastics | 体操 | `Add-1065` |
| gymnosperm | 裸子植物 | `Add-1065` |
| hackathon | ハッカソン（集中開発イベント） | `Add-1101` |
| hardcore | 徹底した、硬派な | `Add-1102` |
| hardware | ハードウェア、金物 | `Add-1108` |
| hectare | ヘクタール | `Add-1040` |
| hematuria | 血尿 | `Add-1033` |
| hemiparesis | 片側の部分麻痺 | `Add-1025` |
| hepatomegaly | 肝拡大 | `Add-1019` |
| hippodrome | 競馬場、古代の競技場 | `Add-1061` |
| homeostasis | 恒常性（ホメオスタシス） | `Add-1045` |
| hyperplasia | 過形成 | `Add-1024` |
| icon | 象徴、アイコン、聖像 | `Add-1067` |
| iconic | 象徴的な | `Add-1067` |
| ileostomy | 回腸人工肛門造設術 | `Add-1030` |
| incarnation | 化身、具現 | `Add-1054` |
| indignant | 憤慨した | `Add-1059` |
| inflection | 語形変化、抑揚 | `Add-1008` |
| infuse | 注ぎ込む、吹き込む | `Add-1009` |
| intonation | 抑揚、イントネーション | `Add-1093` |
| intracranial | 頭蓋内の | `Add-1118` |
| intrapreneur | 社内起業家 | `Add-1105` |
| isometric | 等尺性の、等大の | `Add-1046` |
| junction | 接合点、合流点 | `Add-1068` |
| laryngectomy | 喉頭切除術 | `Add-1127` |
| laryngitis | 喉頭炎 | `Add-1127` |
| laryngoscope | 喉頭鏡 | `Add-1127` |
| leukopenia | 白血球減少症 | `Add-1020` |
| luminescence | 発光、ルミネセンス | `Add-1002` |
| malware | マルウェア（悪意あるソフト） | `Add-1108` |
| mammary | 乳房の | `Add-1129` |
| mammogram | 乳房X線写真 | `Add-1129` |
| mansplain | 男が偉そうに説明する | `Add-1107` |
| meeting | 会議、面会 | `Add-1004` |
| menorrhagia | 過多月経 | `Add-1027` |
| mesosphere | 中間圏 | `Add-1047` |
| Mesozoic | 中生代 | `Add-1047` |
| myringotomy | 鼓膜切開術 | `Add-1143` |
| neoplasia | 新生物形成 | `Add-1024` |
| nephropexy | 腎固定術 | `Add-1021` |
| normcore | ノームコア（究極の普通志向） | `Add-1102` |
| number | 数、番号 | `Add-1073` |
| obsolescent | 廃れつつある | `Add-1002` |
| oligopoly | 寡占 | `Add-1048` |
| oropharyngeal | 口腔咽頭の | `Add-1132` |
| palindrome | 回文（前後どちらから読んでも同じ） | `Add-1061` |
| parable | たとえ話、寓話 | `Add-1006` |
| paresthesia | 感覚異常（ピリピリ感） | `Add-1017` |
| peregrine | 外来の、ハヤブサ | `Add-1053` |
| perturb | かき乱す、動揺させる | `Add-1094` |
| petroglyph | 岩面彫刻、ペトログリフ | `Add-1063` |
| pharyngitis | 咽頭炎 | `Add-1132` |
| pharyngoscopy | 咽頭鏡検査 | `Add-1132` |
| phlebectomy | 静脈切除術 | `Add-1133` |
| phlebitis | 静脈炎 | `Add-1133` |
| phlebotomy | 瀉血、採血 | `Add-1133` |
| phosphorus | リン | `Add-1011` |
| Pizzagate | ピザゲート（陰謀論スキャンダル） | `Add-1103` |
| planar | 平面の | `Add-1146` |
| plasmid | プラスミド | `Add-1134` |
| pleural | 胸膜の | `Add-1135` |
| pleurisy | 胸膜炎 | `Add-1135` |
| pleurodynia | 胸壁痛 | `Add-1135` |
| pneumonectomy | 肺切除術 | `Add-1075` |
| polemical | 論争的な | `Add-1076` |
| polydactyly | 多指症 | `Add-1058` |
| polyphagia | 多食症 | `Add-1022` |
| polyuria | 多尿 | `Add-1033` |
| postmortem | 死後の、検死 | `Add-1130` |
| pragmatic | 実用的な、現実的な | `Add-1077` |
| pragmatism | 実用主義、プラグマティズム | `Add-1077` |
| praxis | 実践、慣行 | `Add-1077` |
| pretext | 口実、言い訳 | `Add-1088` |
| problem | 問題 | `Add-1006` |
| psychotherapy | 心理療法 | `Add-1031` |
| pterodactyl | 翼手竜（プテロダクティルス） | `Add-1058` |
| quasi-experimental | 準実験的な | `Add-1149` |
| quasi-official | 半官の、準公式の | `Add-1149` |
| quasi-stellar | 準星の | `Add-1149` |
| radiography | X線撮影法 | `Add-1018` |
| retroactive | 遡及する | `Add-1049` |
| retrograde | 逆行する、後退する | `Add-1049` |
| revolve | 回転する | `Add-1145` |
| rheum | 粘液、目やに | `Add-1080` |
| rhinorrhea | 鼻水、鼻漏 | `Add-1028` |
| running | 走ること、運営 | `Add-1004` |
| sanguinary | 血なまぐさい | `Add-1136` |
| scleroderma | 強皮症 | `Add-1081` |
| seborrhea | 皮脂分泌過多 | `Add-1028` |
| seclusion | 隔離、隠遁 | `Add-1007` |
| semantics | 意味論 | `Add-1083` |
| semaphore | 手旗信号、腕木信号 | `Add-1011`, `Add-1083` |
| semiotics | 記号論 | `Add-1083` |
| shopaholic | 買い物中毒者 | `Add-1104` |
| software | ソフトウェア | `Add-1108` |
| solopreneur | 一人起業家 | `Add-1105` |
| soundscape | 音風景、サウンドスケープ | `Add-1106` |
| stenography | 速記 | `Add-1050` |
| stenosis | 狭窄 | `Add-1050` |
| stereoscope | 立体鏡 | `Add-1140` |
| stereotyping | 固定観念化 | `Add-1140` |
| stratagem | 策略、計略 | `Add-1085` |
| surprise | 驚き、驚かす | `Add-1012` |
| tachometer | 回転速度計 | `Add-1051` |
| tachycardia | 頻脈 | `Add-1051` |
| tachypnea | 頻呼吸 | `Add-1026` |
| talented | 才能のある | `Add-1001` |
| telethon | 長時間チャリティー番組 | `Add-1101` |
| terminate | 終わらせる | `Add-1087` |
| thanatology | 死生学 | `Add-1089` |
| theater | 劇場 | `Add-1090` |
| theatrical | 演劇の、芝居がかった | `Add-1090` |
| thoracentesis | 胸腔穿刺 | `Add-1015` |
| thoracic | 胸部の | `Add-1141` |
| thoracotomy | 開胸術 | `Add-1141` |
| thrombocyte | 血小板（血を固める細胞） | `Add-1142` |
| thrombocytopenia | 血小板減少症 | `Add-1020` |
| thrombosis | 血栓症 | `Add-1142` |
| thrombus | 血栓 | `Add-1142` |
| thymus | 胸腺 | `Add-1091` |
| tracheostomy | 気管切開術 | `Add-1030` |
| tympanic | 鼓膜の | `Add-1143` |
| tympanoplasty | 鼓膜形成術 | `Add-1143` |
| type | 型、種類、タイプする | `Add-1095` |
| understanding | 理解、了解 | `Add-1004` |
| vasoconstriction | 血管収縮 | `Add-1144` |
| vasodilation | 血管拡張 | `Add-1144` |
| walkathon | 長距離チャリティー歩行 | `Add-1101` |
| walked | 歩いた | `Add-1001` |
| Watergate | ウォーターゲート事件 | `Add-1103` |
| whitesplain | 白人が偉そうに説明する | `Add-1107` |
| workaholic | 仕事中毒者 | `Add-1104` |
| zymurgy | 醸造学 | `Add-1100` |

---

## 5. v2 データの品質問題と、その対処

v2 データセットは既存データと表記規約が違っていたため、そのまま入れると
**アプリの表示が壊れる箇所があった**。以下は取り込み時に補正した内容。

### 5-1. 【重大】語源ヒントに `productive` が露出する問題（417件）

`app-data.js` の `normEtym()` は、語源ヒント（入力形式で表示されるヒント）を
こう作っている（**このファイルは変更禁止**）。

```js
const origin = (e.origin || '').replace(/`[^`]*`/g, '').replace(/\s*\/\s*$/,'').trim();
```

つまり **`` `...` `` で囲まれた部分を消す** 前提。v1 は生産性キーワードを必ず
バッククォートで囲っていたが、v2 は囲みが外れていた。

| | origin の値 | 画面に出るヒント |
|---|---|---|
| v1 | ``ラテン語 *prae*（前に、先に） / `productive` `` | `ラテン語 prae（前に、先に）` ✅ |
| v2（素） | `ラテン語 prae（前に、先に） / productive` | `ラテン語 prae（前に、先に） / productive` ❌ |

`productive` は「その接辞が今も新語を作るか」という**制作用メタ情報**で、
学習者に見せるものではない。**417件**で露出していた。

→ 対処: 取り込み時に生産性キーワードを `` ` `` で囲み直した（`build_etym.py` の `norm_origin()`）。
`語源` 列に生産性が入っていない新規エントリは、`生産性` 列の値を末尾に補った。

**結果: 露出 417件 → 0件**

### 5-2. 言語名の表記ゆれ（新規149件）

v2 の新規エントリは `ギリシャ` `ラテン` と「語」が無い表記だった（v1 は `ギリシャ語` `ラテン語`）。
→ 先頭の言語名だけ v1 の表記に揃えた（`norm_lang()`）。**内容は足していない**。

なお、新規149件のうち57件は語源が言語名のみ（`ギリシャ語` だけ）で、
v1 のような語形の情報（`ギリシャ語 kentein（刺す）`）が入っていない。
これは元の xlsx の `語源` 列・`起源言語` 列が両方とも同じ値しか持っていないためで、
**データセット側の情報不足**。捏造を避けるためそのままにしている（将来の改善候補）。

### 5-3. 空欄で既存データを上書きしないようにした

v2 の一部セルは空になっていた。素直に取り込むと既存エントリの
「覚え方」「混同注意」などが消える。
→ 新しい値が空なら **v1 の値を残す** フォールバックを入れた（`build_etym.py` の `keep()`）。

**結果: 既存539件で内容が空になった項目 0件**

### 5-4. v2 が直してくれていた v1 のバグ（2件）

逆に、v1 側が壊れていて v2 が正しかったものもある。

| ID | v1 のヒント（表示） | v2 のヒント（表示） |
|---|---|---|
| `Pref-004` | `ラテン語 in-（否定、印欧祖語 n̥- と同源、英語  と兄弟）` ← **単語が欠落** | `ラテン語 in-（否定、印欧祖語 n̥- と同源、英語 un- と兄弟）` |
| `Pref-027` | `ギリシャ語 a-, an-（否定、英語  と同源）` ← **単語が欠落** | `ギリシャ語 a-, an-（否定、英語 un- と同源）` |

v1 は `英語 `un-` と兄弟` と書いていたため、バッククォート除去で `un-` ごと消えていた。

### 5-5. マークダウン装飾の除去（副作用なし）

v2 では `*斜体*` `**太字**` が外れている。アプリは `esc()` でそのまま表示していて
マークダウンを解釈しないため、**v1 ではこれらの記号が画面にそのまま出ていた**。
つまり v2 の方が読みやすい。`variants` は表示前に `` ` `` を除去しているので表示は同一。

---

## 6. 検証結果

### データ検証（全24項目）

| 検証項目 | 結果 |
|---|---|
| 総数688件 / 内訳 159・159・370 | ✅ |
| JSON のキー順が v1 と一致 | ✅ |
| ID 重複なし | ✅ |
| **v1 learnable 539件の ID が全生存**（進捗孤児ゼロ） | ✅ |
| 共通エントリの learnable が変化していない | ✅ |
| 語根の themeGroup が15分類の中だけ | ✅ |
| 接辞は15分類 + 品詞化/否定・反対 の中だけ | ✅ |
| `group` = `category:themeGroup` の形 | ✅ |
| 「その他」は28件のみ（新規は0件） | ✅ |
| 例単語3685件・訳の空欄なし | ✅ |
| ヒントに生産性キーワードの露出なし | ✅ |
| `etym_links.json` に存在しないIDへの参照なし | ✅ |
| `meta.json` の語源キーが実データと一致 | ✅ |
| `meta.json` の非語源キー（words 等）が不変 | ✅ |

### 実コードでの動作確認

`app-data.js` を実際に読み込んで新データを流した結果。

```
deckCards('etym'):        688枚
必須項目が欠けたカード:      0件
ヒントに生産性の漏れ:        0件
リンク解決できないカード:     0件
debugThemeCounts:        15テーマ・合計370（語根総数と一致）
```

### テストスイート

| スイート | 結果 |
|---|---|
| config-and-logcols | ✅ 192 |
| weak-mode | ✅ 62 |
| legacy-stop | ✅ 81 |
| outbox | ✅ 145 |
| scenario-airplane | ✅ 57 |
| daily | ✅ 138 |
| e2e-daily | ✅ 55 |
| regress | ✅ 48 |
| **etym-v2（今回追加）** | **✅ 49** |
| **合計** | **✅ 827 passed / 0 failed** |

`daily.js` は「語根の15テーマ外は `(未分類)` のみ」という v1 のデータ汚れを
前提にした検証を持っていたため、`(未分類)` が無くても通るよう条件を緩めた
（v2 では0件になるのが正しい状態）。

新規追加した `etym-v2.js` は、今後データを更新したときに
**進捗互換性・テーマ分類・ヒント露出・リンク整合** が壊れたら落ちるようにしてある。

---

## 7. 変更したファイル

| ファイル | 内容 |
|---|---|
| `public/static/data/etymology.json` | 590件 → 688件に再生成 |
| `public/static/data/etym_links.json` | 削除された51件への参照152件を統合先へ付け替え |
| `public/static/data/meta.json` | `prefix` `suffix` `root` `etym_learnable` `etym_groups` を更新（他のキーは不変） |
| `README.md` | 語源の件数・グループ数を更新 |
| `docs/etymology-v2-update.md` | 本ドキュメント（新規） |

アプリのコードは **1行も変更していない**（`app-data.js` `session.js` `flashcard.js` などは無変更）。

### 生成用スクリプト（リポジトリ外・`/home/user/etymwork/`）

| ファイル | 内容 |
|---|---|
| `build_etym.py` | 変換本体。`--write` を付けない限りドライラン |
| `ja_manual.py` | §4 の195語の訳 |
| `theme_remap.py` | §3 の80件の振り分け表 |
| `*.json.bak` | 更新前の3ファイルのバックアップ |

---

## 8. 残っている課題

- **新規149件のうち57件は語源情報が言語名のみ**（§5-2）。元データに情報が無いため補えていない。
  v1 相当の詳しさ（`ギリシャ語 kentein（刺す）`）にするには別途出典が必要。
- **例単語の訳2件が `—`**（`Suf-114 -ren` の「（他、化石化のため少数）」「（同上）」）。
  これは v1 からある同じダミー行で、単語ではない行が例単語として入っているもの。v2 でも直っていない。
- **195語の訳はエージェント生成**（§4）。データの出典が混在している点は記録として残す。
