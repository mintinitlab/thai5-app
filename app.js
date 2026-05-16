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
   ============================================================ */

// 現在表示中のカードのインデックス（0始まり）
let fcIndex = 0;

/**
 * カードの内容を現在の fcIndex に合わせて描画する
 */
function renderFlashcard() {
  const card = FLASHCARD_DATA[fcIndex];

  // データがなければ何もしない（安全対策）
  if (!card) return;

  // --- 表面 ---
  $('#fc-thai').textContent      = card.thai    ?? '–';
  $('#fc-reading').textContent   = card.reading ?? '–';
  $('#fc-pos-badge').textContent = card.pos     ?? '';

  // --- 裏面：意味・頻度 ---
  $('#fc-meaning').textContent = card.meaning ?? '–';
  $('#fc-freq').textContent    = card.freq    ?? '';

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
  $('#fc-progress').textContent = `${fcIndex + 1} / ${FLASHCARD_DATA.length}`;

  // --- カードを表面に戻す ---
  const flashcard = $('#flashcard');
  if (flashcard) flashcard.classList.remove('flip');
}

/**
 * フラッシュカード機能の初期化
 */
function initFlashcard() {
  const flashcard = $('#flashcard');
  const prevBtn   = $('#fc-prev-btn');
  const nextBtn   = $('#fc-next-btn');

  // 必要な要素がなければ何もしない
  if (!flashcard || !prevBtn || !nextBtn) return;

  // カードをタップ → 表裏を反転
  flashcard.addEventListener('click', () => {
    flashcard.classList.toggle('flip');
    const isFlipped = flashcard.classList.contains('flip');
    flashcard.setAttribute('aria-pressed', String(isFlipped));
  });

  // キーボード（Space / Enter）でも反転できるようにする
  flashcard.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      flashcard.click();
    }
  });

  // 次へボタン：最後なら最初に戻る
  nextBtn.addEventListener('click', () => {
    fcIndex = (fcIndex + 1) % FLASHCARD_DATA.length;
    renderFlashcard();
  });

  // 前へボタン：最初なら最後へ
  prevBtn.addEventListener('click', () => {
    fcIndex = (fcIndex - 1 + FLASHCARD_DATA.length) % FLASHCARD_DATA.length;
    renderFlashcard();
  });

  // 初期描画
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
}
function judgeAnswer(selectedId) {
  // 解答済みなら無視（連打防止）
  if (quizAnswered) return;
  quizAnswered = true;

  const q         = QUIZ_DATA[quizIndex];
  const isCorrect = (selectedId === q.answer);

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
}
}

/**
 * 「次の問題」ボタンの処理
 */
function goNextQuiz() {
  quizIndex = (quizIndex + 1) % QUIZ_DATA.length;
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
