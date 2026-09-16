// ===================== Data & storage =====================
// Data files (data/*.js) are loaded via plain <script> tags in index.html,
// before this file, and each sets a window.QURRA_* global. This avoids any
// fetch()/CORS complexity and works identically on file://, GitHub Pages
// at the domain root, or GitHub Pages under a repository subpath - relative
// script paths resolve correctly in all three with no code changes needed.
const DATA = window.QURRA_DATA;
const JUZ15_CONFUSIONS = window.QURRA_JUZ15;
const JUZ610_CONFUSIONS = window.QURRA_JUZ610;
const JUZ1115_CONFUSIONS = window.QURRA_JUZ1115;
const JUZ1620_CONFUSIONS = window.QURRA_JUZ1620;
const JUZ2125_CONFUSIONS = window.QURRA_JUZ2125;
const JUZ2630_CONFUSIONS = window.QURRA_JUZ2630;
const FULL_CONFUSIONS = window.QURRA_FULL;
// Ranges with a curated, hand-verified confusion-point dataset use the
// confusion-focused engine below; any range not in this map falls back to
// the generic "which surah is this" engine further down. Full 1-30 is a
// deduplicated union of the six Juz-range pools (see build notes) - it is
// NOT the old generic engine.
const CURATED_CONFUSIONS = { '1-5': JUZ15_CONFUSIONS, '6-10': JUZ610_CONFUSIONS, '11-15': JUZ1115_CONFUSIONS, '16-20': JUZ1620_CONFUSIONS, '21-25': JUZ2125_CONFUSIONS, '26-30': JUZ2630_CONFUSIONS, '1-30': FULL_CONFUSIONS };
const STORAGE_KEY = 'qurra_mutasyabihat_progress_v1';

const RANGES = [
  {key:'1-5', label:'Juz 1 – 5', min:1, max:5},
  {key:'6-10', label:'Juz 6 – 10', min:6, max:10},
  {key:'11-15', label:'Juz 11 – 15', min:11, max:15},
  {key:'16-20', label:'Juz 16 – 20', min:16, max:20},
  {key:'21-25', label:'Juz 21 – 25', min:21, max:25},
  {key:'26-30', label:'Juz 26 – 30', min:26, max:30},
];
const FULL_RANGE = {key:'1-30', label:'Juz 1 – 30', min:1, max:30, full:true};

function defaultProgress(){
  return { schema_version:1, stats:{attempted:0, correct:0}, by_range:{}, weak_items:{} };
}
function loadProgress(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultProgress();
    const p = JSON.parse(raw);
    if(!p || p.schema_version!==1) return defaultProgress();
    p.stats = p.stats || {attempted:0,correct:0};
    p.by_range = p.by_range || {};
    p.weak_items = p.weak_items || {};
    return p;
  }catch(e){ return defaultProgress(); }
}
function saveProgress(p){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }catch(e){ /* best effort */ }
}
let PROGRESS = loadProgress();

// ===================== Helpers =====================
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function sample(arr,n){ return shuffle(arr).slice(0,n); }
function poolForRange(range){ return DATA.filter(r=>r.juz>=range.min && r.juz<=range.max); }
function groupsForRange(range){
  const pool = poolForRange(range);
  const byGroup = {};
  pool.forEach(r=>{ (byGroup[r.source_entry_id]=byGroup[r.source_entry_id]||[]).push(r); });
  return byGroup;
}
function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===================== Question generation =====================
function pickType(siblingCount, arabicWordCount){
  const types = [];
  types.push('A');
  if(siblingCount>=1) types.push('B');
  if(arabicWordCount>=9) types.push('C');
  return types[Math.floor(Math.random()*types.length)];
}

// Some ayahs are, by genuine Quranic design, worded identically across two surahs
// (e.g. Al-Hashr 1 and As-Saf 1). Type B can't fairly ask "which text is which" when
// the two texts are literally identical, so this filters for a usable sibling first.
function siblingsWithDistinctText(target, siblings){
  return siblings.filter(s=>s.arabic!==target.arabic);
}

function buildQuiz(range, length){
  if(CURATED_CONFUSIONS[range.key]) return buildConfusionQuiz(CURATED_CONFUSIONS[range.key], length);
  const byGroup = groupsForRange(range);
  const groupIds = shuffle(Object.keys(byGroup));
  const n = Math.min(length, groupIds.length);
  const chosen = groupIds.slice(0,n);
  const fullPool = poolForRange(range);
  const questions = [];
  chosen.forEach(gid=>{
    const occs = byGroup[gid];
    const target = occs[Math.floor(Math.random()*occs.length)];
    const siblings = occs.filter(o=>o.id!==target.id);
    const wordCount = target.arabic.split(/\s+/).filter(Boolean).length;
    const usableSiblingCount = siblingsWithDistinctText(target, siblings).length;
    const type = pickType(usableSiblingCount, wordCount);
    const q = generateQuestion(type, target, siblings, fullPool, gid);
    if(q) questions.push(q);
  });
  return questions;
}

