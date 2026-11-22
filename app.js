// 中英文共用程式：初始語言由 <html lang> 決定，可在原頁切換（見 setLang）；動態文字都在 I18N，靜態文字取自另一語言的頁面
const I18N = {
  zh: {
    prep: '準備', work: '運動', rest: '休息', long: '長休息', done: '完成',
    sum: (w, r, s, n) => `${w}s／${r}s × ${s}組 × ${n}輪`,
    item: x => `第${x.r}輪 第${x.s}組 ${x.name}`,
    next: '下一段：', elapsed: '已進行 ', total: '總長 ',
    again: '重來', pause: '暫停', resume: '繼續', start: '開始',
    sayWork: '開始', sayRest: '休息', sayDone: '全部完成', wake: '。',
    lang: 'zh-TW', store: 'timerVoice', match: /^zh|cmn|yue/i,
    regions: [[/HK|yue/i, '香港／粵語', 5], [/TW|Hant/i, '台灣', 0], [/liaoning/i, '中國東北', 2], [/shaanxi/i, '中國陝西', 3], [/sichuan/i, '中國四川', 4], [/CN|Hans/i, '中國', 1]],
    other: '中文', female: '女聲', male: '男聲', unknown: '語音', sep: '・', natural: '（自然）',
    noVoice: '（無中文語音）',
    noVoiceTip: '找不到中文語音。建議改用 Edge 開啟，或在 Windows「設定 → 時間與語言 → 語音」加裝中文語音。',
    presets: [['標準', '原速、原音調'], ['俐落', '稍快、原音調'], ['明快', '快、稍高'], ['教練', '快、低沉有力'], ['活力', '很快、高音']],
  },
  en: {
    prep: 'Get ready', work: 'Work', rest: 'Rest', long: 'Long rest', done: 'Done',
    sum: (w, r, s, n) => `${w}s / ${r}s × ${s} ${s === 1 ? 'set' : 'sets'} × ${n} ${n === 1 ? 'round' : 'rounds'}`,
    item: x => `Round ${x.r} · Set ${x.s} · ${x.name}`,
    next: 'Next: ', elapsed: 'Elapsed ', total: 'Total ',
    again: 'Again', pause: 'Pause', resume: 'Resume', start: 'Start',
    sayWork: 'Go', sayRest: 'Rest', sayDone: 'Workout complete', wake: '.',
    lang: 'en-US', store: 'timerVoiceEn', match: /^en/i,
    regions: [[/^en.US/i, 'US', 0], [/^en.GB/i, 'UK', 1], [/^en.AU/i, 'Australia', 2], [/^en.CA/i, 'Canada', 3], [/^en.IN/i, 'India', 4], [/^en.IE/i, 'Ireland', 5], [/^en.NZ/i, 'New Zealand', 6], [/^en.ZA/i, 'South Africa', 7], [/^en.SG/i, 'Singapore', 8], [/^en.HK/i, 'Hong Kong', 9], [/^en.PH/i, 'Philippines', 10], [/^en.NG/i, 'Nigeria', 11], [/^en.KE/i, 'Kenya', 12], [/^en.TZ/i, 'Tanzania', 13]],
    other: 'English', female: 'Female', male: 'Male', unknown: 'Voice', sep: ' · ', natural: ' (natural)',
    noVoice: '(No English voice)',
    noVoiceTip: 'No English voice found. Try Microsoft Edge, or add an English voice in your device’s speech settings.',
    presets: [['Normal', 'Normal speed and pitch'], ['Brisk', 'Slightly faster'], ['Bright', 'Fast, slightly higher'], ['Coach', 'Fast, deep and strong'], ['Energy', 'Very fast, high pitch']],
  },
};
const ROOT = new URL('.', document.currentScript.src).href;
let LANG = /^en/i.test(document.documentElement.lang) ? 'en' : 'zh', T = I18N[LANG];

const $ = id => document.getElementById(id);
const R = 90, C = 2 * Math.PI * R;
$('prog').style.strokeDasharray = C;

