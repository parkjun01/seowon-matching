// seowon_members / seowon_venues
const PW_KEY     = 'seowon_admin_pw';
const PW_DEFAULT = '1234';
function getAdminPw() { return localStorage.getItem(PW_KEY) || PW_DEFAULT; }
function setAdminPw(pw) { localStorage.setItem(PW_KEY, pw); }
const SUPABASE_URL = 'https://uospwzmrfaqypnwlhazd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvc3B3em1yZmFxeXBud2xoYXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzQxMjMsImV4cCI6MjA5NzcxMDEyM30.qszyTs4DwJSlQnWd4YUqIF27MixNQFRrnvDVD01HVaI';
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let db = { requiredMembers: [], optionalMembers: [], venues: [] };
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _fromMember(r) {
  return { id: r.id, name: r.name, gender: r.gender, role: r.role || '성도', hasCar: r.has_car, attending: r.attending, type: r.member_type };
}
async function loadDB() {
  const [{ data: mems, error: me }, { data: vens, error: ve }] = await Promise.all([
    supa.from('seowon_members').select('*').order('created_at'),
    supa.from('seowon_venues').select('*').order('created_at'),
  ]);
  if (me || ve) { console.error(me || ve); toast('데이터 로드 실패. 인터넷 연결을 확인해주세요.'); return; }
  const all = (mems || []).map(_fromMember);
  db.requiredMembers = all.filter(m => m.type === 'required');
  db.optionalMembers = all.filter(m => m.type !== 'required');
  db.venues = (vens || []).map(v => ({ id: v.id, name: v.name, requiresCar: v.requires_car }));
  _applyVenueOrder();
}
function _applyVenueOrder() {
  try {
    const raw = localStorage.getItem('seowon_venue_order');
    if (!raw) return;
    const order = JSON.parse(raw);
    db.venues.sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  } catch(e) {}
}
function _saveVenueOrder() {
  localStorage.setItem('seowon_venue_order', JSON.stringify(db.venues.map(v => v.id)));
}
async function _upsertMember(member) {
  const { error } = await supa.from('seowon_members').upsert({
    id: member.id, name: member.name, gender: member.gender,
    role: member.role, has_car: member.hasCar,
    member_type: member.type || 'optional', attending: member.attending || false,
  });
  if (error) throw error;
}
async function _deleteMember(id) {
  const { error } = await supa.from('seowon_members').delete().eq('id', id);
  if (error) throw error;
}
async function _upsertVenue(venue) {
  const { error } = await supa.from('seowon_venues').upsert({ id: venue.id, name: venue.name, requires_car: venue.requiresCar });
  if (error) throw error;
}
async function _deleteVenue(id) {
  const { error } = await supa.from('seowon_venues').delete().eq('id', id);
  if (error) throw error;
}
// ============================================================
// 페이지 전환
// ============================================================
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'page-home')     refreshHome();
  if (id === 'page-required') renderRequired();
  if (id === 'page-optional') renderOptional();
  if (id === 'page-venues')   renderVenues();
  if (id === 'page-confirm')  renderConfirm();
  if (id === 'page-manual')   renderManual();
}
// ============================================================
// 홈
// ============================================================
function refreshHome() {
  const reqPool = db.requiredMembers.filter(m => !sessionExcluded.has(m.id));
  const optPool = db.optionalMembers.filter(m => m.attending && !sessionExcluded.has(m.id));
  const pool = [...reqPool, ...optPool];
  document.getElementById('stat-total').textContent = pool.length + '명';
  const container = document.getElementById('home-names');
  if (pool.length === 0) {
    container.innerHTML = '<p class="home-names-empty">📋 버튼으로 명단을 불러오거나 + 버튼으로 추가하세요.</p>';
  } else {
    const reqHTML = reqPool.map(m =>
      `<span class="name-chip">${esc(m.name)}</span>`
    ).join('');
    const optHTML = optPool.map(m =>
      `<span class="name-chip name-chip-session">${esc(m.name)}<button class="chip-rm" onclick="removeParticipant('${m.id}')">✕</button></span>`
    ).join('');
    container.innerHTML = reqHTML + optHTML;
  }
  const venueEl = document.getElementById('home-venue-chips');
  if (!venueEl) return;
  const visibleVenues = db.venues.filter(v => !sessionHiddenVenues.has(v.id));
  venueEl.innerHTML = visibleVenues.length === 0
    ? '<p class="home-names-empty">장소를 추가해주세요.</p>'
    : visibleVenues.map(v =>
        `<span class="name-chip name-chip-session">${esc(v.name)}${v.requiresCar ? ' 🚗' : ''}<button class="chip-rm" onclick="hideVenueHome('${v.id}')">✕</button></span>`
      ).join('');
}
async function removeParticipant(id) {
  const m = db.optionalMembers.find(x => x.id === id);
  if (!m) return;
  m.attending = false;
  try { await _upsertMember(m); } catch(e) { m.attending = true; toast('저장 실패'); return; }
  refreshHome();
}
function openAddParticipant() {
  const available = db.optionalMembers.filter(m => !m.attending);
  if (available.length === 0) { toast('추가 가능한 유동 멤버가 없습니다.'); return; }
  document.getElementById('add-participant-list').innerHTML = available.map(m =>
    `<button class="pick-item" onclick="addParticipant('${m.id}')">${esc(m.name)}</button>`
  ).join('');
  openModal('modal-add-participant');
}
async function addParticipant(id) {
  const m = db.optionalMembers.find(x => x.id === id);
  if (!m) return;
  m.attending = true;
  try { await _upsertMember(m); } catch(e) { m.attending = false; toast('저장 실패'); return; }
  closeModal('modal-add-participant');
  refreshHome();
}
function startMatching() {
  const pool = getPool();
  if (pool.length < 2) { toast('매칭 대상이 2명 이상이어야 합니다.'); return; }
  showPage('page-confirm');
}
function goHome() {
  sessionExcluded.clear();
  sessionHiddenVenues.clear();
  showPage('page-home');
}
function hideVenueHome(id) {
  sessionHiddenVenues.add(id);
  refreshHome();
}
// ============================================================
// 명단 텍스트 불러오기
// ============================================================
function openPasteModal() {
  document.getElementById('paste-text').value = '';
  openModal('modal-paste');
}
async function applyPasteText() {
  const text = document.getElementById('paste-text').value;
  if (!text.trim()) { toast('텍스트를 입력해주세요.'); return; }
  const matched = db.optionalMembers.filter(m => text.includes(m.name));
  if (matched.length === 0) { toast('일치하는 유동 멤버를 찾지 못했습니다.'); return; }
  const matchedIds = new Set(matched.map(m => m.id));
  db.optionalMembers.forEach(m => { m.attending = matchedIds.has(m.id); });
  try {
    const { error } = await supa.from('seowon_members').upsert(
      db.optionalMembers.map(m => ({
        id: m.id, name: m.name, gender: m.gender, role: m.role,
        has_car: m.hasCar, member_type: 'optional', attending: m.attending,
      }))
    );
    if (error) throw error;
  } catch(e) {
    toast('저장 실패. 다시 시도해주세요.');
    await loadDB(); refreshHome(); return;
  }
  sessionExcluded.clear();
  closeModal('modal-paste');
  refreshHome();
  toast(`${matched.length}명을 이번 참석으로 설정했습니다.`);
}
// ============================================================
// 멤버 관리
// ============================================================
function renderRequired() {
  const list = db.requiredMembers;
  document.getElementById('empty-required').style.display = list.length ? 'none' : 'block';
  document.getElementById('list-required').innerHTML = list.map(m => memberCardHTML(m)).join('');
}
function renderOptional() {
  const list = db.optionalMembers;
  document.getElementById('empty-optional').style.display = list.length ? 'none' : 'block';
  document.getElementById('list-optional').innerHTML = list.map(m => memberCardHTML(m)).join('');
}
async function toggleAttend(id) {
  const m = db.optionalMembers.find(x => x.id === id);
  if (!m) return;
  m.attending = !m.attending;
  try { await _upsertMember(m); } catch(e) { m.attending = !m.attending; toast('저장 실패'); return; }
  renderOptional(); refreshHome();
}
// ============================================================
// 장소
// ============================================================
function renderVenues() {
  const list = db.venues;
  document.getElementById('empty-venues').style.display = list.length ? 'none' : 'block';
  document.getElementById('list-venues').innerHTML = list.map((v, i) => venueCardHTML(v, i, list.length)).join('');
}
// ============================================================
// HTML 생성 헬퍼
// ============================================================
function memberCardHTML(m) {
  const icon = m.gender === 'male' ? '👦' : '👧';
  const gTag = m.gender === 'male'
    ? '<span class="tag tag-m">남</span>'
    : '<span class="tag tag-f">여</span>';
  const rTag = m.role && m.role !== '성도' ? `<span class="tag tag-role">${esc(m.role)}</span>` : '';
  const cTag = m.hasCar ? '<span class="tag tag-car">🚗 차량</span>' : '';
  const actionBtn = m.type === 'required'
    ? '<span class="tag-fixed-badge">고정</span>'
    : `<button class="toggle-attend ${m.attending ? 'on' : ''}" onclick="toggleAttend('${m.id}')">${m.attending ? '✅ 이번 참석' : '이번 참석'}</button>`;
  return `
    <div class="member-card">
      <div class="avatar ${m.gender}">${icon}</div>
      <div class="member-info">
        <div class="member-name">${esc(m.name)}</div>
        <div class="tags">${gTag}${rTag}${cTag}</div>
      </div>
      <div class="card-actions">
        ${actionBtn}
        <button class="btn-icon" onclick="openMemberEdit('${m.id}')">✏️</button>
        <button class="btn-icon" onclick="deleteMember('${m.id}')">🗑️</button>
      </div>
    </div>`;
}
function venueCardHTML(v, idx, total) {
  const icon = v.requiresCar ? '🚗📍' : '📍';
  const cTag = v.requiresCar ? '<span class="tag tag-car">차량 필요</span>' : '';
  return `
    <div class="venue-card">
      <div class="venue-priority-badge">${idx + 1}</div>
      <div class="venue-icon">${icon}</div>
      <div class="venue-info">
        <div class="venue-name">${esc(v.name)}</div>
        <div class="tags" style="margin-top:4px">${cTag}</div>
      </div>
      <div class="card-actions">
        <div class="venue-order-btns">
          <button class="btn-order" onclick="moveVenueUp('${v.id}')" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button class="btn-order" onclick="moveVenueDown('${v.id}')" ${idx === total - 1 ? 'disabled' : ''}>▼</button>
        </div>
        <button class="btn-icon" onclick="openVenueEdit('${v.id}')">✏️</button>
        <button class="btn-icon" onclick="deleteVenue('${v.id}')">🗑️</button>
      </div>
    </div>`;
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// ============================================================
// 확인 페이지 + 세션 제외
// ============================================================
const sessionExcluded     = new Set();
const sessionHiddenVenues = new Set();
function getPool() {
  const req = db.requiredMembers.filter(m => !sessionExcluded.has(m.id));
  const opt = db.optionalMembers.filter(m => m.attending && !sessionExcluded.has(m.id));
  return [...req, ...opt];
}
function getAllCandidates() {
  return [...db.requiredMembers, ...db.optionalMembers.filter(m => m.attending)];
}
function renderConfirm() {
  const all = getAllCandidates();
  document.getElementById('confirm-list').innerHTML = all.map(m => {
    const icon = m.gender === 'male' ? '👦' : '👧';
    const gTag = m.gender === 'male'
      ? '<span class="tag tag-m">남</span>'
      : '<span class="tag tag-f">여</span>';
    const cTag = m.hasCar ? '<span class="tag tag-car">🚗</span>' : '';
    const excl = sessionExcluded.has(m.id);
    return `
      <div class="member-card ${excl ? 'excluded' : ''}">
        <div class="avatar ${m.gender}">${icon}</div>
        <div class="member-info">
          <div class="member-name">${esc(m.name)}</div>
          <div class="tags">${gTag}${cTag}</div>
        </div>
        <button class="btn-exclude ${excl ? 'on' : ''}" onclick="toggleExclude('${m.id}')">
          ${excl ? '제외됨' : '제외'}
        </button>
      </div>`;
  }).join('');
  const pool = getPool();
  const el   = document.getElementById('combo-count');
  if (pool.length < 2) {
    el.className = 'combo-info warn';
    el.innerHTML = '<span class="combo-num">0</span>매칭 대상이 2명 이상이어야 합니다.';
    return;
  }
  const configs = getAllTeamSizeConfigs(pool.length);
  if (configs.length === 0) {
    el.className = 'combo-info warn';
    el.innerHTML = '<span class="combo-num">0</span>유효한 팀 구성이 없습니다. 성별 구성을 확인해주세요.';
    return;
  }
  el.className = 'size-config-wrap';
  el.innerHTML = `
    <p class="size-config-title">팀 구성 방식 선택</p>
    <div class="size-config-cards">
      ${configs.map(c => {
        const parts = [];
        if (c.threes > 0) parts.push(`3인 ${c.threes}팀`);
        if (c.twos   > 0) parts.push(`2인 ${c.twos}팀`);
        return `<button class="size-config-card" onclick="selectSizeConfig(${c.twos},${c.threes})">
          <span class="size-config-label">${parts.join(' + ')}</span>
          <span class="size-config-total">총 ${c.twos + c.threes}팀 · 탭해서 시작 →</span>
        </button>`;
      }).join('')}
    </div>`;
}
function toggleExclude(id) {
  sessionExcluded.has(id) ? sessionExcluded.delete(id) : sessionExcluded.add(id);
  renderConfirm();
}
// ============================================================
// 팀 규모 구성
// ============================================================
function getAllTeamSizeConfigs(n) {
  const configs = [];
  for (let b = Math.floor(n / 3); b >= 0; b--) {
    const rem = n - b * 3;
    if (rem % 2 === 0) configs.push({ twos: rem / 2, threes: b });
  }
  return configs;
}
function _tryBuildMixed(members, threes, twos) {
  const males   = shuffle(members.filter(m => m.gender === 'male'));
  const females = shuffle(members.filter(m => m.gender === 'female'));
  const teams   = [];
  for (let i = 0; i < threes; i++) {
    if (males.length >= 1 && females.length >= 2) {
      teams.push([males.splice(0,1)[0], females.splice(0,1)[0], females.splice(0,1)[0]]);
    } else if (males.length >= 2 && females.length >= 1) {
      teams.push([males.splice(0,1)[0], males.splice(0,1)[0], females.splice(0,1)[0]]);
    } else if (males.length >= 3) {
      teams.push(males.splice(0, 3));
    } else if (females.length >= 3) {
      teams.push(females.splice(0, 3));
    } else return null;
  }
  for (let i = 0; i < twos; i++) {
    if (males.length >= 2)        teams.push(males.splice(0, 2));
    else if (females.length >= 2) teams.push(females.splice(0, 2));
    else return null;
  }
  if (males.length > 0 || females.length > 0) return null;
  return teams;
}
function generateTeamsWithConfig(members, twos, threes) {
  const sizes = [...Array(threes).fill(3), ...Array(twos).fill(2)];
  function tryBuildRandom() {
    const s = shuffle(members); let idx = 0; const teams = [];
    for (const sz of sizes) {
      const team = s.slice(idx, idx + sz); idx += sz;
      if (!validTeam(team)) return null;
      teams.push(team);
    }
    return teams;
  }
  const hasLeader = t => t.some(m => m.role && m.role !== '성도');
  for (let t = 0; t < 800; t++) {
    const teams = _tryBuildMixed(members, threes, twos);
    if (teams && teams.every(hasLeader)) return teams;
  }
  for (let t = 0; t < 400; t++) {
    const teams = _tryBuildMixed(members, threes, twos);
    if (teams) return teams;
  }
  for (let t = 0; t < 1500; t++) {
    const teams = tryBuildRandom();
    if (teams && teams.every(hasLeader)) return teams;
  }
  for (let t = 0; t < 800; t++) {
    const teams = tryBuildRandom();
    if (teams) return teams;
  }
  return null;
}
function selectSizeConfig(twos, threes) {
  _initAC();
  const pool = getPool();
  const teams = generateTeamsWithConfig(pool, twos, threes);
  if (!teams) { toast('유효한 팀을 구성할 수 없습니다. 성별 구성을 확인해주세요.'); return; }
  const activeVenues = db.venues.filter(v => !sessionHiddenVenues.has(v.id));
  const result = assignVenues(teams, activeVenues);
  _manualCount = 0;
  _aniOffset   = 0;
  matchResult  = result;
  aniTeams     = result;
  aniIndex     = 0;
  aniCancelled = false;
  document.getElementById('teams-revealed').innerHTML = '';
  document.getElementById('slot-area').innerHTML = '';
  document.getElementById('matching-title').textContent = '🎯 매칭 중...';
  showPage('page-matching');
  setTimeout(animateNext, 800);
}
// ============================================================
// 매칭 알고리즘
// ============================================================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function teamSizes(n) {
  const sizes = [];
  let r = n;
  while (r > 0) {
    if (r <= 3)       { sizes.push(r); r = 0; }
    else if (r === 4) { sizes.push(2, 2); r = 0; }
    else              { sizes.push(3); r -= 3; }
  }
  return sizes;
}
function validTeam(team) {
  const m = team.filter(x => x.gender === 'male').length;
  const f = team.filter(x => x.gender === 'female').length;
  if (m === 1 && f === 1) return false;
  return true;
}
function generateTeams(members) {
  if (members.length < 2) throw new Error('매칭 대상이 2명 이상이어야 합니다.');
  const sizes  = teamSizes(members.length);
  const threes = sizes.filter(s => s === 3).length;
  const twos   = sizes.filter(s => s === 2).length;
  function tryBuildRandom() {
    const s = shuffle(members); let idx = 0; const teams = [];
    for (const sz of sizes) {
      const team = s.slice(idx, idx + sz); idx += sz;
      if (!validTeam(team)) return null;
      teams.push(team);
    }
    return teams;
  }
  const hasLeader = t => t.some(m => m.role && m.role !== '성도');
  for (let t = 0; t < 800; t++) {
    const teams = _tryBuildMixed(members, threes, twos);
    if (teams && teams.every(hasLeader)) return teams;
  }
  for (let t = 0; t < 400; t++) {
    const teams = _tryBuildMixed(members, threes, twos);
    if (teams) return teams;
  }
  for (let t = 0; t < 1500; t++) {
    const teams = tryBuildRandom();
    if (teams && teams.every(hasLeader)) return teams;
  }
  for (let t = 0; t < 800; t++) {
    const teams = tryBuildRandom();
    if (teams) return teams;
  }
  throw new Error('유효한 팀을 구성할 수 없습니다.\n인원 구성을 확인해 주세요.');
}
function assignVenues(teams, venues) {
  if (!venues.length) return teams.map(t => ({ members: t, venue: null }));
  const usedVenues = shuffle(venues.slice(0, teams.length));
  const carVenues  = usedVenues.filter(v => v.requiresCar);
  const freeVenues = usedVenues.filter(v => !v.requiresCar);
  const carTeams   = shuffle(teams.filter(t => t.some(m => m.hasCar)));
  if (carVenues.length > carTeams.length) {
    toast(`⚠️ 차량 필요 장소(${carVenues.length})가 차량 보유 팀(${carTeams.length})보다 많습니다.`);
  }
  const map = new Map();
  carVenues.forEach((v, i) => { if (carTeams[i]) map.set(carTeams[i], v); });
  const unassigned = shuffle(teams.filter(t => !map.has(t)));
  freeVenues.forEach((v, i) => { if (unassigned[i]) map.set(unassigned[i], v); });
  return teams.map(t => ({ members: t, venue: map.get(t) || null }));
}
// ============================================================
// 애니메이션
// ============================================================
let matchResult  = [];
let _manualCount = 0;
let _aniOffset   = 0;
let aniTeams     = [];
let aniIndex     = 0;
let aniCancelled = false;
const REEL_ITEM_H = 88;
const REEL_WIN_H  = 88;
function miniConfettiBurst(el) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const colors = ['#38bdf8','#7dd3fc','#0ea5e9','#fbbf24','#34d399','#fff'];
  for (let i = 0; i < 16; i++) {
    const dot = document.createElement('div');
    dot.className = 'confetti-dot';
    const angle = (i / 16) * Math.PI * 2 + Math.random() * .3;
    const dist  = 45 + Math.random() * 75;
    const size  = 5 + Math.random() * 7;
    dot.style.cssText = [
      `left:${cx}px`,`top:${cy}px`,`width:${size}px`,`height:${size}px`,
      `background:${colors[i % colors.length]}`,
      `--dx:${Math.cos(angle)*dist}px`,`--dy:${Math.sin(angle)*dist}px`,
      `animation:confettiFly .65s ease-out both`
    ].join(';');
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 700);
  }
}
function flashScreen() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:998;pointer-events:none;animation:screenFlash .5s ease-out both';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 550);
}
function startAnimation() {
  const pool = getPool();
  if (pool.length < 2) { toast('매칭 대상이 2명 이상이어야 합니다.'); return; }
  const configs = getAllTeamSizeConfigs(pool.length);
  if (!configs.length) { toast('유효한 팀 구성이 없습니다.'); return; }
  const cfg = configs[Math.floor(Math.random() * configs.length)];
  selectSizeConfig(cfg.twos, cfg.threes);
}
let _audioCtx = null;
function _initAC() {
  if (_audioCtx) { if (_audioCtx.state === 'suspended') _audioCtx.resume(); return; }
  try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
}
function _ac() { return _audioCtx; }
function playTick(speed) {
  try {
    const ac = _ac(); if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ac.currentTime + 0.05);
    const vol = 0.05 + speed * 0.05;
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.05);
    osc.connect(gain); gain.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + 0.05);
  } catch(e) {}
}
function playThud() {
  try {
    const ac = _ac(); if (!ac) return;
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(55, ac.currentTime + 0.14);
    gain.gain.setValueAtTime(0.2, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
    osc.connect(gain); gain.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + 0.18);
  } catch(e) {}
}
function playReveal() {
  try {
    const ac = _ac(); if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ac.currentTime);
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ac.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 1.0);
    osc.connect(gain); gain.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + 1.0);
  } catch(e) {}
}
function playFanfare() {
  try {
    const ac = _ac(); if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const osc1 = ac.createOscillator(), osc2 = ac.createOscillator(), gain = ac.createGain();
    osc1.type = 'sine'; osc2.type = 'triangle';
    const now = ac.currentTime;
    osc1.frequency.setValueAtTime(523.25, now); osc1.frequency.setValueAtTime(659.25, now + 0.15);
    osc1.frequency.setValueAtTime(783.99, now + 0.30); osc1.frequency.setValueAtTime(1046.50, now + 0.45);
    osc2.frequency.setValueAtTime(261.63, now); osc2.frequency.setValueAtTime(329.63, now + 0.15);
    osc2.frequency.setValueAtTime(392.00, now + 0.30); osc2.frequency.setValueAtTime(523.25, now + 0.45);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.05);
    gain.gain.setValueAtTime(0.22, now + 0.45);
    gain.gain.linearRampToValueAtTime(0, now + 1.5);
    osc1.connect(gain); osc2.connect(gain); gain.connect(ac.destination);
    osc1.start(); osc2.start(); osc1.stop(now + 1.5); osc2.stop(now + 1.5);
  } catch(e) {}
}
let _bgmOsc = null, _bgmGain = null, _bgmLfo = null, _bgmPlaying = false;
function startBgm() {
  if (_bgmPlaying) return;
  try {
    const ac = _ac(); if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    _bgmOsc = ac.createOscillator(); _bgmGain = ac.createGain(); _bgmLfo = ac.createOscillator();
    const lfoGain = ac.createGain(), filter = ac.createBiquadFilter();
    _bgmOsc.type = 'sine'; _bgmOsc.frequency.setValueAtTime(110, ac.currentTime);
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(400, ac.currentTime);
    _bgmLfo.type = 'sine'; _bgmLfo.frequency.setValueAtTime(0.4, ac.currentTime);
    lfoGain.gain.setValueAtTime(60, ac.currentTime);
    _bgmLfo.connect(lfoGain); lfoGain.connect(filter.frequency);
    _bgmGain.gain.setValueAtTime(0, ac.currentTime);
    _bgmGain.gain.linearRampToValueAtTime(0.08, ac.currentTime + 0.8);
    _bgmOsc.connect(filter); filter.connect(_bgmGain); _bgmGain.connect(ac.destination);
    _bgmOsc.start(); _bgmLfo.start(); _bgmPlaying = true;
  } catch(e) {}
}
function stopBgm() {
  if (!_bgmPlaying || !_bgmGain) return;
  try {
    const ac = _ac(); if (!ac) return;
    const now = ac.currentTime;
    _bgmGain.gain.cancelScheduledValues(now);
    _bgmGain.gain.setValueAtTime(_bgmGain.gain.value, now);
    _bgmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    const osc = _bgmOsc, lfo = _bgmLfo, g = _bgmGain;
    setTimeout(() => { try { osc.stop(); lfo.stop(); osc.disconnect(); g.disconnect(); } catch(e) {} }, 900);
    _bgmOsc = null; _bgmLfo = null; _bgmGain = null;
  } catch(e) {}
  _bgmPlaying = false;
}
let _venueBgm = null;
function startVenueBgm() {
  if (_venueBgm) return;
  try {
    const ac = _ac(); if (!ac) return;
    if (ac.state === 'suspended') ac.resume();

    const master = ac.createGain();
    master.gain.setValueAtTime(0, ac.currentTime);
    master.gain.linearRampToValueAtTime(0.6, ac.currentTime + 0.7);
    master.connect(ac.destination);

    // 에코로 공간감 추가
    const echo = ac.createDelay(1.0);
    echo.delayTime.value = 0.36;
    const echoGain = ac.createGain();
    echoGain.gain.value = 0.20;
    echo.connect(echoGain);
    echoGain.connect(echo);
    echoGain.connect(master);

    _venueBgm = { master, active: true };

    // 피아노/셀레스타 음색: 사인파 배음 + 빠른 어택 + 긴 릴리즈
    function playNote(freq, t, vol) {
      const env = ac.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(vol, t + 0.007);
      env.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.09);
      env.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
      env.connect(master);
      env.connect(echo);
      [[1, 1.0], [2, 0.30], [4, 0.07]].forEach(([h, w]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        g.gain.value = w; o.type = 'sine'; o.frequency.value = freq * h;
        o.connect(g); g.connect(env); o.start(t); o.stop(t + 2.1);
      });
    }

    // Cmaj7 → Am7 → Fmaj7 → G7 아르페지오 (우아한 클래식 진행)
    const chords = [
      [523.25, 659.25, 783.99, 987.77],  // Cmaj7
      [440.00, 523.25, 659.25, 783.99],  // Am7
      [349.23, 440.00, 523.25, 659.25],  // Fmaj7
      [392.00, 493.88, 587.33, 783.99],  // G7
    ];
    const step = 0.30;

    function tick(t) {
      if (!_venueBgm?.active) return;
      chords.forEach((chord, ci) => {
        const base = t + ci * chord.length * step;
        playNote(chord[0] / 2, base, 0.07); // 베이스음
        chord.forEach((freq, ni) => playNote(freq, base + ni * step, 0.10));
      });
      const loopLen = chords.length * chords[0].length * step;
      setTimeout(() => tick(t + loopLen), (loopLen - 0.2) * 1000);
    }
    tick(ac.currentTime + 0.3);
  } catch(e) {}
}
function stopVenueBgm() {
  if (!_venueBgm) return;
  _venueBgm.active = false;
  try {
    const ac = _ac(); if (!ac) return;
    const now = ac.currentTime;
    _venueBgm.master.gain.cancelScheduledValues(now);
    _venueBgm.master.gain.setValueAtTime(_venueBgm.master.gain.value, now);
    _venueBgm.master.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    const g = _venueBgm.master;
    setTimeout(() => { try { g.disconnect(); } catch(e) {} }, 700);
  } catch(e) {}
  _venueBgm = null;
}
function animateNext() {
  if (aniCancelled) { stopBgm(); return; }
  if (aniIndex >= aniTeams.length) {
    document.getElementById('slot-area').innerHTML = '';
    stopBgm();
    assignVenueCards(() => {
      if (aniCancelled) return;
      document.getElementById('matching-title').textContent = '💞 매칭 완료!';
      playFanfare(); launchConfetti();
      setTimeout(() => { if (!aniCancelled) showResults(); }, 2000);
    });
    return;
  }
  if (aniIndex === 0) startBgm();
  const { members: team, venue } = aniTeams[aniIndex];
  const teamNo = aniIndex + 1 + _aniOffset;
  const titleEl = document.getElementById('matching-title');
  titleEl.classList.remove('title-pop'); void titleEl.offsetWidth;
  titleEl.textContent = `🎯 팀 ${teamNo}`;
  titleEl.classList.add('title-pop');
  titleEl.addEventListener('animationend', () => titleEl.classList.remove('title-pop'), { once: true });
  const allNames = getPool().map(m => m.name);
  buildSlotUI(team, allNames, () => {
    if (aniCancelled) { stopBgm(); return; }
    flashScreen();
    setTimeout(() => {
      if (aniCancelled) return;
      revealTeam({ members: team, venue }, teamNo);
      aniIndex++;
      setTimeout(animateNext, 1600);
    }, 180);
  });
}
function buildSlotUI(team, allNames, onDone) {
  const slotArea = document.getElementById('slot-area');
  slotArea.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'slot-vs-row';
  const reelData = [];
  team.forEach((member, idx) => {
    const wrap = document.createElement('div'); wrap.className = 'slot-reel-wrap';
    const lbl = document.createElement('div'); lbl.className = 'slot-member-lbl'; lbl.textContent = `멤버 ${idx + 1}`;
    wrap.appendChild(lbl);
    const win = document.createElement('div'); win.className = 'slot-reel-win';
    const ft = document.createElement('div'); ft.className = 'slot-fade-top';
    const fb = document.createElement('div'); fb.className = 'slot-fade-bot';
    const cl = document.createElement('div'); cl.className = 'slot-center-line';
    const reel = document.createElement('div'); reel.className = 'slot-reel';
    const nameList = [];
    for (let i = 0; i < 16; i++) { shuffle([...allNames]).forEach(n => nameList.push(n)); }
    nameList.push(member.name);
    nameList.forEach(name => {
      const item = document.createElement('div'); item.className = 'slot-reel-item'; item.textContent = name; reel.appendChild(item);
    });
    win.appendChild(ft); win.appendChild(fb); win.appendChild(cl); win.appendChild(reel);
    wrap.appendChild(win); row.appendChild(wrap);
    reelData.push({ reel, win, member, nameList });
  });
  slotArea.appendChild(row);
  let doneCount = 0;
  reelData.forEach(({ reel, win, member, nameList }, idx) => {
    const delay = idx * 350, duration = 3200 + idx * 700;
    setTimeout(() => {
      if (aniCancelled) return;
      spinReel(reel, win, nameList, member.name, member.gender, duration, () => {
        doneCount++;
        if (doneCount === team.length && !aniCancelled) setTimeout(onDone, 500);
      });
    }, delay);
  });
}
function spinReel(reel, win, nameList, target, gender, duration, onDone) {
  const targetIdx = nameList.lastIndexOf(target);
  const finalY = -(targetIdx * REEL_ITEM_H) + (REEL_WIN_H / 2) - (REEL_ITEM_H / 2);
  let startTime = null, lastTickIdx = -999, lastTickTime = 0;
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
  function frame(ts) {
    if (aniCancelled) return;
    if (!startTime) startTime = ts;
    const elapsed = ts - startTime, progress = Math.min(elapsed / duration, 1);
    const eased = easeOutQuart(progress), currentY = finalY * eased;
    reel.style.transform = `translateY(${currentY.toFixed(2)}px)`;
    reel.style.filter = progress < 0.65 ? `blur(${((1 - progress / 0.65) * 3).toFixed(1)}px)` : 'none';
    const speed = Math.pow(1 - progress, 3), minInterval = 28 + (1 - speed) * 160;
    const tickIdx = Math.floor(-currentY / REEL_ITEM_H);
    if (tickIdx !== lastTickIdx && (ts - lastTickTime) >= minInterval) { lastTickIdx = tickIdx; lastTickTime = ts; playTick(speed); }
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      reel.style.transform = `translateY(${finalY}px)`; reel.style.filter = 'none';
      playThud(); miniConfettiBurst(win);
      win.classList.add('slot-win-pop');
      win.classList.add(gender === 'male' ? 'slot-glow-m' : 'slot-glow-f');
      setTimeout(() => win.classList.remove('slot-win-pop'), 500);
      if (onDone) setTimeout(onDone, 320);
    }
  }
  requestAnimationFrame(frame);
}
function revealTeam({ members }, no) {
  playReveal();
  const membersHTML = members.map(m => {
    const icon = m.gender === 'male' ? '👦' : '👧';
    return `<span class="name-pill name-pill-${m.gender}">${icon} ${esc(m.name)}</span>`;
  }).join('');
  const card = document.createElement('div');
  card.className = 'team-chip';
  card.innerHTML = `<div class="team-chip-no">팀 ${no}</div><div class="team-chip-members">${membersHTML}</div>`;
  const container = document.getElementById('teams-revealed');
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('team-chip-in')));
  document.getElementById('slot-area').innerHTML = '';
}
function assignVenueCards(onDone) {
  const venueCount = aniTeams.filter(t => t.venue).length;
  if (!venueCount) { if (onDone) onDone(); return; }
  const titleEl = document.getElementById('matching-title');
  titleEl.classList.remove('title-pop'); void titleEl.offsetWidth;
  titleEl.textContent = '📍 장소 배치!';
  titleEl.classList.add('title-pop');
  titleEl.addEventListener('animationend', () => titleEl.classList.remove('title-pop'), { once: true });
  startVenueBgm();
  const container = document.getElementById('teams-revealed');
  const cards = container.querySelectorAll('.team-chip');
  let delay = 500;
  aniTeams.forEach((result, i) => {
    if (!result.venue) return;
    const card = cards[i]; if (!card) return;
    setTimeout(() => {
      if (aniCancelled) return;
      card.classList.add('team-chip-spotlight');
      container.scrollTo({ top: card.offsetTop - 16, behavior: 'smooth' });
    }, delay);
    setTimeout(() => {
      if (aniCancelled) return;
      card.classList.remove('team-chip-spotlight');
      const pill = document.createElement('div');
      pill.className = 'venue-pill venue-pill-anim';
      pill.innerHTML = `📍 <strong>${esc(result.venue.name)}</strong>${result.venue.requiresCar ? ' 🚗' : ''}`;
      card.appendChild(pill); playReveal();
      requestAnimationFrame(() => {
        const r = pill.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const colors = ['#38bdf8','#7dd3fc','#fbbf24','#34d399','#fff'];
        for (let k = 0; k < 10; k++) {
          const dot = document.createElement('div'); dot.className = 'confetti-dot';
          const angle = (k / 10) * Math.PI * 2, dist = 30 + Math.random() * 45, size = 4 + Math.random() * 5;
          dot.style.cssText = [`left:${cx}px`,`top:${cy}px`,`width:${size}px`,`height:${size}px`,`background:${colors[k % colors.length]}`,`--dx:${Math.cos(angle)*dist}px`,`--dy:${Math.sin(angle)*dist}px`,`animation:confettiFly .6s ease-out both`].join(';');
          document.body.appendChild(dot); setTimeout(() => dot.remove(), 650);
        }
      });
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }, delay + 420);
    delay += 900;
  });
  setTimeout(() => {
    stopVenueBgm();
    setTimeout(() => { if (!aniCancelled && onDone) onDone(); }, 400);
  }, delay + 300);
}
function launchConfetti() {
  const container = document.getElementById('page-matching');
  const colors = ['#38bdf8','#34d399','#fbbf24','#f472b6','#ffffff','#7dd3fc'];
  for (let i = 0; i < 36; i++) {
    const el = document.createElement('div'); el.className = 'confetti-dot';
    const angle = Math.random() * Math.PI * 2, dist = 80 + Math.random() * 200;
    const size = 7 + Math.random() * 9, delay = Math.random() * 0.5, dur = 1.0 + Math.random() * 0.8;
    const color = colors[i % colors.length], dx = (Math.cos(angle) * dist).toFixed(1), dy = (Math.sin(angle) * dist).toFixed(1);
    el.style.cssText = `width:${size}px;height:${size}px;background:${color};left:50%;top:40%;animation:confettiFly ${dur}s ${delay}s cubic-bezier(.22,.61,.36,1) forwards;--dx:${dx}px;--dy:${dy}px;`;
    container.appendChild(el); setTimeout(() => el.remove(), (dur + delay + 0.2) * 1000);
  }
}
// ============================================================
// 결과
// ============================================================
function showResults() { showPage('page-results'); renderResults(); }
function renderResults() {
  const hasRandom = _manualCount > 0 && matchResult.length > _manualCount;
  document.getElementById('results-list').innerHTML = matchResult.map(({ members, venue }, i) => {
    const membersHTML = members.map(m => {
      const icon = m.gender === 'male' ? '👦' : '👧';
      return `<div class="result-member">${icon} <strong>${esc(m.name)}</strong></div>`;
    }).join('');
    const venueHTML = venue
      ? `<button class="result-venue result-venue-btn" onclick="pickResultVenue(${i})">📍 <strong>${esc(venue.name)}</strong>${venue.requiresCar ? ' 🚗' : ''}<span class="venue-change">변경</span></button>`
      : `<button class="result-venue result-venue-btn" onclick="pickResultVenue(${i})">📍 <span class="venue-unset">장소 선택 →</span></button>`;
    const divider = (hasRandom && i === _manualCount) ? `<div class="result-divider">🎰 랜덤 배정</div>` : '';
    const badge = hasRandom
      ? (i < _manualCount ? '<span class="team-badge badge-fixed">직접</span>' : '<span class="team-badge badge-random">랜덤</span>') : '';
    return `${divider}<div class="result-card"><div class="result-team-no">팀 ${i + 1} ${badge}</div><div class="result-members">${membersHTML}</div>${venueHTML}</div>`;
  }).join('');
}
function skipMatching() { aniCancelled = true; stopBgm(); stopVenueBgm(); showResults(); }
function restartMatching() { aniCancelled = true; showPage('page-confirm'); }
// ============================================================
// 장소 픽커
// ============================================================
let _venuePick_cb = null;
function openVenuePicker(callback) {
  _venuePick_cb = callback;
  const venues = [{ id: '__none__', name: '미배정', requiresCar: false }, ...db.venues];
  document.getElementById('venue-pick-list').innerHTML = venues.map(v =>
    `<button class="pick-item" onclick="applyVenuePick('${v.id}')">📍 ${esc(v.name)}${v.requiresCar ? ' 🚗' : ''}</button>`
  ).join('');
  openModal('modal-venue-pick');
}
function applyVenuePick(venueId) {
  const venue = venueId === '__none__' ? null : db.venues.find(v => v.id === venueId) || null;
  closeModal('modal-venue-pick');
  if (_venuePick_cb) { _venuePick_cb(venue); _venuePick_cb = null; }
}
function pickResultVenue(teamIdx) {
  openVenuePicker(venue => { matchResult[teamIdx].venue = venue; renderResults(); });
}
// ============================================================
// 직접 배정
// ============================================================
let manualTeams = [];
let _memberPick_cb = null;
function openManualMode() {
  const pool = getPool();
  if (pool.length < 2) { toast('매칭 대상이 2명 이상이어야 합니다.'); return; }
  manualTeams = [{ members: [], venue: null }];
  showPage('page-manual');
}
function renderManual() {
  const pool = getPool();
  const assigned = new Set(manualTeams.flatMap(t => t.members.map(m => m.id)));
  const unassigned = pool.filter(m => !assigned.has(m.id));
  document.getElementById('manual-pool').innerHTML = unassigned.length === 0
    ? '<span class="home-names-empty">모두 배정되었습니다.</span>'
    : unassigned.map(m => `<span class="name-chip">${esc(m.name)}</span>`).join('');
  document.getElementById('manual-teams').innerHTML = manualTeams.map((team, i) => {
    const membersHTML = team.members.map((m, mi) =>
      `<span class="name-chip name-chip-rm" onclick="removeManualMember(${i},${mi})">${esc(m.name)} ✕</span>`
    ).join('');
    const venueLabel = team.venue ? `📍 ${esc(team.venue.name)}` : '📍 장소 선택';
    const rmBtn = manualTeams.length > 1 ? `<button class="btn-rm-team" onclick="removeManualTeam(${i})" title="팀 삭제">✕</button>` : '';
    return `
      <div class="manual-team-card">
        <div class="manual-team-header">
          <span class="manual-team-title">팀 ${i + 1}</span>
          <button class="btn-venue-pick" onclick="pickManualVenue(${i})">${venueLabel}</button>
          ${rmBtn}
        </div>
        <div class="manual-team-members">
          ${membersHTML}
          <button class="btn-add-member" onclick="pickManualMember(${i})">+ 추가</button>
        </div>
      </div>`;
  }).join('');
}
function addManualTeam() { manualTeams.push({ members: [], venue: null }); renderManual(); }
function removeManualTeam(i) { manualTeams.splice(i, 1); renderManual(); }
function pickManualMember(teamIdx) {
  const pool = getPool();
  const assigned = new Set(manualTeams.flatMap(t => t.members.map(m => m.id)));
  const unassigned = pool.filter(m => !assigned.has(m.id));
  if (unassigned.length === 0) { toast('배정할 멤버가 없습니다.'); return; }
  _memberPick_cb = memberId => {
    const member = pool.find(m => m.id === memberId);
    if (member) { manualTeams[teamIdx].members.push(member); renderManual(); }
  };
  document.getElementById('member-pick-list').innerHTML = unassigned.map(m =>
    `<button class="pick-item" onclick="applyMemberPick('${m.id}')">${esc(m.name)}</button>`
  ).join('');
  openModal('modal-member-pick');
}
function applyMemberPick(memberId) {
  closeModal('modal-member-pick');
  if (_memberPick_cb) { _memberPick_cb(memberId); _memberPick_cb = null; }
}
function removeManualMember(teamIdx, memberIdx) { manualTeams[teamIdx].members.splice(memberIdx, 1); renderManual(); }
function pickManualVenue(teamIdx) { openVenuePicker(venue => { manualTeams[teamIdx].venue = venue; renderManual(); }); }
function finalizeManual() {
  _initAC();
  const fixedTeams = manualTeams.filter(t => t.members.length > 0);
  const pool = getPool();
  const assigned = new Set(fixedTeams.flatMap(t => t.members.map(m => m.id)));
  const remaining = pool.filter(m => !assigned.has(m.id));
  if (remaining.length === 1) { toast('나머지 1명은 팀을 구성할 수 없습니다. 기존 팀에 추가해주세요.'); return; }
  let randomResults = [];
  if (remaining.length >= 2) {
    try { const teams = generateTeams(remaining); randomResults = assignVenues(teams, db.venues.filter(v => !sessionHiddenVenues.has(v.id))); }
    catch(e) { toast(e.message); return; }
  }
  _manualCount = fixedTeams.length;
  matchResult = [...fixedTeams.map(t => ({ members: t.members, venue: t.venue })), ...randomResults];
  if (randomResults.length === 0) { showResults(); return; }
  aniTeams = randomResults; aniIndex = 0; aniCancelled = false; _aniOffset = _manualCount;
  document.getElementById('teams-revealed').innerHTML = '';
  document.getElementById('slot-area').innerHTML = '';
  document.getElementById('matching-title').textContent = '🎯 나머지 랜덤 매칭 중...';
  showPage('page-matching');
  setTimeout(animateNext, 800);
}
// ============================================================
// 멤버 모달
// ============================================================
let _addMemberType = 'optional';
function openRequiredModal() { _addMemberType = 'required'; openMemberModal(); }
function openOptionalModal() { _addMemberType = 'optional'; openMemberModal(); }
function openMemberModal() {
  document.getElementById('modal-member-title').textContent = '멤버 추가';
  document.getElementById('m-id').value    = '';
  document.getElementById('m-name').value  = '';
  document.getElementById('m-role').value  = '성도';
  document.getElementById('m-car').checked = false;
  document.querySelectorAll('input[name="m-gender"]').forEach(r => r.checked = false);
  openModal('modal-member');
}
function openMemberEdit(id) {
  const m = db.requiredMembers.find(x => x.id === id) || db.optionalMembers.find(x => x.id === id);
  if (!m) return;
  _addMemberType = m.type;
  document.getElementById('modal-member-title').textContent = '멤버 수정';
  document.getElementById('m-id').value    = id;
  document.getElementById('m-name').value  = m.name;
  document.getElementById('m-role').value  = m.role || '성도';
  document.getElementById('m-car').checked = m.hasCar;
  const radio = document.querySelector(`input[name="m-gender"][value="${m.gender}"]`);
  if (radio) radio.checked = true;
  openModal('modal-member');
}
async function saveMember(e) {
  e.preventDefault();
  const id     = document.getElementById('m-id').value;
  const name   = document.getElementById('m-name').value.trim();
  const gender = document.querySelector('input[name="m-gender"]:checked')?.value;
  const role   = document.getElementById('m-role').value;
  const hasCar = document.getElementById('m-car').checked;
  if (!name || !gender) { toast('이름과 성별을 입력해 주세요.'); return; }
  let member;
  if (id) {
    member = db.requiredMembers.find(x => x.id === id) || db.optionalMembers.find(x => x.id === id);
    if (member) Object.assign(member, { name, gender, role, hasCar });
  } else {
    member = { id: genId(), name, gender, role, hasCar, attending: false, type: _addMemberType };
    if (_addMemberType === 'required') db.requiredMembers.push(member);
    else db.optionalMembers.push(member);
  }
  try { await _upsertMember(member); }
  catch(err) { toast('저장 실패. 다시 시도해주세요.'); return; }
  closeModal('modal-member');
  if (member.type === 'required') renderRequired(); else renderOptional();
  refreshHome();
  toast(id ? '수정되었습니다.' : '추가되었습니다.');
}
async function deleteMember(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  let found = false;
  let idx = db.requiredMembers.findIndex(m => m.id === id);
  if (idx !== -1) { db.requiredMembers.splice(idx, 1); found = true; }
  else {
    idx = db.optionalMembers.findIndex(m => m.id === id);
    if (idx !== -1) { db.optionalMembers.splice(idx, 1); found = true; }
  }
  if (!found) return;
  try { await _deleteMember(id); }
  catch(err) { toast('삭제 실패. 다시 시도해주세요.'); return; }
  renderRequired(); renderOptional(); refreshHome();
  toast('삭제되었습니다.');
}
// ============================================================
// 장소 모달
// ============================================================
function openVenueModal() {
  document.getElementById('modal-venue-title').textContent = '장소 추가';
  document.getElementById('v-id').value    = '';
  document.getElementById('v-name').value  = '';
  document.getElementById('v-car').checked = false;
  openModal('modal-venue');
}
function openVenueEdit(id) {
  const v = db.venues.find(x => x.id === id);
  if (!v) return;
  document.getElementById('modal-venue-title').textContent = '장소 수정';
  document.getElementById('v-id').value    = id;
  document.getElementById('v-name').value  = v.name;
  document.getElementById('v-car').checked = v.requiresCar;
  openModal('modal-venue');
}
async function saveVenue(e) {
  e.preventDefault();
  const id = document.getElementById('v-id').value;
  const name = document.getElementById('v-name').value.trim();
  const requiresCar = document.getElementById('v-car').checked;
  if (!name) { toast('장소명을 입력해 주세요.'); return; }
  let venue;
  if (id) {
    venue = db.venues.find(x => x.id === id);
    if (venue) Object.assign(venue, { name, requiresCar });
  } else {
    venue = { id: genId(), name, requiresCar };
    db.venues.push(venue);
  }
  try { await _upsertVenue(venue); }
  catch(err) { toast('저장 실패. 다시 시도해주세요.'); return; }
  closeModal('modal-venue');
  renderVenues(); refreshHome();
  toast(id ? '수정되었습니다.' : '장소가 추가되었습니다.');
}
function moveVenueUp(id) {
  const idx = db.venues.findIndex(v => v.id === id);
  if (idx <= 0) return;
  [db.venues[idx - 1], db.venues[idx]] = [db.venues[idx], db.venues[idx - 1]];
  _saveVenueOrder(); renderVenues(); refreshHome();
}
function moveVenueDown(id) {
  const idx = db.venues.findIndex(v => v.id === id);
  if (idx < 0 || idx >= db.venues.length - 1) return;
  [db.venues[idx], db.venues[idx + 1]] = [db.venues[idx + 1], db.venues[idx]];
  _saveVenueOrder(); renderVenues(); refreshHome();
}
async function deleteVenue(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  const idx = db.venues.findIndex(v => v.id === id);
  if (idx === -1) return;
  db.venues.splice(idx, 1);
  try { await _deleteVenue(id); }
  catch(err) { toast('삭제 실패. 다시 시도해주세요.'); return; }
  renderVenues(); refreshHome();
  toast('삭제되었습니다.');
}
// ============================================================
// 모달 유틸
// ============================================================
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function onOverlayClick(e, id) { if (e.target === e.currentTarget) closeModal(id); }
// ============================================================
// 관리자 비밀번호
// ============================================================
function openAdminLogin() {
  const input = document.getElementById('admin-pw-input');
  input.value = '';
  document.getElementById('admin-pw-error').style.display = 'none';
  input.classList.remove('shake');
  openModal('modal-admin-login');
  setTimeout(() => input.focus(), 120);
}
function submitAdminLogin(e) {
  e.preventDefault();
  const input = document.getElementById('admin-pw-input');
  if (input.value === getAdminPw()) {
    closeModal('modal-admin-login'); showPage('page-admin');
  } else {
    const errEl = document.getElementById('admin-pw-error');
    errEl.style.display = 'block';
    input.value = '';
    input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); input.focus();
  }
}
function openChangePw() {
  ['cp-current','cp-new','cp-confirm'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('cp-error').style.display = 'none';
  openModal('modal-change-pw');
  setTimeout(() => document.getElementById('cp-current').focus(), 120);
}
function submitChangePw(e) {
  e.preventDefault();
  const cur = document.getElementById('cp-current').value;
  const nw  = document.getElementById('cp-new').value;
  const conf = document.getElementById('cp-confirm').value;
  const errEl = document.getElementById('cp-error');
  if (cur !== getAdminPw()) { errEl.textContent = '현재 비밀번호가 틀렸습니다.'; errEl.style.display = 'block'; return; }
  if (nw.length < 1) { errEl.textContent = '새 비밀번호를 입력해주세요.'; errEl.style.display = 'block'; return; }
  if (nw !== conf) { errEl.textContent = '새 비밀번호가 일치하지 않습니다.'; errEl.style.display = 'block'; return; }
  setAdminPw(nw); closeModal('modal-change-pw'); toast('비밀번호가 변경되었습니다.');
}
// ============================================================
// 토스트
// ============================================================
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
// ============================================================
// 초기화
// ============================================================
(async () => {
  await loadDB();
  showPage('page-home');
})();