function refLabel(r){ return r.surah + ' ' + r.ayah; }

function generateQuestion(type, target, siblings, fullPool, groupId){
  if(type==='A'){
    const usedLabels = new Set([refLabel(target)]);
    const distractors = [];
    // prefer real siblings first, deduped by label (two different groups can legitimately share a Surah+Ayah)
    shuffle(siblings).forEach(s=>{
      if(distractors.length>=3) return;
      const lbl = refLabel(s);
      if(usedLabels.has(lbl)) return;
      usedLabels.add(lbl); distractors.push(s);
    });
    if(distractors.length < 3){
      const fillers = shuffle(fullPool.filter(r=>r.source_entry_id!==groupId && r.id!==target.id));
      for(const f of fillers){
        if(distractors.length>=3) break;
        const lbl = refLabel(f);
        if(usedLabels.has(lbl)) continue;
        usedLabels.add(lbl); distractors.push(f);
      }
    }
    const options = shuffle([target, ...distractors]).map(o=>({label:refLabel(o), isCorrect:o.id===target.id}));
    return {
      type:'A', groupId, target,
      prompt:'Ayat di atas juga terdapat dalam surah yang mana?',
      arabic: target.arabic,
      options
    };
  }
  if(type==='B'){
    const usable = siblingsWithDistinctText(target, siblings);
    if(usable.length===0){
      return generateQuestion('A', target, siblings, fullPool, groupId);
    }
    const other = usable[Math.floor(Math.random()*usable.length)];
    const askAbout = Math.random()<0.5 ? target : other;
    const pair = shuffle([
      {ref:target, text:target.arabic, isTarget:true},
      {ref:other, text:other.arabic, isTarget:false},
    ]);
    const correctIdx = pair.findIndex(p=> p.ref.id===askAbout.id);
    return {
      type:'B', groupId, target,
      prompt:'Manakala satu daripada berikut betul bagi Surah ' + askAbout.surah + '?',
      pair,
      correctIdx
    };
  }
  // type C
  const words = target.arabic.split(/\s+/).filter(Boolean);
  const tailLen = Math.min(4, Math.max(2, Math.floor(words.length*0.28)));
  const stem = words.slice(0, words.length-tailLen).join(' ');
  const correctTail = words.slice(words.length-tailLen).join(' ');
  let tailPool = siblings.map(s=>{
    const w = s.arabic.split(/\s+/).filter(Boolean);
    return w.slice(Math.max(0,w.length-tailLen)).join(' ');
  }).filter(t=>t && t!==correctTail);
  if(tailPool.length < 3){
    const fillers = fullPool.filter(r=>r.source_entry_id!==groupId && r.id!==target.id);
    const extra = sample(fillers, 6).map(f=>{
      const w = f.arabic.split(/\s+/).filter(Boolean);
      return w.slice(Math.max(0,w.length-tailLen)).join(' ');
    }).filter(t=>t && t!==correctTail && !tailPool.includes(t));
    tailPool = tailPool.concat(extra);
  }
  tailPool = sample([...new Set(tailPool)], Math.min(3, tailPool.length));
  const options = shuffle([{text:correctTail,isCorrect:true}, ...tailPool.map(t=>({text:t,isCorrect:false}))]);
  return {
    type:'C', groupId, target,
    prompt:'Pilih sambungan yang betul bagi ayat ini.',
    stem, correctTail,
    options
  };
}

// ===================== Confusion-focused engine (Juz 1-5, Juz 6-10) =====================
// Built from a real word-level analysis of every Mutasyabihat group touching
// the given Juz range. Each entry already has: the underlying ayah-set
// deduplicated, a genuine shared anchor phrase (or a near-miss word) verified
// against the actual Quran text, and a question_type picked from where the
// anchor actually sits (not assigned randomly).

function confusionSignature(c){
  return c.target.surah + ' ' + c.target.ayah + ' \u2194 ' + c.sibling.surah + ' ' + c.sibling.ayah;
}

function confusionDifficulty(c){
  if(c.question_type==='fine_distinction') return 0.35 + c.similarity_ratio*0.65; // subtler difference = harder
  if(c.question_type==='before_after') return 0.55;
  if(c.question_type==='similar_ending') return 0.45;
  if(c.question_type==='similar_opening') return 0.5;
  return 0.35; // continuation
}