let segs = [], idx = 0, remainMs = 0, running = false, lastTs = 0, timer = null, lastBeepSec = null, lastTickQ = null, wakeLock = null;

const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const num = (id, d) => { const v = parseInt($(id).value, 10); return isNaN(v) ? d : v; };

function build() {
  const prep = num('cPrep', 5), work = num('cWork', 30), rest = num('cRest', 15),
        long = num('cLong', 30), sets = num('cSets', 4), rounds = num('cRounds', 3);
  segs = [];
  if (prep > 0) segs.push({ type: 'ready', name: T.prep, dur: prep, r: 0, s: 0 });
  for (let r = 1; r <= rounds; r++) {
    for (let s = 1; s <= sets; s++) {
      segs.push({ type: 'work', name: T.work, dur: work, r, s });
      const isLastOfRound = s === sets;
      const d = isLastOfRound ? long : rest;
      if (isLastOfRound && r === rounds && $('cSkipLast').checked) continue;
      if (d > 0) segs.push({ type: isLastOfRound ? 'long' : 'rest', name: isLastOfRound ? T.long : T.rest, dur: d, r, s });
    }
  }
  segs.push({ type: 'done', name: T.done, dur: 0, r: rounds, s: sets });
  idx = 0; remainMs = segs[0].dur * 1000; lastBeepSec = null; lastTickQ = null;
  renderSum(); renderList(); render();
}
function renderSum() {
  $('cfgSum').textContent = T.sum(num('cWork', 30), num('cRest', 15), num('cSets', 4), num('cRounds', 3));
}

function totalSec() { return segs.reduce((a, b) => a + b.dur, 0); }
function elapsedSec() {
  let e = 0; for (let i = 0; i < idx; i++) e += segs[i].dur;
  return e + (segs[idx].dur - remainMs / 1000);
}

function renderList() {
  $('list').innerHTML = segs.map((x, i) => {
    if (x.type === 'done') return '';
    const label = x.type === 'ready' ? T.prep : T.item(x);
    return `<div data-i="${i}"><span>${label}</span><span><input type="number" min="1" value="${x.dur}" data-i="${i}"> s</span></div>`;
  }).join('');
  renderTicks();
}

// 進度條上的分段刻度（每輪開頭為粗線）
function renderTicks() {
  const tot = totalSec(); let cum = 0, html = '';
  segs.forEach((x, i) => {
    if (i > 0 && x.type !== 'done' && tot) {
      const isRound = x.type === 'work' && x.s === 1;
      html += `<div class="tk${isRound ? ' round' : ''}" style="left:${cum / tot * 100}%"></div>`;
    }
    cum += x.dur;
  });
  $('ticks').innerHTML = html;
}

// 跳到總時間 t 秒的位置
function seekTo(t) {
  const tot = totalSec();
  t = Math.max(0, Math.min(t, tot));
  let cum = 0, i = 0;
  while (i < segs.length - 1 && cum + segs[i].dur <= t) { cum += segs[i].dur; i++; }
  idx = i;
  remainMs = (segs[i].dur - (t - cum)) * 1000;
  lastBeepSec = Math.ceil(remainMs / 1000); lastTickQ = Math.ceil(remainMs / TICK_MS);   // 跳轉當下不補播聲音
  lastTs = performance.now();
  if (segs[idx].type === 'done' && running) stop();
  render();
}

