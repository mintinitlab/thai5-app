/* 
============================================================
   タイ語検定5級 学習アプリ — app.js v2.3.0
   v2.3.0: section-grammar を grammar.json ベースの動的生成へ変更
           - GRAMMAR_DATA 追加
           - renderGrammar() 実装
           - initGrammarFilter() 実装
============================================================ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const LS_KEY          = 'thai5_fc_state';
const LS_PROGRESS_KEY = 'thai5_progress';
const LS_SESSION_KEY  = 'thai5_fc_session';

const POS_LABEL = {
  verb: '動詞', aux: '助動詞', prep: '前置詞', conj: '接続詞',
  adj: '形容詞', adv: '副詞', neg: '否定', q: '疑問詞', cl: '類別詞', n: '名詞',
};
const IMP_LABEL    = { 3: '★★★', 2: '★★', 1: '★' };
const STATUS_LABEL = { new: '未学習', again: '要復習', known: '習得済' };

/* ---------- 文法カテゴリ定義 ---------- */
const GRAMMAR_LABEL = {
  question: '疑問文',
  negative:  '否定文',
  aux:       '助動詞',
  compare:   '比較',
  prep:      '前置詞・位置',
  time:      '時間',
  quantity:  '数量・類別詞',
  phrase:    '会話定型文',
};

/* カテゴリ → badge クラス のマッピング */
const GRAMMAR_BADGE_CLASS = {
  question: 'badge-aux',    /* 青系 */
  negative:  'badge-neg',   /* 赤系 */
  aux:       'badge-aux',   /* 紫系（デフォルト） */
  compare:   'badge-cmp',   /* 橙系 */
  prep:      'badge-prep',  /* 緑系 */
  time:      'badge-time',  /* 紫系 */
  quantity:  'badge-cmp',   /* 橙系 */
  phrase:    'badge-prep',  /* 緑系 */
};

/* ---------- データ ---------- */
let VOCAB_DATA   = [];
let QUIZ_DATA    = [];
let GRAMMAR_DATA = [];

/* ---------- フラッシュカード状態 ---------- */
let FC_STATE  = {};
let fc_active = [];
let fcIndex   = 0;

let fc_filterPos = 'all';
let fc_filterImp = 'all';
let fc_showKnown = false;

/* ---------- 音声再生ロック管理（Chrome 対策） ---------- */
let speechUnlocked = false;

/* ---------- タイ語 voice キャッシュ ---------- */
let thaiVoice = null;

function loadThaiVoice() {
  const voices = speechSynthesis.getVoices();
  thaiVoice = voices.find(v => v.lang === 'th-TH') ?? null;
}
if (typeof speechSynthesis !== 'undefined') {
  loadThaiVoice();
  speechSynthesis.onvoiceschanged = loadThaiVoice;
}

/* ---------- LocalStorage: カード状態 ---------- */
function loadState()  {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch { return {}; }
}
function saveState()  {
  try { localStorage.setItem(LS_KEY, JSON.stringify(FC_STATE)); }
  catch { console.warn('LocalStorage 書き込み失敗'); }
}
function saveSession() {
  try {
    localStorage.setItem(LS_SESSION_KEY, JSON.stringify({
      fcIndex,
      fc_filterPos,
      fc_filterImp,
      fc_showKnown,
      limit: $('#fc-question-limit')?.value ?? 'all'
    }));
  } catch {
    console.warn('session 書き込み失敗');
  }
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(LS_SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function getStatus(id) { return FC_STATE[id] ?? 'new'; }

/* ---------- 進捗データ管理 ---------- */
function getDefaultProgress() {
  return { totalAnswered: 0, totalCorrect: 0, todayCards: [], todayDate: '' };
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(LS_PROGRESS_KEY) || 'null') || getDefaultProgress();
  } catch {
    return getDefaultProgress();
  }
}