function buildConfusionQuiz(confusionPool, length){
  const pool = confusionPool.slice();
  const n = Math.min(length, pool.length);
  const scored = shuffle(pool).sort((a,b)=>confusionDifficulty(a)-confusionDifficulty(b));
  // split into three difficulty terciles and sample proportionally, so a
  // session opens easier and closes harder rather than being pure random
  const third = Math.ceil(scored.length/3);
  const tiers = [scored.slice(0,third), scored.slice(third,third*2), scored.slice(third*2)];
  const perTier = Math.ceil(n/3);
  let chosen = [];
  const usedSignatures = new Set();
  tiers.forEach(tier=>{
    let added = 0;
    for(const c of shuffle(tier)){
      if(added>=perTier) break;
      const sig = confusionSignature(c);
      // two different underlying groups can, after picking their own best-matching
      // sibling, land on the exact same displayed ayah pair (confirmed in the real
      // data: M009/M056, M040/M122, M091/M204) - never show that pair twice in one session
      if(usedSignatures.has(sig)) continue;
      usedSignatures.add(sig);
      chosen.push(c);
      added++;
    }
  });
  chosen = shuffle(chosen).slice(0, n);
  chosen.sort((a,b)=>confusionDifficulty(a)-confusionDifficulty(b));
  return chosen.map(generateConfusionQuestion);
}

function generateConfusionQuestion(c){
  const signature = confusionSignature(c);
  const base = {
    curated:true, groupId:c.group_id, signature,
    target:c.target, sibling:c.sibling, explanation:c.explanation_my, anchorText:c.anchor_text,
  };
  if(c.question_type==='fine_distinction' || c.question_type==='before_after'){
    const askAbout = Math.random()<0.5 ? {ref:c.target, text:c.target.arabic, isTarget:true} : {ref:c.sibling, text:c.sibling.arabic, isTarget:false};
    const pair = shuffle([
      {ref:c.target, text:c.target.arabic, isTarget:true},
      {ref:c.sibling, text:c.sibling.arabic, isTarget:false},
    ]);
    const correctIdx = pair.findIndex(p=>p.ref===askAbout.ref);
    const prompt = c.question_type==='fine_distinction'
      ? `Kedua-dua ayat berikut sangat mirip. Yang manakah betul bagi Surah ${askAbout.ref.surah} ayat ${askAbout.ref.ayah}?`
      : `Frasa "${c.anchor_text}" muncul dalam kedua-dua ayat berikut, dalam konteks berbeza. Yang manakah betul bagi Surah ${askAbout.ref.surah} ayat ${askAbout.ref.ayah}?`;
    return Object.assign(base, {type:'J-COMPARE', variant:c.question_type, prompt, pair, correctIdx});
  }
  // continuation / similar_ending / similar_opening -> shared context, choose the real differing part
  const prompt = c.question_type==='continuation' ? 'Pilih sambungan yang betul bagi ayat ini.'
               : c.question_type==='similar_opening' ? 'Pilih permulaan yang betul bagi ayat ini.'
               : 'Pilih pengakhiran yang betul bagi ayat ini.';
  const options = shuffle([
    {text:c.correct_tail, isCorrect:true},
    {text:c.sibling_tail, isCorrect:false},
  ]);
  return Object.assign(base, {type:'J-STEM', variant:c.question_type, prompt, stem:c.stem, blankFirst:c.question_type==='similar_opening', options});
}


let STATE = {
  screen:'home',
  currentRange:null,
  quiz:null, // {range, length, questions, index, answers:[{questionIdx, correct}], selected}
};

function go(screen, extra){
  STATE.screen = screen;
  Object.assign(STATE, extra||{});
  render();
  window.scrollTo(0,0);
}

// ===================== Rendering =====================
const app = document.getElementById('app');

function render(){
  app.innerHTML = navHtml() + '<main>' + screenHtml() + '</main>' + footerHtml();
  bindEvents();
}

function navHtml(){
  const items = [
    {key:'home', label:'Utama'},
    {key:'challenge', label:'Cabaran'},
    {key:'progress', label:'Kemajuan'},
  ];
  const active = (STATE.screen==='summary') ? 'home' :
                 (['quiz','feedback','results','length'].includes(STATE.screen)) ? 'challenge' : STATE.screen;
  return `
  <div class="nav">
    <div class="brand"><span class="mark">Q</span> QURRA</div>
    <div class="navlinks">
      ${items.map(it=>`<button data-nav="${it.key}" class="${active===it.key?'active':''}">${it.label}</button>`).join('')}
    </div>
  </div>`;
}

function footerHtml(){
  return `<footer class="page-footer">Hifz Lab · Cabaran Mutasyabihat &mdash; disediakan daripada rujukan yang telah disahkan</footer>`;
}

function screenHtml(){
  switch(STATE.screen){
    case 'home': return homeHtml();
    case 'summary': return summaryHtml();
    case 'challenge': return challengeHtml();
    case 'length': return lengthHtml();
    case 'quiz': return quizHtml();
    case 'feedback': return feedbackHtml();
    case 'results': return resultsHtml();
    case 'progress': return progressHtml();
    default: return homeHtml();
  }
}