function render() {
  const seg = segs[idx];
  document.body.className = 'phase-' + seg.type;
  $('phase').textContent = seg.name;
  $('time').textContent = seg.type === 'done' ? '🎉' : fmt(remainMs / 1000);
  const frac = seg.dur ? 1 - remainMs / (seg.dur * 1000) : 1;
  $('prog').style.strokeDashoffset = C * frac;
  const nx = segs[idx + 1];
  $('next').textContent = nx ? T.next + (nx.type === 'done' ? T.done : `${nx.name} ${nx.dur}s`) : '';
  $('round').textContent = `${seg.r}/${num('cRounds', 3)}`;
  $('set').textContent = `${seg.s}/${num('cSets', 4)}`;
  const tot = totalSec(), el = elapsedSec();
  $('totalLeft').textContent = fmt(tot - el);
  $('elapsed').textContent = T.elapsed + fmt(el);
  $('total').textContent = T.total + fmt(tot);
  $('totalBar').style.width = (tot ? el / tot * 100 : 0) + '%';
  $('thumb').style.left = (tot ? el / tot * 100 : 0) + '%';
  $('play').textContent = seg.type === 'done' ? T.again : running ? T.pause : (el > 0 ? T.resume : T.start);
  document.querySelectorAll('#list div').forEach(d => {
    const i = +d.dataset.i;
    d.className = i === idx ? 'cur' : i < idx ? 'past' : '';
  });
  const cur = document.querySelector('#list .cur');
  if (cur && $('list').closest('details').open) cur.scrollIntoView({ block: 'nearest' });
}

// ---- 聲音 ----
let ac = null;
// 較自然的提示音：快速起音 + 指數衰減，主音加一點高八度泛音
function beep(freq = 1760, ms = 100, vol = 0.35) {
  if (!$('cSound').checked) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ac.currentTime, end = t0 + ms / 1000;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.connect(ac.destination);
    [[freq, 1], [freq * 2, 0.25]].forEach(([f, a]) => {
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = 'sine'; o.frequency.value = f; og.gain.value = a;
      o.connect(og).connect(g); o.start(t0); o.stop(end + 0.02);
    });
  } catch (e) {}
}

// 最後 5 秒的明亮提示音：高音 E7 + 多個泛音，聲音清脆醒目
function alertBeep(last = false) {
  if (!$('cSound').checked) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ac.currentTime, end = t0 + (last ? 0.7 : 0.16), hold = last ? 0.45 : 0.05;
    const f0 = last ? 3520 : 2637;   // 最後一秒：更高的 A7 長音
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.003);
    g.gain.setValueAtTime(0.5, t0 + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.connect(ac.destination);
    [[f0, 1, 'triangle'], [f0 * 2, 0.35, 'sine'], [f0 * 3, 0.15, 'sine']].forEach(([f, a, w]) => {
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = w; o.frequency.value = f; og.gain.value = a;
      o.connect(og).connect(g); o.start(t0); o.stop(end + 0.02);
    });
  } catch (e) {}
}

// ---- 語音：可試聽、可選擇，選擇存在瀏覽器 ----
const PRESETS = [[1.0, 1.0], [1.2, 1.0], [1.3, 1.15], [1.25, 0.8], [1.45, 1.3]].map(([r, p]) => ({ r, p }));
let vcfg;
function loadCfg() {   // 中英文各自記住選的語音
  vcfg = { voice: '', preset: 1 };
  try { Object.assign(vcfg, JSON.parse(localStorage.getItem(T.store) || '{}')); } catch (e) {}
}
loadCfg();
const saveV = () => { try { localStorage.setItem(T.store, JSON.stringify(vcfg)); } catch (e) {} };