function saveProgress(p) {
  try { localStorage.setItem(LS_PROGRESS_KEY, JSON.stringify(p)); }
  catch { console.warn('progress 書き込み失敗'); }
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function recordCardAnswer(cardId, isCorrect) {
  const p = loadProgress();
  const today = getTodayStr();

  if (p.todayDate !== today) {
    p.todayCards = [];
    p.todayDate  = today;
  }

  const sid = String(cardId);
  if (!p.todayCards.includes(sid)) {
    p.todayCards.push(sid);
  }

  p.totalAnswered++;
  if (isCorrect) p.totalCorrect++;

  saveProgress(p);
  updateDashboard();
}

/* ---------- ダッシュボード更新 ---------- */
function updateDashboard() {
  if (!VOCAB_DATA.length) return;

  const total   = VOCAB_DATA.length;
  const known   = VOCAB_DATA.filter(c => getStatus(c.id) === 'known').length;
  const again   = VOCAB_DATA.filter(c => getStatus(c.id) === 'again').length;
  const studied = known + again;

  const p = loadProgress();
  const today = getTodayStr();
  const todayCount = (p.todayDate === today) ? p.todayCards.length : 0;
  const rate = p.totalAnswered > 0
    ? Math.round(p.totalCorrect / p.totalAnswered * 100)
    : 0;

  const CIRC = 2 * Math.PI * 22;

  const vocabPct = total > 0 ? Math.round(known / total * 100) : 0;
  _updateRing('ring-vocab', 'pct-vocab', 'sub-vocab',
    vocabPct, CIRC, known + ' / ' + total + ' 語');

  _updateRing('ring-quiz', 'pct-quiz', 'sub-quiz',
    rate, CIRC, p.totalCorrect + ' / ' + p.totalAnswered + ' 回答');

  const studiedPct = total > 0 ? Math.round(studied / total * 100) : 0;
  _updateRing('ring-grammar', 'pct-grammar', 'sub-grammar',
    studiedPct, CIRC, studied + ' / ' + total + ' 学習済');

  const todayEl = $('#header-today');
  if (todayEl) todayEl.textContent = todayCount;
}

function _updateRing(ringId, pctId, subId, pct, circ, subText) {
  const ringEl = document.getElementById(ringId);
  const pctEl  = document.getElementById(pctId);
  const subEl  = document.getElementById(subId);
  if (ringEl) ringEl.style.strokeDashoffset = circ * (1 - pct / 100);
  if (pctEl)  pctEl.textContent = pct + '%';
  if (subEl)  subEl.textContent = subText;
}

/* ============================================================
   音声再生
   ============================================================ */
function playCardAudio() {
  const c = fc_active[fcIndex];
  if (!c) return;
  if (c.audioUrl) {
    const audio = new Audio(c.audioUrl);
    audio.play().catch((err) => { console.warn('[audio] play() failed:', err); });
    return;
  }
  if (!c.thai) return;
  playPronunciation(c.thai);
}

function playPronunciation(word) {
  speechSynthesis.cancel();
  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'th-TH';
    if (thaiVoice) utterance.voice = thaiVoice;
    utterance.onerror = (e) => { console.warn('[speechSynthesis] utterance error:', e.error, word); };
    speechSynthesis.speak(utterance);
  }, 120);
}

function unlockSpeech() {
  if (speechUnlocked) return;
  speechSynthesis.cancel();
  const silent = new SpeechSynthesisUtterance(' ');
  silent.volume = 0;
  silent.onerror = () => {};
  speechSynthesis.speak(silent);
  speechUnlocked = true;
}

/* ---------- setStatus ---------- */
function setStatus(id, s) {
  FC_STATE[id] = s;
  saveState();
  if (s === 'known' || s === 'again') {
    recordCardAnswer(id, s === 'known');
  }
}