// ---------- Home ----------
function homeHtml(){
  return `
  <div class="hero">
    <div class="eyebrow">HIFZ LAB</div>
    <h1>Cabaran Mutasyabihat</h1>
    <p>Uji penguasaan anda dalam ayat-ayat mutasyābihāt. Latih minda, kukuhkan hafalan &mdash; setiap soalan berdasarkan rujukan Al-Quran yang telah disahkan.</p>
    <div style="margin-top:22px;display:flex;gap:12px;flex-wrap:wrap;">
      <button class="btn btn-accent" data-nav="challenge">Mula Cabaran</button>
      <button class="btn btn-secondary" style="border-color:rgba(244,235,216,0.4);color:var(--ivory);" data-nav="summary">Lihat Ringkasan</button>
    </div>
    <div class="hero-quote">&ldquo;إِنَّا نَحْنُ نَزَّلْنَا ٱلذِّكْرَ وَإِنَّا لَهُۥ لَحَٰفِظُونَ&rdquo;<br>&mdash; Surah Al-Hijr, ayat 9</div>
  </div>
  <div class="feature-row">
    <div class="feature-box"><div class="flabel">Kenal Perbezaannya</div><div class="fdesc">Kenali lafaz yang serupa di surah berbeza.</div></div>
    <div class="feature-box"><div class="flabel">Latih Pemahaman</div><div class="fdesc">Jawab soalan berdasarkan ${DATA.length}+ contoh disahkan.</div></div>
    <div class="feature-box"><div class="flabel">Mantapkan Hafalan</div><div class="fdesc">Ulang mengikut julat Juzuk pilihan anda.</div></div>
  </div>`;
}

function summaryHtml(){
  return `
  <button class="back-link" data-nav="home">&larr; Kembali</button>
  <h2>Apa itu Mutasyābihāt Lafẕī?</h2>
  <div class="card">
    <p><em>Mutasyābihāt lafẕī</em> merujuk kepada ayat-ayat Al-Quran yang mempunyai lafaz atau susunan kata yang serupa, tetapi terletak pada surah atau kedudukan yang berbeza &mdash; berbeza daripada mutasyābihāt dari segi makna. Keserupaan ini sering menyebabkan kekeliruan semasa menghafal dan mengulang Al-Quran.</p>
    <p>Nazam <em>Hidāyatul Murtāb</em> karya Imam as-Sakhāwī menghimpunkan lafaz-lafaz sedemikian, disusun mengikut 27 bab berdasarkan huruf hijaiyyah, sebagai bantuan hafalan bagi para huffaz. Ebook <em>Himpunan Ayat-Ayat Mutasyābihāt</em> menterjemahkan nazam ini ke Bahasa Melayu.</p>
    <p>Cabaran ini adalah latihan mengecam &mdash; bukan pengajaran baharu. Setiap soalan dijana daripada perbandingan yang telah disahkan terhadap rujukan Al-Quran yang sah: surah, ayat dan juzuk yang tepat.</p>
  </div>
  <div style="margin-top:20px;">
    <button class="btn btn-primary" data-nav="challenge">Mula Cabaran &rarr;</button>
  </div>`;
}

// ---------- Challenge selection ----------
function rangeStats(range){
  if(CURATED_CONFUSIONS[range.key]){
    const n = CURATED_CONFUSIONS[range.key].length;
    return {occCount:n, groupCount:n, curated:true};
  }
  const pool = poolForRange(range);
  const groups = new Set(pool.map(r=>r.source_entry_id));
  return {occCount:pool.length, groupCount:groups.size};
}
function bestForRange(key){
  const r = PROGRESS.by_range[key];
  if(!r || !r.attempts) return null;
  return r;
}

function challengeHtml(){
  const cards = RANGES.map(r=>{
    const st = rangeStats(r);
    const best = bestForRange(r.key);
    const metaText = st.curated
      ? `${st.groupCount} titik keliruan disahkan`
      : `~${st.occCount} ayat &middot; ${st.groupCount} kumpulan`;
    return `
    <div class="range-card" data-range="${r.key}" tabindex="0" role="button">
      <div class="rtitle">${r.label}</div>
      <div class="rmeta">${metaText}</div>
      ${best ? `<div class="rprogress">Terbaik: ${best.best_correct}/${best.best_total}</div>` : ''}
    </div>`;
  }).join('');
  const fst = rangeStats(FULL_RANGE);
  const fbest = bestForRange(FULL_RANGE.key);
  const fMetaText = fst.curated ? `${fst.groupCount} titik keliruan disahkan merentasi seluruh Al-Quran` : `~${fst.occCount} ayat`;
  return `
  <h2>Pilih Cabaran</h2>
  <p class="muted">Pilih julat Juzuk untuk memulakan cabaran anda.</p>
  <div class="range-grid">${cards}</div>
  <div class="full-card" data-range="${FULL_RANGE.key}" tabindex="0" role="button">
    <div><div class="rtitle">Juz 1 &ndash; 30</div><div class="rmeta">Cabaran Penuh &middot; ${fMetaText}</div></div>
    <div style="text-align:right;">${fbest? `<div class="rprogress" style="color:var(--soft-gold)">Terbaik: ${fbest.best_correct}/${fbest.best_total}</div>`:''}<div style="font-size:22px;">&rarr;</div></div>
  </div>`;
}

