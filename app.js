/**
 * ============================================================
 * タイ語検定5級 学習アプリ — app.js
 * v1.3.0
 *
 * 実装済み機能:
 *   - タブ切り替え
 *   - フラッシュカード（表裏反転・次へ/前へ）
 *   - クイズ4択・正誤判定・解説表示
 *   - JSONファイルからデータ読み込み
 * ============================================================
 */


/* ============================================================
   ユーティリティ
   ============================================================ */

/** document.querySelector のショートハンド */
const $ = (selector) => document.querySelector(selector);

/** document.querySelectorAll のショートハンド（配列で返す） */
const $$ = (selector) => Array.from(document.querySelectorAll(selector));


/* ============================================================
   データ格納用変数
   ============================================================
   fetch() で JSON を読み込んだ後にここへ格納する。
   const だと後から書き換えられないので let を使う。
   ============================================================ */

let FLASHCARD_DATA = []; // flashcards.json の内容が入る
let QUIZ_DATA      = []; // questions_vocab_all.json の内容が入る
let correctCount = 0;
let answeredCount = 0;

/* ============================================================
   タブ切り替え
   ============================================================ */

/**
 * タブを切り替える
 * @param {string} tabName - 表示したいタブ名（data-tab の値）
 */
function switchTab(tabName) {

  // ① すべてのボタンから active を外す
  $$('.tab-btn').forEach((btn) => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  // ② すべてのセクションを非表示にする
  $$('.tab-section').forEach((section) => {
    section.hidden = true;
  });

  // ③ クリックされたボタンを active にする
  const activeBtn = $(`[data-tab="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-selected', 'true');
  }

  // ④ 対応するセクションを表示する
  const sectionId = activeBtn ? activeBtn.getAttribute('aria-controls') : null;
  if (sectionId) {
    const activeSection = $(`#${sectionId}`);
    if (activeSection) activeSection.hidden = false;
  }
}

/**
 * タブナビゲーションの初期化
 */
function initTabs() {
  const tabNav = $('#tab-nav');
  if (!tabNav) return;

  // イベント委譲：親要素でまとめてクリックを受け取る
  tabNav.addEventListener('click', (event) => {
    const btn = event.target.closest('.tab-btn');
    if (!btn) return;

    const tabName = btn.dataset.tab;
    if (tabName) switchTab(tabName);
  });
}


/* ============================================================
   フラッシュカード機能
   ============================================================
   Safari 対応ポイント:
   ・3D flip (transform-style: preserve-3d + rotateY) を完全廃止
   ・表面/裏面は opacity + pointer-events のみで切り替え
   ・次/前カード切替時は .changing クラスで瞬間 opacity:0 にし
     DOM 書き換え後に .changing を外す（transition:none で即時非表示）
   ・setTimeout(0) + requestAnimationFrame の2段構えで
     Safari の非同期 composite を確実に回避する
   ============================================================ */

// 現在表示中のカードのインデックス（0始まり）
let fcIndex = 0;

/**
 * カードの内容を現在の fcIndex に合わせて描画する
 * ※ flip 状態の制御はここでは行わない（呼び出し元が責任を持つ）
 */
function renderFlashcard() {
  const card = FLASHCARD_DATA[fcIndex];
  if (!card) return;

  // --- 表面 ---
  const thaiEl   = $('#fc-thai');
  const readEl   = $('#fc-reading');
  const posEl    = $('#fc-pos-badge');
  if (thaiEl) thaiEl.textContent   = card.thai    ?? '–';
  if (readEl) readEl.textContent   = card.reading ?? '–';
  if (posEl)  posEl.textContent    = card.pos     ?? '';

  // --- 裏面：意味・頻度 ---
  const meaningEl = $('#fc-meaning');
  const freqEl    = $('#fc-freq');
  if (meaningEl) meaningEl.textContent = card.meaning ?? '–';
  if (freqEl)    freqEl.textContent    = card.freq    ?? '';

  // --- 裏面：例文タイ語 ---
  const exEl = $('#fc-example');
  if (exEl) {
    exEl.textContent = card.example ?? '';
    exEl.hidden = !card.example;
  }

  // --- 裏面：例文の発音記号（ローマ字） ---
  const exReadingEl = $('#fc-example-reading');
  if (exReadingEl) {
    exReadingEl.textContent = card.example_reading ?? '';
    exReadingEl.hidden = !card.example_reading;
  }

  // --- 裏面：例文の日本語訳 ---
  const exMeaningEl = $('#fc-example-meaning');
  if (exMeaningEl) {
    exMeaningEl.textContent = card.example_meaning
      ? `（${card.example_meaning}）`
      : '';
    exMeaningEl.hidden = !card.example_meaning;
  }

  // --- 進捗表示（例: 1 / 3） ---
  const progressEl = $('#fc-progress');
  if (progressEl) {
    progressEl.textContent = `${fcIndex + 1} / ${FLASHCARD_DATA.length}`;
  }
}

/**
 * カードを表面にリセットしてから次のカードに切り替える
 *
 * Safari の問題:
 *   classList.remove('flip') → renderFlashcard() の順で書いても
 *   GPU composite が非同期なため裏面が一瞬残る。
 *
 * 解決手順:
 *   1. .changing を付ける（transition:none + opacity:0 で即時非表示）
 *   2. .flip を外す（表面状態に戻す。非表示中なので視覚的影響なし）
 *   3. DOM を書き換える（renderFlashcard）
 *   4. setTimeout(0) で macrotask キューの末尾へ
 *   5. requestAnimationFrame で次の描画フレームを待つ
 *   6. .changing を外す（opacity が戻り、表面が見える）
 *
 * @param {number} newIndex - 切り替え先のインデックス
 */
function navigateFlashcard(newIndex) {
  const flashcard = $('#flashcard');
  if (!flashcard) return;

  // ① 瞬間非表示（transition:none で即座に opacity:0）
  flashcard.classList.add('changing');

  // ② flip を確実に解除（非表示中なので Safari でも安全）
  flashcard.classList.remove('flip');
  flashcard.setAttribute('aria-pressed', 'false');

  // ③ インデックス更新 & DOM 書き換え
  fcIndex = newIndex;
  renderFlashcard();

  // ④-⑥ Safari の composite 完了を待って再表示
  //   setTimeout(0) → macrotask 境界を越えてから
  //   rAF           → 次の paint フレームを待つ
  //   この2段構えで Safari の非同期 GPU composite を確実に回避
  setTimeout(() => {
    requestAnimationFrame(() => {
      flashcard.classList.remove('changing');
    });
  }, 0);
}

/**
 * フラッシュカード機能の初期化
 */
function initFlashcard() {
  const flashcard = $('#flashcard');
  const prevBtn   = $('#fc-prev-btn');
  const nextBtn   = $('#fc-next-btn');

  if (!flashcard || !prevBtn || !nextBtn) return;

  // カードをタップ → 表裏を反転（opacity 切替）
  flashcard.addEventListener('click', () => {
    // .changing 中（切替アニメーション中）はタップ無効
    if (flashcard.classList.contains('changing')) return;

    flashcard.classList.toggle('flip');
    const isFlipped = flashcard.classList.contains('flip');
    flashcard.setAttribute('aria-pressed', String(isFlipped));
  });

  // キーボード（Space / Enter）でも反転
  flashcard.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      flashcard.click();
    }
  });

  // 次へ：最後なら最初に戻る
  nextBtn.addEventListener('click', () => {
    const newIndex = (fcIndex + 1) % FLASHCARD_DATA.length;
    navigateFlashcard(newIndex);
  });

  // 前へ：最初なら最後へ
  prevBtn.addEventListener('click', () => {
    const newIndex = (fcIndex - 1 + FLASHCARD_DATA.length) % FLASHCARD_DATA.length;
    navigateFlashcard(newIndex);
  });

  // 初期描画（最初は changing なし・表面表示）
  renderFlashcard();
}


