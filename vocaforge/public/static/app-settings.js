/* 設定画面のイベント束ね（app.js から切り出し／内容は無変更）
 * テーマ / データセット切替 / スライダー / FSRS最適化 /
 * ログイン・ログアウト / リセット / エクスポート / インポート
 */
(function () {
  'use strict';
  const ns = (window.__VFApp = window.__VFApp || {});
  const DATA = ns.DATA;
  const go = ns.go;
  const render = ns.render;
  const loadFullWords = ns.loadFullWords;
  const loadLeapWords = ns.loadLeapWords;
  const loadFullPhrases = ns.loadFullPhrases;
  // 遅延解決ブリッジ: bindAccount は app-account.js（後読み込み）で定義される
  function bindAccount() { return ns.bindAccount.apply(null, arguments); }

  function bindSettings() {
    // 外観テーマ切替
    document.querySelectorAll('[data-theme]').forEach(b => {
      b.onclick = () => {
        if (window.__applyTheme) window.__applyTheme(b.getAttribute('data-theme'));
        render(); // ボタンの選択状態を更新
      };
    });
    // 単語DB切替（ターゲット1900 / 全部バージョン / Leap）
    document.querySelectorAll('[data-dataset]').forEach(b => {
      b.onclick = async () => {
        const mode = b.getAttribute('data-dataset');
        if (mode === Store.getSettings().wordDataset) return;
        if ((mode === 'full' && !DATA.wordsFull) || (mode === 'leap' && !DATA.wordsLeap)) {
          b.innerHTML = '<i class="fas fa-circle-notch fa-spin text-lg"></i><span class="text-xs">読込中…</span>';
          const ok = mode === 'leap' ? await loadLeapWords() : await loadFullWords();
          if (!ok) { alert('データの読み込みに失敗しました'); render(); return; }
        }
        Store.setSettings({ wordDataset: mode });
        render();
      };
    });
    // 熟語DB切替（ターゲット1000 / 全部バージョン）
    document.querySelectorAll('[data-phrase-dataset]').forEach(b => {
      b.onclick = async () => {
        const mode = b.getAttribute('data-phrase-dataset');
        if (mode === Store.getSettings().phraseDataset) return;
        if (mode === 'full' && !DATA.phrasesFull) {
          b.innerHTML = '<i class="fas fa-circle-notch fa-spin text-lg"></i><span class="text-xs">読込中…</span>';
          const ok = await loadFullPhrases();
          if (!ok) { alert('データの読み込みに失敗しました'); render(); return; }
        }
        Store.setSettings({ phraseDataset: mode });
        render();
      };
    });
    document.querySelectorAll('[data-set]').forEach(el => {
      const key = el.getAttribute('data-set');
      if (el.type === 'checkbox') {
        el.onchange = () => {
          if (key.startsWith('fmt-')) {
            const f = key.slice(4);
            const s = Store.getSettings();
            s.formats[f] = el.checked;
            // 全部OFFは禁止
            if (!Object.values(s.formats).some(Boolean)) { s.formats[f] = true; el.checked = true; alert('最低1つの出題形式が必要です'); }
            Store.setSettings({ formats: s.formats });
          } else {
            Store.setSettings({ [key]: el.checked });
          }
        };
      } else if (el.type === 'range') {
        el.oninput = () => {
          if (key === 'requestRetention') {
            document.getElementById('rr-val').textContent = el.value + '%';
            Store.setSettings({ requestRetention: parseInt(el.value, 10) / 100 });
          } else if (key === 'newPerDay') {
            document.getElementById('np-val').textContent = el.value;
            Store.setSettings({ newPerDay: parseInt(el.value, 10) });
          } else if (key === 'sectionNewLimit') {
            document.getElementById('snl-val').textContent = el.value;
            Store.setSettings({ sectionNewLimit: Math.max(10, parseInt(el.value, 10)) });
          }
        };
      }
    });
    // ---- FSRSパラメータ最適化 ----
    const optBtn = document.getElementById('fsrs-opt-btn');
    if (optBtn && window.FSRSOpt) optBtn.onclick = async () => {
      optBtn.disabled = true;
      const label = optBtn.innerHTML;
      optBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>最適化中… 0%';
      try {
        const res = await FSRSOpt.optimize(pct => {
          optBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>最適化中… ' + pct + '%';
        });
        if (!res.ok) {
          alert('復習履歴が足りません（' + res.reviews + ' / ' + res.needed + ' 件）。学習を続けてから再度お試しください。');
        } else if (res.applied) {
          const imp = res.before > 0 ? Math.round((1 - res.after / res.before) * 100) : 0;
          alert('最適化が完了しました！\n\n予測誤差（log loss）: ' + res.before.toFixed(4) + ' → ' + res.after.toFixed(4) +
            (imp > 0 ? '（' + imp + '%改善）' : '') +
            '\n対象レビュー: ' + res.reviews + ' 件' +
            (res.holdout ? '\n※未使用の新しい履歴で検証済み' : ''));
        } else {
          alert('現在の履歴ではデフォルトパラメータのほうが良好でした。\nパラメータは変更していません。履歴が増えたら再度お試しください。');
        }
      } catch (e) {
        alert('最適化に失敗しました: ' + e.message);
      }
      optBtn.disabled = false;
      optBtn.innerHTML = label;
      render();
    };
    const optReset = document.getElementById('fsrs-opt-reset');
    if (optReset && window.FSRSOpt) optReset.onclick = () => {
      if (confirm('個人パラメータを破棄してデフォルトに戻しますか？')) {
        FSRSOpt.resetToDefault();
        render();
      }
    };

    bindAccount(); // ---- ログイン / ログアウト ---- は app-account.js へ切り出し


    const rb = document.getElementById('reset-btn');
    if (rb) rb.onclick = () => {
      if (confirm('すべての学習進捗・統計を削除します。元に戻せません。よろしいですか？')) {
        Store.reset(); go('home');
      }
    };

    // ---- エクスポート ----
    const eb = document.getElementById('export-btn');
    if (eb) eb.onclick = () => {
      const payload = JSON.stringify(Store.exportData(), null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const stamp = d.getFullYear() + ('0'+(d.getMonth()+1)).slice(-2) + ('0'+d.getDate()).slice(-2) +
        '-' + ('0'+d.getHours()).slice(-2) + ('0'+d.getMinutes()).slice(-2);
      a.href = url;
      a.download = 'vocaforge-backup-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // ---- インポート ----
    const ib = document.getElementById('import-btn');
    const ifile = document.getElementById('import-file');
    if (ib && ifile) {
      ib.onclick = () => ifile.click();
      ifile.onchange = () => {
        const file = ifile.files && ifile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          let obj;
          try { obj = JSON.parse(reader.result); }
          catch (e) { alert('JSONとして読み込めませんでした'); ifile.value = ''; return; }
          const merge = confirm(
            'インポート方法を選んでください。\n\n' +
            '［OK］ 統合：現在のデータに取り込み分を足し合わせる\n' +
            '［キャンセル］ 置換：現在のデータを消して取り込み分で置き換える'
          );
          // 「置換」は取り返しがつかないので、実行前に2段階で確認する
          if (!merge) {
            const ok1 = confirm(
              '【確認 1/2】「置換」を選びました。\n\n' +
              '今のデータは全て消えます。\n' +
              '　・カードの記憶状態（学習の進み具合）\n' +
              '　・復習ログ\n' +
              '　・日次記録（ミッション・ゲームの記録を含む）\n' +
              '　・設定\n' +
              'これらがファイルの内容に置き換わり、元に戻せません。\n\n' +
              '続けますか？（合体させたい場合はキャンセルして「統合」を選び直してください）'
            );
            if (!ok1) { alert('インポートを中止しました'); ifile.value = ''; return; }
            const ok2 = confirm(
              '【確認 2/2】本当に今のデータを全て消して置き換えますか？\n\n' +
              '・元に戻すには、事前にエクスポートしたファイルが必要です\n' +
              '・サーバーに新しい記録が残っているカードは、次のログイン時に\n' +
              '　サーバー側の新しい内容が戻ってくることがあります\n' +
              '　（新しい方を残す仕組みのため）\n\n' +
              'この操作を実行する場合は［OK］を押してください。'
            );
            if (!ok2) { alert('インポートを中止しました'); ifile.value = ''; return; }
          }
          const res = Store.importData(obj, merge ? 'merge' : 'replace');
          if (res.ok) {
            // 取り込んだ内容をサーバーへ反映する（行単位同期の送信待ちの箱に入れる）。
            // 旧方式の丸ごと送信は止めているので、この投入が無いとサーバーに届かない。
            let q = null;
            if (window.VFOutbox && window.VFOutbox.enqueueAllLocal) {
              try {
                q = window.VFOutbox.enqueueAllLocal();
                if (window.VFOutbox.flush) window.VFOutbox.flush();
              } catch (e) { /* 反映の準備に失敗してもインポート自体は成功扱い */ }
            }
            alert('インポートが完了しました' +
              (q ? '\n\nサーバーへ反映：カード ' + q.cards + ' 件 / 日次 ' + q.daily + ' 日分' +
                   (q.logs ? ' / ログ ' + q.logs + ' 件' : '') +
                   (q.logsSkipped ? '\n※復習ログ ' + q.logsSkipped + ' 件は件数が多いため送信対象外です' : '') +
                   '\n（順次送信します。オフラインの場合は次にオンラインになったときに送られます）'
                 : ''));
            go('home');
          }
          else { alert('インポート失敗: ' + res.error); }
          ifile.value = '';
        };
        reader.onerror = () => { alert('ファイルの読み込みに失敗しました'); ifile.value = ''; };
        reader.readAsText(file);
      };
    }
  }

  ns.bindSettings = bindSettings;
})();