/* ---------- 出題リスト構築 ---------- */
function buildActive() {
  const filtered = VOCAB_DATA.filter((c) => {
    if (fc_filterPos !== 'all' && c.pos !== fc_filterPos) return false;
    if (fc_filterImp !== 'all' && (c.importance ?? 1) < parseInt(fc_filterImp)) return false;
    return true;
  });

  const again    = filtered.filter((c) => getStatus(c.id) === 'again');
  const newCards = filtered.filter((c) => getStatus(c.id) === 'new');
  const known    = filtered.filter((c) => getStatus(c.id) === 'known');

  let active = fc_showKnown
    ? [...again, ...newCards, ...known]
    : [...again, ...newCards];

  const limitVal = $('#fc-question-limit')?.value ?? 'all';
  if (limitVal !== 'all') {
    const limit = parseInt(limitVal, 10);
    if (!isNaN(limit)) active = active.slice(0, limit);
  }

  fc_active = active;

  if (fcIndex >= fc_active.length) fcIndex = 0;

  const el = $('#fc-count-info');
  if (el) {
    el.textContent =
      `出題: ${fc_active.length}語 ／ 要復習: ${again.length} ／ 未学習: ${newCards.length} ／ 習得済: ${known.length}`;
  }
}

/* ---------- フラッシュカード描画 ---------- */
function renderFC() {
  const cardEl   = $('#flashcard');
  const emptyEl  = $('#fc-empty');
  const navEl    = $('.card-nav');
  const actionEl = $('.fc-action-row');

  if (fc_active.length === 0) {
    const allCards = VOCAB_DATA.filter((c) => {
      if (fc_filterPos !== 'all' && c.pos !== fc_filterPos) return false;
      if (fc_filterImp !== 'all' && (c.importance ?? 1) < parseInt(fc_filterImp)) return false;
      return true;
    });
    const allKnown = allCards.length > 0 && allCards.every((c) => getStatus(c.id) === 'known');

    if (emptyEl) {
      if (allKnown) {
        emptyEl.innerHTML = `
          <div class="fc-empty__icon" aria-hidden="true">🎉</div>
          <p class="fc-empty__title">学習完了！</p>
          <p class="fc-empty__sub">このセットのカードをすべて習得しました</p>
          <button id="fc-restart-btn" type="button" style="margin-top:16px;padding:10px 28px;background:var(--red);color:#fff;border:none;border-radius:var(--r-md);font-size:var(--fs-sm);font-weight:600;cursor:pointer;">もう一度学習</button>
        `;
        emptyEl.hidden = false;
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
      } else {
        emptyEl.innerHTML = `
          <div class="fc-empty__icon" aria-hidden="true">📭</div>
          <p class="fc-empty__title">対象カードがありません</p>
          <p class="fc-empty__sub">フィルターを変更するか「習得済みも表示」をオンにしてください</p>
        `;
        emptyEl.hidden = false;
      }
    }

    if (cardEl)   cardEl.hidden   = true;
    if (navEl)    navEl.hidden    = true;
    if (actionEl) actionEl.hidden = true;
    const prog = $('#fc-progress');
    if (prog) prog.textContent = '0 / 0';
    return;
  }

  if (emptyEl)  emptyEl.hidden  = true;
  if (cardEl)   cardEl.hidden   = false;
  if (navEl)    navEl.hidden    = false;
  if (actionEl) actionEl.hidden = false;

  const c  = fc_active[fcIndex];
  const st = getStatus(c.id);

  const posEl = $('#fc-pos-badge');
  if (posEl) { posEl.textContent = POS_LABEL[c.pos] ?? c.pos ?? ''; posEl.dataset.pos = c.pos ?? ''; }

  const pronounceBtn = $('#fc-pronounce-btn');
  if (pronounceBtn) {
    pronounceBtn.onclick = (e) => { e.stopPropagation(); playPronunciation(c.thai ?? ''); };
  }

  const impEl = $('#fc-importance');
  if (impEl) { impEl.textContent = IMP_LABEL[c.importance] ?? ''; impEl.dataset.importance = c.importance ?? 1; }

  const stEl = $('#fc-status-badge');
  if (stEl) { stEl.textContent = STATUS_LABEL[st]; stEl.dataset.status = st; stEl.hidden = st === 'new'; }

  const thaiEl = $('#fc-thai');
  if (thaiEl) thaiEl.textContent = c.thai ?? '–';

  const readEl = $('#fc-reading');
  if (readEl) readEl.textContent = c.reading ?? '–';

  const meanEl = $('#fc-meaning');
  if (meanEl) meanEl.textContent = c.meaning ?? '–';

  const freqEl = $('#fc-freq');
  if (freqEl) freqEl.textContent = c.frequency ? `出現 ${c.frequency}回` : '';

  const exEl = $('#fc-example');
  if (exEl) { exEl.textContent = c.example ?? ''; exEl.hidden = !c.example; }

  const exREl = $('#fc-example-reading');
  if (exREl) { exREl.textContent = c.example_reading ?? ''; exREl.hidden = !c.example_reading; }

  const exMEl = $('#fc-example-meaning');
  if (exMEl) { exMEl.textContent = c.example_meaning ? `（${c.example_meaning}）` : ''; exMEl.hidden = !c.example_meaning; }

  const examplePronounceBtn = $('#fc-example-pronounce-btn');
  if (examplePronounceBtn) {
    examplePronounceBtn.onclick = (e) => { e.stopPropagation(); playPronunciation(c.example ?? ''); };
  }

  const prog = $('#fc-progress');
  if (prog) prog.textContent = `${fcIndex + 1} / ${fc_active.length}`;

  if (cardEl) {
    cardEl.classList.remove('flip');
    cardEl.setAttribute('aria-pressed', 'false');
  }

  const okBtn = $('#fc-ok-btn');
  if (okBtn) okBtn.textContent = st === 'known' ? '習得済 ✓' : '覚えた ✓';

  saveSession();

  if (speechUnlocked) {
    requestAnimationFrame(() => { playCardAudio(); });
  }
}