/* ============================================================
   クイズ機能
   ============================================================ */

// 現在表示中の問題インデックス（0始まり）
let quizIndex = 0;

// 解答済みフラグ（連打防止）
let quizAnswered = false;

/**
 * 問題と選択肢を現在の quizIndex に合わせて描画する
 */
function renderQuiz() {
  const q = QUIZ_DATA[quizIndex];

  // データがなければ何もしない（null安全）
  if (!q) return;

  // ── 問題文 ──────────────────────────────────────
  const jpEl   = $('#quiz-question-jp');
  const thaiEl = $('#quiz-question-thai');
  const readingEl = $('#quiz-question-reading');
  if (jpEl)   jpEl.textContent   = q.question_jp      ?? '';
  if (thaiEl) thaiEl.textContent = q.question_thai  ?? '';
  if (readingEl) readingEl.textContent = q.question_reading  ?? '';

  // ── 選択肢4つ ────────────────────────────────────
  // 新JSON: choice.thai / choice.reading / choice.meaning
  const choiceBtns = $$('.choice-btn');

  q.choices.forEach((choice, i) => {

    // ① テキストスパン（#choice-0 〜 #choice-3）
    const choiceText = $(`#choice-${i}`);
    if (choiceText) {
      // タイ文字 + ローマ字を「　」で繋いで表示
      // 例: "กิน　kin"
      const thai    = choice.thai    ?? '';
      const reading = choice.reading ?? '';
      choiceText.textContent = thai ? `${thai}　${reading}` : reading;
    }

    // ② ボタン本体：IDをセット・スタイル完全リセット
    const btn = choiceBtns[i];
    if (btn) {
      btn.dataset.choiceId  = choice.id ?? String.fromCharCode(65 + i);
      btn.disabled          = false;
      btn.style.background  = '';
      btn.style.borderColor = '';
      btn.style.color       = '';
      btn.classList.remove('correct', 'wrong');
    }
  });

  // ── 解説エリアを非表示に戻す ─────────────────────
  const explanationEl = $('#quiz-explanation');
  if (explanationEl) explanationEl.hidden = true;

  // ── 結果画面を非表示に戻す ───────────────────────
  const resultEl = $('#quiz-result');
  if (resultEl) resultEl.hidden = true;

  // ── 解答済みフラグをリセット ─────────────────────
  quizAnswered = false;

  // ── 問題番号を更新 ───────────────────────────────
  const curEl   = $('#quiz-current');
  const totalEl = $('#quiz-total');
  if (curEl)   curEl.textContent   = quizIndex + 1;
  if (totalEl) totalEl.textContent = QUIZ_DATA.length;
const rateEl = $('#quiz-accuracy');

if (rateEl) {
  const rate =
    answeredCount === 0
      ? 0
      : Math.round((correctCount / answeredCount) * 100);

  rateEl.textContent = `${rate}%`;
}
}
function judgeAnswer(selectedId) {
  // 解答済みなら無視（連打防止）
  if (quizAnswered) return;
  quizAnswered = true;

  const q         = QUIZ_DATA[quizIndex];
  const isCorrect = (selectedId === q.answer);

  answeredCount++;

if (isCorrect) {
  correctCount++;
}

  // 解答後：全選択肢に意味を表示
q.choices.forEach((choice, i) => {
  const choiceText = $(`#choice-${i}`);

  if (choiceText) {
    choiceText.textContent =
      `${choice.thai ?? ''}　${choice.reading ?? ''}　${choice.meaning ?? ''}`;
  }
});
  // 選択肢ボタンに色を付ける
  $$('.choice-btn').forEach((btn) => {
    const id = btn.dataset.choiceId;

    if (id === q.answer) {
      // 正解は緑
      btn.style.background  = 'var(--green-bg)';
      btn.style.borderColor = 'var(--green)';
      btn.style.color       = 'var(--green)';
    } else if (id === selectedId && !isCorrect) {
      // 選んだ不正解は赤
      btn.style.background  = 'var(--red-bg)';
      btn.style.borderColor = 'var(--red)';
      btn.style.color       = 'var(--red)';
    }

    // 全ボタンを無効化（判定後の変更を防ぐ）
    btn.disabled = true;
  });

// 解説エリアを表示
const explanation = $('#quiz-explanation');

if (explanation) {
  explanation.hidden = false;

  const resultEl = $('#explanation-result');
  if (resultEl) {
    resultEl.textContent = isCorrect ? '✅ 正解！' : '❌ 不正解';
    resultEl.style.color = isCorrect ? 'var(--green)' : 'var(--red)';
  }

  // 解説文
  const textEl = $('#explanation-text');
  if (textEl) {
    textEl.textContent = q.explanation ?? '';
  } 
}console.log(correctCount, answeredCount);
}