function getRangeByKey(key){
  if(key===FULL_RANGE.key) return FULL_RANGE;
  return RANGES.find(r=>r.key===key);
}

// ---------- Length picker ----------
function lengthHtml(){
  const range = STATE.currentRange;
  const st = rangeStats(range);
  const quickN = Math.min(10, st.groupCount);
  const fullN = Math.min(25, st.groupCount);
  const introText = st.curated
    ? `${st.groupCount} titik keliruan Mutasyābihāt disahkan untuk ${range.label} &mdash; setiap satu diuji mengikut jenis keliruan sebenar (bukan sekadar "surah yang mana").`
    : `${st.occCount} ayat disahkan merentasi ${st.groupCount} kumpulan mutasyābihāt.`;
  return `
  <button class="back-link" data-nav="challenge">&larr; Kembali</button>
  <h2>${range.label}</h2>
  <p class="muted">${introText}</p>
  <div class="length-options">
    <div class="length-card" data-length="${quickN}" tabindex="0" role="button">
      <div><div class="ltitle">Latihan Ringkas</div><div class="lmeta">${quickN} soalan</div></div>
      <div style="font-size:20px;color:var(--gold);">&rarr;</div>
    </div>
    <div class="length-card" data-length="${fullN}" tabindex="0" role="button">
      <div><div class="ltitle">Latihan Penuh</div><div class="lmeta">${fullN} soalan</div></div>
      <div style="font-size:20px;color:var(--gold);">&rarr;</div>
    </div>
  </div>`;
}

// ---------- Quiz ----------
function currentQuestion(){
  return STATE.quiz.questions[STATE.quiz.index];
}

function quizHtml(){
  const q = currentQuestion();
  const idx = STATE.quiz.index+1, total = STATE.quiz.questions.length;
  const pct = Math.round((idx-1)/total*100);
  let body = '';
  if(q.type==='J-COMPARE'){
    body = `
    <div class="prompt-text">${q.prompt}</div>
    <div class="compare-row">${q.pair.map((p,i)=>`
      <div class="compare-box" data-oi="${i}" tabindex="0" role="button">
        <div class="compare-label">${i===0?'A':'B'}</div>
        <div class="compare-arabic">${escapeHtml(p.text)}</div>
      </div>`).join('')}</div>`;
  } else if(q.type==='J-STEM'){
    const ayahLine = q.blankFirst
      ? `<span class="blank">&hellip;&hellip;&hellip;</span> ${escapeHtml(q.stem)}`
      : `${escapeHtml(q.stem)} <span class="blank">&hellip;&hellip;&hellip;</span>`;
    body = `
    <div class="ayah-box"><span class="corner tl">&#10022;</span><span class="corner tr">&#10022;</span>
      <div class="ayah-arabic">${ayahLine}</div>
    </div>
    <div class="prompt-text">${q.prompt}</div>
    <div class="options">${q.options.map((o,i)=>`
      <div class="option" data-oi="${i}" tabindex="0" role="button"><div class="opt-badge">${String.fromCharCode(65+i)}</div><div class="opt-arabic">${escapeHtml(o.text)}</div></div>
    `).join('')}</div>`;
  } else if(q.type==='A'){
    body = `
    <div class="ayah-box"><span class="corner tl">&#10022;</span><span class="corner tr">&#10022;</span>
      <div class="ayah-arabic">${escapeHtml(q.arabic)}</div>
    </div>
    <div class="prompt-text">${q.prompt}</div>
    <div class="options">${q.options.map((o,i)=>`
      <div class="option" data-oi="${i}" tabindex="0" role="button"><div class="opt-badge">${String.fromCharCode(65+i)}</div><div>${escapeHtml(o.label)}</div></div>
    `).join('')}</div>`;
  } else if(q.type==='B'){
    body = `
    <div class="prompt-text">${q.prompt}</div>
    <div class="compare-row">${q.pair.map((p,i)=>`
      <div class="compare-box" data-oi="${i}" tabindex="0" role="button">
        <div class="compare-label">${i===0?'A':'B'}</div>
        <div class="compare-arabic">${escapeHtml(p.text)}</div>
      </div>`).join('')}</div>`;
  } else {
    body = `
    <div class="ayah-box"><span class="corner tl">&#10022;</span><span class="corner tr">&#10022;</span>
      <div class="ayah-arabic">${escapeHtml(q.stem)} <span class="blank">&hellip;&hellip;&hellip;</span></div>
    </div>
    <div class="prompt-text">${q.prompt}</div>
    <div class="options">${q.options.map((o,i)=>`
      <div class="option" data-oi="${i}" tabindex="0" role="button"><div class="opt-badge">${String.fromCharCode(65+i)}</div><div class="opt-arabic">${escapeHtml(o.text)}</div></div>
    `).join('')}</div>`;
  }
  return `
  <div class="quiz-header"><span>${STATE.currentRange.label}</span><span>Soalan ${idx} / ${total}</span></div>
  <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
  <div class="question-card">${body}</div>
  <div class="quiz-footer">
    <button class="btn btn-secondary" data-action="exit-quiz">Keluar</button>
    <button class="btn btn-primary" data-action="submit-answer" disabled id="submitBtn">Hantar Jawapan</button>
  </div>`;
}