let voices = [], voice = null;
// 選單只顯示「地區・女聲／男聲＋編號」，不顯示系統語音的人名
const region = l => T.regions.find(([re]) => re.test(l));
const langName = l => { const r = region(l); return r ? r[1] : T.other; };
// 英文版：使用者瀏覽器所在的英語地區排最前面
const homeName = () => LANG === 'en' && /^en.[a-z]{2}/i.test(navigator.language || '') ? langName(navigator.language) : '';
const regionRank = v => { const r = region(v.lang); return r ? (r[1] === homeName() ? -1 : r[2]) : 99; };
// 同一個聲音的識別：iPhone 會把內建語音列兩次（或同聲音不同音質），靠這個合併成一個
function voiceId(v) {
  const uri = v.voiceURI || '';
  const base = /^com\.apple\./i.test(uri) ? uri.split('.').pop() : v.name;
  const key = base.toLowerCase()
    .replace(/[（(][^（()）]*(enhanced|premium|compact|natural|增強|增强|優化|优化|高品質|高品质|高音質|高音质)[^（()）]*[)）]/g, '')
    .replace(/\bonline\b|[-_](super-compact|compact|enhanced|premium|network|local)$/g, '')
    .replace(/[\s_-]+/g, '');
  return v.lang.replace('_', '-').toLowerCase() + '|' + key;
}
const FEMALE = {
  en: /female|\b(flo|grandma|sandy|shelley|kathy|emma|ava|jenny|aria|michelle|ana|sonia|libby|maisie|natasha|hayley|clara|heather|neerja|emily|leah|yan|asilia|molly|ezinne|rosa|luna|imani|zoe|allison|nicky|samantha|joelle|kate|stephanie|serena|martha|matilda|karen|catherine|tara|isha|sangeeta|veena|moira|tessa|fiona|zira|hazel|susan|linda|heera)(multilingual)?\b|google us english$|-x-(tpc|iob|iog|tpf|sfg|gba|gbc|gbg|aua|auc|ena|enc)-/i,
  zh: /female|mei-?jia|美佳|ting-?ting|tian-?tian|婷婷|甜甜|sin-?ji|善怡|yu-?shu|[語语]舒|lilian|sha-?sha|li-?sheng|lan-?lan|shan-?shan|dong-?mei|pan-?pan|\bli-?li\b|\byue\b|\bflo\b|grandma|奶|嬤|祖母|sandy|shelley|xiao(?!yun)|hsiao|huihui|yaoyao|yating|hanhan|hiu|tracy|google (普通|國語|国语|粤|粵)|-(ccc|ssa|ctc|jar|yuc)-/i,
};
const MALE = {
  en: /(^|[^e])male|\b(eddy|grandpa|reed|rocko|fred|junior|ralph|jacques|andrew|brian|guy|eric|steffan|christopher|roger|ryan|thomas|william|liam|prabhat|connor|luke|sam|chilemba|mitchell|abeo|james|wayne|elimu|evan|nathan|tom|alex|aaron|jamie|oliver|daniel|arthur|lee|gordon|aman|rishi|david|mark|george|richard|ravi|sean)(multilingual)?\b|-x-(iom|iol|tpd|rjs|gbb|gbd|aub|aud|end|ene)-/i,
  zh: /(^|[^e])male|li-?mu|李牧|bo-?bo|tao-?tao|bin-?bin|hao-?hao|aa-?sing|\bhan\b|eddy|grandpa|爺|爷|祖父|\breed\b|rocko|\byun(xi|xia|jian|yang|jhe|ze|feng|hao|ye)|kangkang|zhiwei|danny|wanlung|-(ccd|cce|ctd|cte|yud|yue|yuf)-(network|local)/i,
};
function genderName(v) {
  const t = (v.name + ' ' + (v.voiceURI || '')).replace(/_/g, ' ');
  return MALE[LANG].test(t) ? T.male : FEMALE[LANG].test(t) ? T.female : T.unknown;
}
// 不適合播報的語音：Apple 的搞笑音效語音、eSpeak 的變音版本
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox)\b|speech\.synthesis\.voice\.(albert|badnews|bahh|bells|boing|bubbles|cellos|goodnews|hysterical|organ|princess|trinoids|whisper|deranged|zarvox)|\+/i;
const isNovelty = v => NOVELTY.test(v.name) || NOVELTY.test(v.voiceURI || '');
const vScore = v => {
  const t = v.name + ' ' + (v.voiceURI || '');
  return (/natural/i.test(t) ? 8 : 0) + (/online/i.test(t) ? 4 : 0) + (/google/i.test(t) ? 3 : 0) +
    (/premium/i.test(t) ? 3 : /enhanced|增強|增强|優化|优化/i.test(t) ? 2 : 0) -
    (/super-compact/i.test(t) ? 1 : 0) - (/eloquence|eddy|\bflo\b|grandma|grandpa|\breed\b|rocko|sandy|shelley|\b(fred|junior|kathy|ralph|jacques)\b|espeak/i.test(t) ? 5 : 0);
};
const genderRank = v => [T.female, T.male, T.unknown].indexOf(genderName(v));
function loadVoices() {
  if (!window.speechSynthesis) return;
  const all = speechSynthesis.getVoices().filter(v => T.match.test(v.lang) && !isNovelty(v))
    .sort((a, b) => regionRank(a) - regionRank(b) || vScore(b) - vScore(a));
  const seen = new Set();
  const uniq = all.filter(v => { const id = voiceId(v); return !seen.has(id) && seen.add(id); });
  const legacy = vcfg.vid ? null : all.find(v => v.name === vcfg.voice);   // 舊版只存名稱
  const want = vcfg.vid || (legacy && voiceId(legacy));
  voice = uniq.find(v => voiceId(v) === want) || uniq[0] || null;
  voices = uniq.slice().sort((a, b) => regionRank(a) - regionRank(b) ||
    genderRank(a) - genderRank(b) || vScore(b) - vScore(a));
  renderVoices();
}
function voiceLabels() {
  const n = {};
  return voices.map(v => {
    const k = langName(v.lang) + T.sep + genderName(v);
    n[k] = (n[k] || 0) + 1;
    return k + ' ' + n[k] + (/natural|online/i.test(v.name) ? T.natural : '');
  });
}
function speak(t, v, pr, queue = false) {
  if (!window.speechSynthesis) return;
  if (!queue) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = v ? v.lang : T.lang; if (v) u.voice = v;
  u.rate = pr.r; u.pitch = pr.p; u.volume = 1;
  speechSynthesis.speak(u);
}
function preview(v, pr) { speak(T.sayWork, v, pr); setTimeout(() => speak(T.sayRest, v, pr, true), 50); }
// iPhone 只允許在按按鈕當下開始說話：按「開始」時先無聲說一句，喚醒語音，之後自動播報才會出聲
function unlockSpeech() {
  if (!window.speechSynthesis || !$('cVoice').checked) return;
  try {
    const u = new SpeechSynthesisUtterance(T.wake);
    u.lang = T.lang; u.volume = 0; u.rate = 2;
    speechSynthesis.speak(u);
  } catch (e) {}
}
function say(t) {
  if (!$('cVoice').checked) return;
  speak(t, voice, PRESETS[vcfg.preset] || PRESETS[0]);
}
const curPreset = () => PRESETS[vcfg.preset] || PRESETS[0];
function renderVoices() {
  const sel = $('voiceSel');
  const old = document.querySelector('#voiceBox .vempty'); if (old) old.remove();
  if (!voices.length) {
    sel.innerHTML = `<option>${T.noVoice}</option>`; sel.disabled = true;
    $('voiceBox').insertAdjacentHTML('beforeend', `<div class="vempty">${T.noVoiceTip}</div>`);
  } else {
    sel.disabled = false;
    const labels = voiceLabels();
    sel.innerHTML = voices.map((v, i) => `<option value="${i}"${v === voice ? ' selected' : ''}>${labels[i]}</option>`).join('');
  }
  $('presetList').innerHTML = PRESETS.map((p, i) =>
    `<button class="${i === +vcfg.preset ? 'sel' : ''}" data-p="${i}" title="${T.presets[i][1]}">${T.presets[i][0]}</button>`).join('');
}
$('voiceSel').addEventListener('change', e => {
  voice = voices[+e.target.value]; vcfg.voice = voice.name; vcfg.vid = voiceId(voice); saveV(); preview(voice, curPreset());
});
$('vTest').onclick = () => preview(voice, curPreset());
$('presetList').addEventListener('click', e => {
  const r = e.target.closest('[data-p]');
  if (r) { vcfg.preset = +r.dataset.p; saveV(); renderVoices(); preview(voice, curPreset()); }
});
$('cVoice').addEventListener('change', () => { $('voiceBox').style.display = $('cVoice').checked ? '' : 'none'; });
if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
else renderVoices();