/* ---------- カード移動 ---------- */
function moveFC(dir) {
  const cardEl = $('#flashcard');
  if (!cardEl) return;

  if (fc_active.length === 0) { renderFC(); return; }

  cardEl.style.visibility = 'hidden';
  cardEl.classList.remove('flip');

  fcIndex = dir === 'next'
    ? (fcIndex + 1) % fc_active.length
    : (fcIndex - 1 + fc_active.length) % fc_active.length;

  buildActive();

  if (fc_active.length === 0) {
    fcIndex = 0;
    renderFC();
    cardEl.style.visibility = 'visible';
    return;
  }

  if (fcIndex >= fc_active.length) fcIndex = fc_active.length - 1;

  renderFC();
  requestAnimationFrame(() => { cardEl.style.visibility = 'visible'; });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- フラッシュカード初期化 ---------- */
function initFlashcard() {
  const cardEl = $('#flashcard');
  if (!cardEl) return;

  const unlockHandler = () => { unlockSpeech(); };
  cardEl.addEventListener('click', unlockHandler);
  cardEl.addEventListener('keydown', unlockHandler);

  cardEl.addEventListener('click', () => {
    cardEl.classList.toggle('flip');
    cardEl.setAttribute('aria-pressed', String(cardEl.classList.contains('flip')));
  });
  cardEl.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cardEl.click(); }
  });

  $('#fc-next-btn')?.addEventListener('click', () => moveFC('next'));
  $('#fc-prev-btn')?.addEventListener('click', () => moveFC('prev'));

  $('#fc-ok-btn')?.addEventListener('click', () => {
    const c = fc_active[fcIndex];
    if (!c) return;
    setStatus(c.id, 'known');
    buildActive();
    if (fcIndex >= fc_active.length) fcIndex = Math.max(0, fc_active.length - 1);
    moveFC('next');
  });

  $('#fc-again-btn')?.addEventListener('click', () => {
    const c = fc_active[fcIndex];
    if (!c) return;
    setStatus(c.id, 'again');
    buildActive();
    moveFC('next');
  });

  $('#fc-filter-pos')?.addEventListener('change', (e) => {
    fc_filterPos = e.target.value; fcIndex = 0; buildActive(); renderFC();
  });
  $('#fc-filter-importance')?.addEventListener('change', (e) => {
    fc_filterImp = e.target.value; fcIndex = 0; buildActive(); renderFC();
  });
  $('#fc-show-known')?.addEventListener('change', (e) => {
    fc_showKnown = e.target.checked; fcIndex = 0; buildActive(); renderFC();
  });

  $('#fc-shuffle-btn')?.addEventListener('click', () => {
    fc_active = [
      ...shuffle(fc_active.filter((c) => getStatus(c.id) === 'again')),
      ...shuffle(fc_active.filter((c) => getStatus(c.id) === 'new')),
      ...shuffle(fc_active.filter((c) => getStatus(c.id) === 'known')),
    ];
    fcIndex = 0;
    renderFC();
  });

  $('#fc-reset-btn')?.addEventListener('click', () => {
    if (!confirm('学習状態をすべてリセットしますか？')) return;
    FC_STATE = {}; saveState(); fcIndex = 0; buildActive(); renderFC();
    saveProgress(getDefaultProgress());
    updateDashboard();
  });

  const limitSelect = $('#fc-question-limit');
  if (limitSelect) {
    limitSelect.addEventListener('change', () => { fcIndex = 0; buildActive(); renderFC(); });
  }

  $('#play-audio-btn')?.addEventListener('click', (e) => {
    e.stopPropagation(); unlockSpeech(); playCardAudio();
  });

  const session = loadSession();
  if (session) {
    fcIndex       = session.fcIndex ?? 0;
    fc_filterPos  = session.fc_filterPos ?? 'all';
    fc_filterImp  = session.fc_filterImp ?? 'all';
    fc_showKnown  = session.fc_showKnown ?? false;
    $('#fc-filter-pos').value        = fc_filterPos;
    $('#fc-filter-importance').value = fc_filterImp;
    $('#fc-show-known').checked      = fc_showKnown;
    const limitSelect = $('#fc-question-limit');
    if (limitSelect && session.limit) limitSelect.value = session.limit;
  }

  buildActive();
  renderFC();
}