// ---------- Feedback ----------
function feedbackHtml(){
  const q = currentQuestion();
  const ans = STATE.quiz.answers[STATE.quiz.index];
  const correct = ans.correct;

  if(q.curated){
    let correctAnswerLabel, correctText;
    if(q.type==='J-COMPARE'){
      const askedRef = q.pair[q.correctIdx].ref;
      correctAnswerLabel = 'Surah ' + askedRef.surah + ' ayat ' + askedRef.ayah;
      correctText = q.pair[q.correctIdx].text;
    } else {
      correctAnswerLabel = q.options.find(o=>o.isCorrect).text;
      correctText = q.stem + ' ' + correctAnswerLabel;
    }
    return `
    <div class="fb-banner ${correct?'correct':'incorrect'}">
      <div class="fb-icon">${correct?'&#10003;':'&#10005;'}</div>
      <div class="fb-title">${correct?'Betul!':'Kurang Tepat'}</div>
    </div>
    <div class="fb-section">
      <div class="fb-label">Jawapan yang betul ialah:</div>
      <div class="fb-answer-row"><div class="opt-badge">&#10022;</div><div class="opt-arabic" style="font-size:17px;">${escapeHtml(correctAnswerLabel)}</div></div>
    </div>
    <div class="fb-section">
      <div class="fb-label">Ayat Betul</div>
      <div class="ref-box">
        <div class="ayah-arabic" style="font-size:19px;">${escapeHtml(q.target.arabic)}</div>
        <div class="ref-cite">${q.target.surah} ${q.target.ayah} &middot; Juzuk ${q.target.juz}</div>
      </div>
    </div>
    <div class="fb-section">
      <div class="fb-label">Ayat Serupa (sering dikelirukan)</div>
      <div class="ref-box">
        <div class="ayah-arabic" style="font-size:19px;">${escapeHtml(q.sibling.arabic)}</div>
        <div class="ref-cite">${q.sibling.surah} ${q.sibling.ayah} &middot; Juzuk ${q.sibling.juz}</div>
      </div>
    </div>
    <div class="fb-section">
      <div class="fb-label">Apa Yang Perlu Diperhatikan</div>
      <div class="explanation-box">${escapeHtml(q.explanation)}</div>
    </div>
    <div class="quiz-footer" style="justify-content:flex-end;">
      <button class="btn btn-primary" data-action="next-question">${STATE.quiz.index+1<STATE.quiz.questions.length? 'Soalan Seterusnya &rarr;' : 'Lihat Keputusan &rarr;'}</button>
    </div>`;
  }

  const target = q.target;
  let correctAnswerLabel = '';
  if(q.type==='A') correctAnswerLabel = q.options.find(o=>o.isCorrect).label;
  if(q.type==='B') correctAnswerLabel = 'Surah ' + q.pair[q.correctIdx].ref.surah + ' ' + q.pair[q.correctIdx].ref.ayah;
  if(q.type==='C') correctAnswerLabel = q.correctTail;

  const explanation = target.explanation && target.explanation.length>20
    ? target.explanation
    : `Lafaz ini juga terdapat di ${escapeHtml(target.related_ayahs.slice(0,3).join(', '))}, dengan sedikit perbezaan pada lafaz atau kedudukan ayat.`;

  return `
  <div class="fb-banner ${correct?'correct':'incorrect'}">
    <div class="fb-icon">${correct?'&#10003;':'&#10005;'}</div>
    <div class="fb-title">${correct?'Betul!':'Kurang Tepat'}</div>
  </div>
  <div class="fb-section">
    <div class="fb-label">Jawapan yang betul ialah:</div>
    <div class="fb-answer-row"><div class="opt-badge">&#10022;</div><div>${escapeHtml(correctAnswerLabel)}</div></div>
  </div>
  <div class="fb-section">
    <div class="fb-label">Rujukan Ayat</div>
    <div class="ref-box">
      <div class="ayah-arabic" style="font-size:20px;">${escapeHtml(target.arabic)}</div>
      <div class="ref-cite">${target.surah} ${target.ayah} &middot; Juzuk ${target.juz}</div>
      ${target.related_ayahs.length? `<div class="related-list">Berkait dengan: ${escapeHtml(target.related_ayahs.join(', '))}</div>` : ''}
    </div>
  </div>
  <div class="fb-section">
    <div class="fb-label">Penjelasan</div>
    <div class="explanation-box">${escapeHtml(explanation)}</div>
  </div>
  <div class="quiz-footer" style="justify-content:flex-end;">
    <button class="btn btn-primary" data-action="next-question">${STATE.quiz.index+1<STATE.quiz.questions.length? 'Soalan Seterusnya &rarr;' : 'Lihat Keputusan &rarr;'}</button>
  </div>`;
}