function announceSeg(seg) {
  if (seg.type === 'work') say(T.sayWork);
  else if (seg.type === 'rest' || seg.type === 'long') say(T.sayRest);
}
// 快節奏碼表滴答聲：每秒 4 下，「滴」「答」交替的短促機械喀聲（濾波雜訊）
const TICK_MS = 250;
let noiseBuf = null;
function tickSound(tock) {
  if (!$('cSound').checked || !$('cTick').checked) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.03), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = tock ? 2600 : 3800; bp.Q.value = 6;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(tock ? 0.5 : 0.6, t0 + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.022);
    src.connect(bp).connect(g).connect(ac.destination);
    src.start(t0); src.stop(t0 + 0.03);
  } catch (e) {}
}

function enterSeg(i, announce = true) {
  idx = Math.max(0, Math.min(i, segs.length - 1));
  remainMs = segs[idx].dur * 1000; lastBeepSec = null; lastTickQ = null;
  const seg = segs[idx];
  if (announce) {
    if (seg.type === 'done') { beep(1568, 160); setTimeout(() => beep(2093, 160), 170); setTimeout(() => beep(2637, 400), 340); say(T.sayDone); stop(); }
    else { beep(seg.type === 'work' ? 2093 : 1568, 220); announceSeg(seg); }
  }
}

