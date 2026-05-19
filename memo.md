# 修正点

## フラッシュカード
- [X] フラッシュカード次を押したらネタバレするの修正→OK
- [x] 発音→OK
- [x] 問題数選択→OK

## 問題
- [x] 回答後だけ日本語訳表示→OK
- [x] 最後の問題が終わったら結果表示→OK
- [x] 正答数→OK
- [x] 正答率→OK
- [x] もう一度→OK
- [ ] 間違えたカテゴリ

document.getElementById('fc-restart-btn')?.addEventListener('click', () => {
  VOCAB_DATA.filter((c) => {
    if (fc_filterPos !== 'all' && c.pos !== fc_filterPos) return false;
    if (fc_filterImp !== 'all' && (c.importance ?? 1) < parseInt(fc_filterImp)) return false;
    return true;
  }).forEach((c) => setStatus(c.id, 'again'));

  fcIndex = 0;
  buildActive();
  renderFC();
});