// ---------- Results ----------
function resultsHtml(){
  const total = STATE.quiz.questions.length;
  const correct = STATE.quiz.answers.filter(a=>a.correct).length;
  const pct = Math.round(correct/total*100);
  return `
  <div class="card results-card">
    <div class="muted" style="margin-bottom:6px;">${STATE.currentRange.label} &middot; Keputusan</div>
    <div class="score-big">${correct} / ${total}</div>
    <div class="score-sub">${pct}% tepat</div>
    <div style="margin-top:26px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
      <button class="btn btn-secondary" data-nav="challenge">Pilih Cabaran Lain</button>
      <button class="btn btn-primary" data-action="retry-range">Cuba Lagi</button>
    </div>
  </div>`;
}

// ---------- Progress ----------
function progressHtml(){
  const s = PROGRESS.stats;
  const accuracy = s.attempted? Math.round(s.correct/s.attempted*100) : 0;
  const completed = Object.values(PROGRESS.by_range).filter(r=>r.completed).length;
  const allRanges = [...RANGES, FULL_RANGE];
  const bars = allRanges.map(r=>{
    const rp = PROGRESS.by_range[r.key];
    const pct = rp && rp.attempts_total ? Math.round(rp.correct_total/rp.attempts_total*100) : null;
    return `<div class="bar-row">
      <div class="bar-label">${r.label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct||0}%"></div></div>
      <div class="bar-pct">${pct===null? '&mdash;' : pct+'%'}</div>
    </div>`;
  }).join('');

  if(s.attempted===0){
    return `
    <h2>Kemajuan Anda</h2>
    <div class="empty-state card">Belum ada percubaan lagi. Mula satu cabaran untuk melihat kemajuan anda di sini.</div>
    <div style="margin-top:16px;"><button class="btn btn-primary" data-nav="challenge">Mula Cabaran</button></div>`;
  }

  const weakEntries = Object.entries(PROGRESS.weak_items).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const weakHtml = weakEntries.length ? `
  <h3 style="margin-top:28px;">Ayat yang Perlu Diberi Perhatian</h3>
  <div class="card" style="margin-top:10px;">
    ${weakEntries.map(([sig,count])=>`<div class="bar-row" style="justify-content:space-between;"><div style="color:var(--charcoal);">${escapeHtml(sig)}</div><div class="muted">${count}&times; tersilap</div></div>`).join('')}
  </div>` : '';

  return `
  <h2>Kemajuan Anda</h2>
  <p class="muted">Teruskan usaha. Setiap latihan membawa anda lebih dekat.</p>
  <div class="stat-grid">
    <div class="stat-box"><div class="stat-num">${s.attempted}</div><div class="stat-label">Soalan dijawab</div></div>
    <div class="stat-box"><div class="stat-num">${s.correct}</div><div class="stat-label">Jawapan betul</div></div>
    <div class="stat-box"><div class="stat-num">${accuracy}%</div><div class="stat-label">Kadar ketepatan</div></div>
    <div class="stat-box"><div class="stat-num">${completed}</div><div class="stat-label">Cabaran selesai</div></div>
  </div>
  <h3 style="margin-top:28px;">Prestasi Mengikut Juzuk</h3>
  <div class="card" style="margin-top:10px;">${bars}</div>
  ${weakHtml}
  <div style="margin-top:18px;"><button class="btn-plain" data-action="reset-progress">Set semula kemajuan</button></div>`;
}