function tick() {
  const now = performance.now(), dt = now - lastTs; lastTs = now;
  remainMs -= dt;
  while (remainMs <= 0 && segs[idx].type !== 'done') {
    const over = -remainMs;
    enterSeg(idx + 1);
    if (segs[idx].type === 'done') break;
    remainMs -= over;
  }
  const sec = Math.ceil(remainMs / 1000);
  if (running && sec >= 1 && sec <= 5 && sec !== lastBeepSec && sec < segs[idx].dur) {
    lastBeepSec = sec;
    alertBeep(sec === 1);           // 最後 5 秒：明亮提示音，最後一秒為長音
  }
  const q = Math.ceil(remainMs / TICK_MS);
  if (running && sec > 5 && q !== lastTickQ && q < segs[idx].dur * 1000 / TICK_MS) {
    lastTickQ = q;
    tickSound(q % 2 === 0);         // 其餘時間：快節奏滴答聲
  }
  render();
}

async function start() {
  if (segs[idx].type === 'done') { build(); }
  running = true; lastTs = performance.now();
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch (e) {}
  unlockSpeech();
  if (elapsedSec() === 0) { const s = segs[0]; beep(s.type === 'work' ? 2093 : 1568, 220); announceSeg(s); }
  timer = setInterval(tick, 25);
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {}
  render();
}
function stop() {
  running = false; clearInterval(timer); timer = null;
  try { wakeLock?.release(); } catch (e) {} wakeLock = null;
  render();
}

$('play').onclick = () => running ? stop() : start();
$('reset').onclick = () => { stop(); build(); };
$('skip').onclick = () => { enterSeg(idx + 1, running); lastTs = performance.now(); render(); };
$('prev').onclick = () => {
  const target = (segs[idx].dur * 1000 - remainMs > 2000) ? idx : idx - 1;
  enterSeg(target, false); lastTs = performance.now(); render();
};
$('list').onclick = e => {
  if (e.target.tagName === 'INPUT') return;
  const d = e.target.closest('div[data-i]'); if (d) { enterSeg(+d.dataset.i, false); lastTs = performance.now(); render(); }
};
// 個別修改某一段秒數
$('list').addEventListener('change', e => {
  if (e.target.tagName !== 'INPUT') return;
  const i = +e.target.dataset.i, v = Math.max(1, parseInt(e.target.value, 10) || 1);
  e.target.value = v;
  const s = segs[i], used = s.dur * 1000 - remainMs;
  s.dur = v;
  if (i === idx) remainMs = Math.max(0, v * 1000 - used);
  renderTicks(); render();
});
// 拖曳／點擊進度條跳轉
(() => {
  const bar = $('bar'); let drag = false;
  const pos = e => { const r = bar.getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width * totalSec()); };
  bar.addEventListener('pointerdown', e => { drag = true; bar.setPointerCapture(e.pointerId); pos(e); });
  bar.addEventListener('pointermove', e => { if (drag) pos(e); });
  bar.addEventListener('pointerup', () => { drag = false; });
  bar.addEventListener('pointercancel', () => { drag = false; });
})();
document.querySelectorAll('.step input, #cSkipLast').forEach(el => el.addEventListener('change', () => {
  if (el.type === 'number') el.value = Math.max(+el.min, parseInt(el.value, 10) || +el.min);
  stop(); build();
}));
// －／＋ 按鈕：點一下調整，按住連續調整
document.querySelectorAll('.step button').forEach(b => {
  const inp = b.parentElement.querySelector('input'), d = +b.dataset.d;
  let t1 = null, t2 = null;
  const bump = () => { inp.value = Math.max(+inp.min, (parseInt(inp.value, 10) || 0) + d); inp.dispatchEvent(new Event('change')); };
  const end = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; };
  b.addEventListener('pointerdown', e => { e.preventDefault(); bump(); t1 = setTimeout(() => { t2 = setInterval(bump, 90); }, 400); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, end));
});
document.addEventListener('keydown', e => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); $('play').click(); } });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && running) { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {} }
});

