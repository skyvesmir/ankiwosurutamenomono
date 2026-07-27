/* 出題形式の決定（session.js から切り出し／内容は無変更）
 * - 新規カード = 選択式（記入以外）
 * - 復習カード = 記入式（cloze は確率40%）
 */
(function () {
  'use strict';
  const ns = (window.__VFSession = window.__VFSession || {});

  // 出題形式の選択ルール:
  //  - 未学習（new）: まだ答えを知らないので必ず「記入以外」（選択式）で出す
  //  - 復習（learning/review）: 能動的想起を強制するため必ず「記入式」で出す
  //    記入式は type-je（意味→英語）と cloze（例文穴埋め）の2種。clozeが有効かつ
  //    例文があるカードは確率40%で例文穴埋めを出題（文脈あり想起の変化をつける）
  //
  // 既知の設計トレードオフ（分析レポート2026-07-21 §2.3）:
  //   FSRSは「gradeの意味が全レビューで均質」と暗黙に仮定するが、本ポリシーは
  //   新規=MC（正解しやすい→grade3寄り）/ 復習=記入（難しい→grade1/2寄り）という
  //   形式起因の系統的グレードシフトを生む。W[0..3]（初期安定性）が楽観側に、
  //   観測保持率が悲観側に歪み得るが、オンデバイス最適化（optimizer.js）が
  //   個人履歴にWをフィットさせる際に大部分を吸収する。全ログに format を
  //   記録済みのため（applyGrade）、将来 format 別の較正・分析が可能。
  function pickFormat(settings, isReview, card) {
    if (isReview) {
      // 例文クローズ：有効 かつ 例文を持つカード（語源デッキは対象外）なら確率40%
      if (settings.formats['cloze'] && card && card.example && card.deck !== 'etym' && Math.random() < 0.4)
        return 'cloze';
      return 'type-je';
    }
    const enabled = Object.keys(settings.formats)
      .filter(k => settings.formats[k] && k !== 'type-je' && k !== 'cloze');
    if (enabled.length === 0) return 'mc-ej'; // 記入のみ有効でも新規は選択式にフォールバック
    return enabled[Math.floor(Math.random() * enabled.length)];
  }

  ns.pickFormat = pickFormat;
})();