// ===================== Events =====================
function bindEvents(){
  // Enter/Space activates any custom clickable element (keyboard accessibility)

  app.querySelectorAll('[data-nav]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const key = el.getAttribute('data-nav');
      go(key);
    });
  });
  app.querySelectorAll('.range-card, .full-card').forEach(el=>{
    el.addEventListener('click', ()=>{
      const key = el.getAttribute('data-range');
      go('length', {currentRange:getRangeByKey(key)});
    });
  });
  app.querySelectorAll('.length-card').forEach(el=>{
    el.addEventListener('click', ()=>{
      const length = parseInt(el.getAttribute('data-length'),10);
      const questions = buildQuiz(STATE.currentRange, length);
      go('quiz', {quiz:{range:STATE.currentRange, length, questions, index:0, answers:[]}});
    });
  });

  if(STATE.screen==='quiz'){
    const q = currentQuestion();
    let selected = null;
    const optionEls = app.querySelectorAll('.option, .compare-box');
    optionEls.forEach(el=>{
      el.addEventListener('click', ()=>{
        optionEls.forEach(o=>o.classList.remove('selected'));
        el.classList.add('selected');
        selected = parseInt(el.getAttribute('data-oi'),10);
        document.getElementById('submitBtn').disabled = false;
      });
    });
    const submitBtn = app.querySelector('[data-action="submit-answer"]');
    if(submitBtn) submitBtn.addEventListener('click', ()=>{
      if(selected===null) return;
      let correct = false;
      if(q.type==='A') correct = q.options[selected].isCorrect;
      if(q.type==='B') correct = selected===q.correctIdx;
      if(q.type==='C') correct = q.options[selected].isCorrect;
      if(q.type==='J-COMPARE') correct = selected===q.correctIdx;
      if(q.type==='J-STEM') correct = q.options[selected].isCorrect;
      STATE.quiz.answers[STATE.quiz.index] = {correct};
      recordAnswer(STATE.currentRange.key, correct, q.curated ? q.signature : q.groupId);
      go('feedback');
    });
    const exitBtn = app.querySelector('[data-action="exit-quiz"]');
    if(exitBtn) exitBtn.addEventListener('click', ()=>go('challenge'));
  }

  const nextBtn = app.querySelector('[data-action="next-question"]');
  if(nextBtn) nextBtn.addEventListener('click', ()=>{
    if(STATE.quiz.index+1 < STATE.quiz.questions.length){
      STATE.quiz.index++;
      go('quiz');
    } else {
      finalizeQuizResult();
      go('results');
    }
  });

  const retryBtn = app.querySelector('[data-action="retry-range"]');
  if(retryBtn) retryBtn.addEventListener('click', ()=>{
    const length = STATE.quiz.length;
    const questions = buildQuiz(STATE.currentRange, length);
    go('quiz', {quiz:{range:STATE.currentRange, length, questions, index:0, answers:[]}});
  });

  const resetBtn = app.querySelector('[data-action="reset-progress"]');
  if(resetBtn) resetBtn.addEventListener('click', ()=>{
    if(confirm('Set semula semua kemajuan? Tindakan ini tidak boleh dibatalkan.')){
      PROGRESS = defaultProgress();
      saveProgress(PROGRESS);
      render();
    }
  });
}

function recordAnswer(rangeKey, correct, groupId){
  PROGRESS.stats.attempted++;
  if(correct) PROGRESS.stats.correct++;
  if(!PROGRESS.by_range[rangeKey]) PROGRESS.by_range[rangeKey] = {attempts_total:0, correct_total:0, attempts:0, best_correct:0, best_total:0, completed:false};
  const r = PROGRESS.by_range[rangeKey];
  r.attempts_total++;
  if(correct) r.correct_total++;
  if(!correct){
    PROGRESS.weak_items[groupId] = (PROGRESS.weak_items[groupId]||0)+1;
  }
  saveProgress(PROGRESS);
}

function finalizeQuizResult(){
  const rangeKey = STATE.currentRange.key;
  const total = STATE.quiz.questions.length;
  const correct = STATE.quiz.answers.filter(a=>a.correct).length;
  if(!PROGRESS.by_range[rangeKey]) PROGRESS.by_range[rangeKey] = {attempts_total:0, correct_total:0, attempts:0, best_correct:0, best_total:0, completed:false};
  const r = PROGRESS.by_range[rangeKey];
  r.attempts = (r.attempts||0)+1;
  if(correct > (r.best_correct||0) || total>(r.best_total||0)){
    r.best_correct = correct; r.best_total = total;
  }
  r.completed = true;
  saveProgress(PROGRESS);
}

// ===================== Init =====================

document.addEventListener('keydown', (e)=>{
  if(e.key==='Enter' || e.key===' '){
    const el = document.activeElement;
    if(el && el.hasAttribute && el.hasAttribute('tabindex') && el.getAttribute('role')==='button'){
      e.preventDefault();
      el.click();
    }
  }
});
render();