/**
 * 「次の問題」ボタンの処理
 */
function goNextQuiz() {

  // 最後の問題なら結果表示
  if (quizIndex >= QUIZ_DATA.length - 1) {
    showQuizResult();
    return;
  }

  // 次の問題へ
  quizIndex++;

  console.log('現在の問題index:', quizIndex);

  renderQuiz();
}/**
 * クイズを最初からやり直す
 */
function restartQuiz() {
  // インデックスを最初へ
  quizIndex = 0;

  // スコア初期化
  correctCount = 0;
  answeredCount = 0;

  // 解答状態リセット
  quizAnswered = false;

  // 結果画面を隠す
  const result = $('#quiz-result');
  if (result) {
    result.hidden = true;
  }

  // 問題画面を再表示
  const quizCard = $('#quiz-card');
  if (quizCard) {
    quizCard.hidden = false;
  }
// ← これ追加
  console.log('restart quizIndex:', quizIndex);

  // 最初の問題を描画
  renderQuiz();
}

/**
 * クイズ機能の初期化
 */
function initQuiz() {
  const nextBtn = $('#quiz-next-btn');
  if (!nextBtn) return;

  // 選択肢ボタンにクリックイベントを登録
  $$('.choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      judgeAnswer(btn.dataset.choiceId);
    });
  });

  // 「次の問題」ボタンにクリックイベントを登録
  nextBtn.addEventListener('click', () => {
    goNextQuiz();
  });