/* ============================================================
   文法カード 動的レンダリング
   ============================================================ */

/**
 * 重要度に応じたスター文字列を返す
 */
function impToStars(imp) {
  return IMP_LABEL[imp] ?? '';
}

/**
 * GRAMMAR_DATA をフィルタリングして #grammar-list へカードを生成する
 * @param {string} cat - カテゴリ文字列（'all' なら全件）
 */
function renderGrammar(cat = 'all') {
  const listEl = document.getElementById('grammar-list');
  if (!listEl) return;

  // GRAMMAR_DATA が空でもエラーにしない
  const items = (GRAMMAR_DATA.length === 0)
    ? []
    : (cat === 'all' ? GRAMMAR_DATA : GRAMMAR_DATA.filter(g => g.category === cat));

  // リストをクリア
  listEl.innerHTML = '';

  if (items.length === 0) {
    listEl.innerHTML = `
      <li style="padding:2rem;text-align:center;color:var(--text-3);font-size:var(--fs-sm);">
        ${GRAMMAR_DATA.length === 0 ? '文法データを読み込み中...' : 'このカテゴリの項目はありません'}
      </li>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  items.forEach((g) => {
    const catLabel   = GRAMMAR_LABEL[g.category] ?? g.category ?? '';
    const badgeClass = GRAMMAR_BADGE_CLASS[g.category] ?? 'badge-aux';
    const stars      = impToStars(g.importance ?? 1);
    const freq       = g.frequency ? `${g.frequency}回` : '';

    // 例文系（空でも崩れないように）
    const hasThai    = g.example_thai    && g.example_thai.trim();
    const hasReading = g.example_reading && g.example_reading.trim();
    const hasJp      = g.example_jp      && g.example_jp.trim();
    const hasWarn    = g.warn            && g.warn.trim();

    const exampleHTML = (hasThai || hasReading || hasJp) ? `
      <div class="grammar-example" lang="th">
        ${hasThai    ? `<span class="grammar-example-thai">${escHtml(g.example_thai)}</span>` : ''}
        ${hasReading ? `<br><span style="font-size:var(--fs-xs);color:var(--text-3);">${escHtml(g.example_reading)}</span>` : ''}
        ${hasJp      ? `<br><span style="font-size:var(--fs-xs);color:var(--text-2);">（${escHtml(g.example_jp)}）</span>` : ''}
      </div>` : '';

    const warnHTML = hasWarn
      ? `<div class="grammar-warn">⚠ ${escHtml(g.warn)}</div>`
      : '';

    const li = document.createElement('li');
    li.className = 'grammar-card';
    li.dataset.cat  = g.category ?? '';
    li.dataset.rank = g.importance ?? 1;

    li.innerHTML = `
      <div class="grammar-card-header">
        <span class="grammar-badge ${badgeClass}">${escHtml(catLabel)}</span>
        <span class="grammar-rank">${escHtml(stars)}</span>
        ${freq ? `<span class="grammar-freq">${escHtml(freq)}</span>` : ''}
      </div>
      <div class="grammar-title">${escHtml(g.title ?? '')}</div>
      <div class="grammar-formula">
        <code>${escHtml(g.pattern ?? '')}</code>
      </div>
      <div class="grammar-desc">${escHtml(g.meaning ?? '')}</div>
      ${exampleHTML}
      ${warnHTML}
    `;

    fragment.appendChild(li);
  });

  listEl.appendChild(fragment);
}

/**
 * HTML エスケープユーティリティ
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * #grammar-cat-nav の内部タブでカテゴリフィルタを有効化する
 */
function initGrammarFilter() {
  const nav = document.getElementById('grammar-cat-nav');
  if (!nav) return;

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.inner-tab-btn');
    if (!btn) return;

    // アクティブ切り替え
    nav.querySelectorAll('.inner-tab-btn').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');

    // フィルタ適用
    const cat = btn.dataset.cat ?? 'all';
    renderGrammar(cat);
  });
}

/* ============================================================
   クイズ
   ============================================================ */
let quizIndex    = 0;
let quizAnswered = false;
let correctCount  = 0;
let answeredCount = 0;

function renderQuiz() {
  const q = QUIZ_DATA[quizIndex];
  if (!q) return;

  const jpEl  = $('#quiz-question-jp');      if (jpEl)  jpEl.textContent  = q.question_jp      ?? '';
  const thEl  = $('#quiz-question-thai');    if (thEl)  thEl.textContent  = q.question_thai    ?? '';
  const rdEl  = $('#quiz-question-reading'); if (rdEl)  rdEl.textContent  = q.question_reading ?? '';

  const btns = $$('.choice-btn');
  q.choices.forEach((ch, i) => {
    const tEl = $(`#choice-${i}`);
    if (tEl) tEl.textContent = ch.thai ? `${ch.thai}　${ch.reading}` : ch.reading;
    const btn = btns[i];
    if (btn) {
      btn.dataset.choiceId = ch.id ?? String.fromCharCode(65 + i);
      btn.disabled         = false;
      btn.style.cssText    = '';
    }
  });

  const expl = $('#quiz-explanation'); if (expl) expl.hidden = true;
  const res  = $('#quiz-result');      if (res)  res.hidden  = true;
  quizAnswered = false;

  const cur = $('#quiz-current'); if (cur) cur.textContent = quizIndex + 1;
  const tot = $('#quiz-total');   if (tot) tot.textContent = QUIZ_DATA.length;
}