// ---- 在原頁切換語言：不重新載入，計時與設定都不中斷 ----
const langUrl = l => l === 'en' ? ROOT + 'en/' : ROOT;
const pages = {};
const getPage = l => pages[l] = pages[l] || fetch(langUrl(l)).then(r => { if (!r.ok) throw r.status; return r.text(); })
  .then(t => new DOMParser().parseFromString(t, 'text/html')).catch(e => { delete pages[l]; throw e; });
const TEXTS = '.chip .k, .sh, .row>span, .tg span, .sum>span, .sub2>summary, .guide, h1, .note, .sites, .lang';
const ATTRS = [['#bar, #prev, #reset, #skip, #vTest', 'title'], ['meta[name=description], meta[name=application-name], meta[name=apple-mobile-web-app-title]', 'content'], ['.lang', 'hreflang'], ['.lang', 'lang']];
async function setLang(l, remember) {
  if (l === LANG) return;
  const doc = await getPage(l);
  const pair = (sel, fn) => { const a = document.querySelectorAll(sel), b = doc.querySelectorAll(sel); if (a.length === b.length) a.forEach((el, i) => fn(el, b[i])); };
  pair(TEXTS, (a, b) => { a.innerHTML = b.innerHTML; });
  ATTRS.forEach(([sel, at]) => pair(sel, (a, b) => a.setAttribute(at, b.getAttribute(at))));
  document.documentElement.lang = doc.documentElement.lang;
  document.title = doc.title;
  document.querySelector('link[rel=canonical]').href = doc.querySelector('link[rel=canonical]').getAttribute('href');
  document.querySelector('link[rel=manifest]').href = langUrl(l) + 'manifest.webmanifest';
  document.querySelector('.lang').href = langUrl(l === 'en' ? 'zh' : 'en');
  LANG = l; T = I18N[l];
  try { history.replaceState(null, '', langUrl(l)); } catch (e) {}
  segs.forEach(x => { x.name = T[x.type === 'ready' ? 'prep' : x.type]; });
  loadCfg(); loadVoices(); if (!window.speechSynthesis) renderVoices();
  renderSum(); renderList(); render();
  if (remember) { try { window.goatcounter.count(); } catch (e) {} }
}
document.querySelector('.lang').addEventListener('click', e => {
  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const l = LANG === 'en' ? 'zh' : 'en';
  try { localStorage.setItem('timerLang', l); } catch (e) {}
  setLang(l, true).catch(() => { location.href = langUrl(l); });   // 抓不到另一語言時改用一般跳頁
});

build();
// 曾在本站選過英文：打開首頁時自動換成英文
try { if (LANG === 'zh' && localStorage.getItem('timerLang') === 'en') setLang('en').catch(() => {}); } catch (e) {}
// 先備好另一語言，切換時立即生效
setTimeout(() => getPage(LANG === 'en' ? 'zh' : 'en').catch(() => {}), 1500);