// もう一度ボタン
  const retryBtn = $('#quiz-retry-btn');

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      restartQuiz();
    });
  }
  // 初期描画
  renderQuiz();
}


/* ============================================================
   JSONデータ読み込み
   ============================================================
   fetch() で外部JSONファイルを非同期で読み込む。
   Promise.all で2つのファイルを同時に取得し、
   両方そろってから各機能を初期化する。

   実行順序:
     1. fetch() でリクエスト送信（2つ同時）
     2. JSON が届く（await で待つ）
     3. FLASHCARD_DATA / QUIZ_DATA に格納
     4. initFlashcard() / initQuiz() を呼ぶ
        └ データがある状態で初期化されるので安全
   ============================================================ */

/**
 * JSONを読み込んでからフラッシュカード・クイズを初期化する
 */
async function loadDataAndInit() {
  try {
    // ① 2つのJSONを同時に fetch（並行処理）
    const [flashRes, quizRes] = await Promise.all([
      fetch('/data/flashcards.json'),
      fetch('/data/questions_vocab_all.json'),
    ]);

    // ② レスポンスが正常か確認
    // fetch はネットワークエラー以外で例外を投げないので自分でチェックする
    if (!flashRes.ok) throw new Error(`flashcards.json の読み込み失敗: ${flashRes.status}`);
    if (!quizRes.ok)  throw new Error(`questions_vocab_all.json の読み込み失敗: ${quizRes.status}`);

    // ③ JSONをJSオブジェクトに変換して変数へ格納
    FLASHCARD_DATA = await flashRes.json();
    QUIZ_DATA      = await quizRes.json();
    // 動作確認用
    QUIZ_DATA = QUIZ_DATA.slice(0, 3);

    console.log(QUIZ_DATA);
    console.log(Array.isArray(QUIZ_DATA));

    // 
console.log('現在読み込んでいるクイズデータ:', QUIZ_DATA);

    console.log(`✅ flashcards.json: ${FLASHCARD_DATA.length}件 読み込み完了`);
    console.log(`✅ questions_vocab_all.json: ${QUIZ_DATA.length}件 読み込み完了`);

    // ④ データがそろったので各機能を初期化
    initFlashcard();
    initQuiz();

  } catch (err) {
    // fetch 失敗時（ファイルが見つからない・JSONが壊れているなど）
    console.error('❌ JSONの読み込みエラー:', err.message);
    alert('データの読み込みに失敗しました。\nページを再読み込みしてください。');
  }
}


/* ============================================================
   アプリ初期化
   ============================================================
   DOMContentLoaded: HTML の読み込みが完了したら実行される
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // タブ切り替えはデータ不要なので即時初期化
  initTabs();
  switchTab('dashboard');

  // フラッシュカード・クイズは JSON 取得完了後に初期化
  // ※ initFlashcard() と initQuiz() は loadDataAndInit() の中で呼ぶ
  //   ここで直接呼ぶと FLASHCARD_DATA が空のままエラーになる
  loadDataAndInit();

  console.log('✅ app.js 初期化完了');
});
/**
 * クイズ結果を表示
 */
function showQuizResult() {

  const rate = Math.round((correctCount / answeredCount) * 100);

  // クイズ画面を隠す
  const quizCard = $('#quiz-card');
  if (quizCard) {
    quizCard.hidden = true;
  }

  // 結果画面を表示
  const result = $('#quiz-result');

  if (result) {
    result.hidden = false;
  }

  // スコア表示
  const scoreEl = $('#result-score');

  if (scoreEl) {
    scoreEl.innerHTML =
  `${correctCount} / ${answeredCount}問 正解<br>正答率 ${rate}%`;
  }

  // メッセージ表示
  const msgEl = $('#result-msg');

  if (msgEl) {
    if (rate === 100) {
      msgEl.textContent = '全問正解です';
    } else if (rate >= 80) {
      msgEl.textContent = 'かなり理解できています';
    } else if (rate >= 60) {
      msgEl.textContent = 'あと少しです';
    } else {
      msgEl.textContent = 'もう一度復習してみましょう';
    }
  }
}