function judgeAnswer(id) {
  if (quizAnswered) return;
  quizAnswered = true;
  const q  = QUIZ_DATA[quizIndex];
  const ok = id === q.answer;
  answeredCount++; if (ok) correctCount++;

  q.choices.forEach((ch, i) => {
    const tEl = $(`#choice-${i}`);
    if (tEl) tEl.textContent = `${ch.thai ?? ''}　${ch.reading ?? ''}　${ch.meaning ?? ''}`;
  });

  $$('.choice-btn').forEach((btn) => {
    const bid = btn.dataset.choiceId;
    if (bid === q.answer) {
      btn.style.background = 'var(--green-bg)';
      btn.style.borderColor = 'var(--green)';
      btn.style.color = 'var(--green)';
    } else if (bid === id && !ok) {
      btn.style.background = 'var(--red-bg)';
      btn.style.borderColor = 'var(--red)';
      btn.style.color = 'var(--red)';
    }
    btn.disabled = true;
  });

  const expl = $('#quiz-explanation');
  if (expl) {
    expl.hidden = false;
    const rEl = $('#explanation-result');
    if (rEl) { rEl.textContent = ok ? '✅ 正解！' : '❌ 不正解'; rEl.style.color = ok ? 'var(--green)' : 'var(--red)'; }
    const tEl = $('#explanation-text');
    if (tEl) tEl.textContent = q.explanation ?? '';
  }
}

function goNextQuiz() {
  if (quizIndex >= QUIZ_DATA.length - 1) { showQuizResult(); return; }
  quizIndex++;
  renderQuiz();
}

function showQuizResult() {
  const rate = answeredCount ? Math.round(correctCount / answeredCount * 100) : 0;
  const qc = $('#quiz-card'); if (qc) qc.hidden = true;
  const res = $('#quiz-result'); if (res) res.hidden = false;
  const sc = $('#result-score');
  if (sc) sc.innerHTML = `${correctCount} / ${answeredCount}問 正解<br>正答率 ${rate}%`;
  const mg = $('#result-msg');
  if (mg) mg.textContent =
    rate === 100 ? '全問正解！' : rate >= 80 ? 'かなり理解できています' :
    rate >= 60 ? 'あと少しです' : 'もう一度復習しましょう';
}

function restartQuiz() {
  quizIndex = 0; correctCount = 0; answeredCount = 0; quizAnswered = false;
  const res = $('#quiz-result'); if (res) res.hidden = true;
  const qc  = $('#quiz-card');   if (qc)  qc.hidden  = false;
  renderQuiz();
}

function initQuiz() {
  if (!$('#quiz-next-btn')) return;
  $$('.choice-btn').forEach((btn) => btn.addEventListener('click', () => judgeAnswer(btn.dataset.choiceId)));
  $('#quiz-next-btn')?.addEventListener('click', goNextQuiz);
  $('#quiz-retry-btn')?.addEventListener('click', restartQuiz);
  renderQuiz();
}

/* ============================================================
   キーボード操作
   ============================================================ */
function handleFlashcardKeydown(e) {
  if (e.repeat) return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)) return;
  const fcSection = $('#section-flashcard');
  if (!fcSection || fcSection.hidden) return;
  switch (e.key) {
    case 'ArrowRight': unlockSpeech(); $('#fc-ok-btn')?.click();    break;
    case 'ArrowLeft':  unlockSpeech(); $('#fc-again-btn')?.click(); break;
    case ' ':          e.preventDefault(); unlockSpeech(); $('#flashcard')?.click(); break;
  }
}

/* ============================================================
   タブ
   ============================================================ */
function switchTab(name) {
  $$('.tab-btn').forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
  $$('.tab-section').forEach((s) => { s.hidden = true; });
  const btn = $(`[data-tab="${name}"]`);
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
  const sid = btn?.getAttribute('aria-controls');
  if (sid) { const sec = $(`#${sid}`); if (sec) sec.hidden = false; }
}

function initTabs() {
  $('#tab-nav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn?.dataset.tab) switchTab(btn.dataset.tab);
  });
}

/* ============================================================
   データ読み込み & 初期化
   ============================================================ */
async function loadDataAndInit() {
  try {
    const [vRes, qRes, gRes] = await Promise.all([
      fetch('./data/vocab.json'),
      fetch('./data/questions_vocab_all.json'),
      fetch('./data/grammar.json'),
    ]);

    if (!vRes.ok) throw new Error(`vocab.json: ${vRes.status}`);
    if (!qRes.ok) throw new Error(`questions_vocab_all.json: ${qRes.status}`);
    // grammar.json は取得失敗しても致命的エラーにしない
    if (!gRes.ok) {
      console.warn(`grammar.json: ${gRes.status} — 文法データなしで続行`);
      GRAMMAR_DATA = [];
    } else {
      GRAMMAR_DATA = await gRes.json();
    }

    VOCAB_DATA = await vRes.json();
    QUIZ_DATA  = await qRes.json();
    FC_STATE   = loadState();

    initFlashcard();
    initQuiz();
    renderGrammar();      // 文法カード初期描画（全件）
    initGrammarFilter();  // カテゴリフィルタ初期化
    updateDashboard();
  } catch (err) {
    console.error(err);
    alert('データ読み込みに失敗しました。ページを再読み込みしてください。');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  switchTab('dashboard');
  loadDataAndInit();
  document.addEventListener('keydown', handleFlashcardKeydown);
});
ENDJS
