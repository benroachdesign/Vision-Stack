/* ============================================================
   VISION STACK — App State Machine + Multiplayer Layer
   ============================================================ */

// ============================================================
// SESSION (multiplayer context — separate from workshop state)
// ============================================================

const session = {
  mode:     null,     // null (lobby) | 'solo' | 'host' | 'participant'
  socket:   null,
  roomCode: null,
  myId:     null,     // socket.id
  myName:   '',
  myColor:  '#5b5bd6',
  presence: [],       // [{ id, name, color, isFacilitator }]

  // Participant-side live state (populated from server events)
  live: {
    phase:      'principles',
    teamName:   '',
    ideas:      {
      principles: [],
      purpose:    { who: [], struggle: [], change: [] },
      mission:    [],
      strategy:   { ux: [], technical: [], process: [], custom: [] },
      customLabel: 'Culture & People',
      okrs:       { objectives: ['', ''], metrics: [] }
    },
    aiResults:  { principles: null, purpose: null, mission: null, strategy: null, okrs: null },
    selections: { principles: [], purpose: null, mission: null, strategy: [], okrs: [[], []] },
    stack:      { principles: [], purpose: null, mission: null, strategy: [], okrs: [] },
    status:     'idle'  // 'synthesizing' | 'idle'
  }
};


// ============================================================
// WORKSHOP STATE (source of truth for solo + host facilitator)
// ============================================================

const state = {
  phase: 'principles',
  teamName: '',
  facilitator: '',

  stack: {
    principles: [],
    purpose:    null,
    mission:    null,
    strategy:   [],
    okrs:       []
  },

  principles: { ideas: [''],    aiResult: null, selected: new Set() },
  purpose:    { who: [''],      struggle: [''], change: [''], aiResult: null, selectedIdx: null },
  mission:    { drafts: [{ solution: '', audience: '', outcome: '' }], aiResult: null, selectedIdx: null },
  strategy:   { clusters: { ux: [''], technical: [''], process: [''], custom: [''] }, customLabel: 'Culture & People', aiResult: null, selected: new Set() },
  okrs:       { objectives: ['', ''], metricIdeas: [''], aiResult: null, selected: [new Set(), new Set()] }
};

const PHASES = ['setup', 'principles', 'purpose', 'mission', 'strategy', 'okrs', 'output'];


// ============================================================
// IDEA HELPERS (handle both string (solo) and object (mp))
// ============================================================

function ideaValue(item)     { return typeof item === 'string' ? item : (item?.value ?? ''); }
function ideaId(item, idx)   { return typeof item === 'object' && item?.id ? item.id : String(idx); }
function ideaColor(item)     { return typeof item === 'object' ? item?.ownerColor : null; }
function ideaOwnerName(item) { return typeof item === 'object' ? item?.ownerName : null; }
function ideaOwnerId(item)   { return typeof item === 'object' ? item?.ownerSocketId : null; }
function isMineOrSolo(item)  {
  if (session.mode === 'solo' || session.mode === 'host') return true;
  if (session.mode === 'participant') return ideaOwnerId(item) === session.myId;
  return true;
}

// Get the ideas array for a given phase+slot from state (host/solo)
function getStateIdeasArray(phase, slot) {
  if (phase === 'principles') return state.principles.ideas;
  if (phase === 'purpose')    return state.purpose[slot];
  if (phase === 'strategy')   return state.strategy.clusters[slot];
  if (phase === 'okrs')       return state.okrs.metricIdeas;
  if (phase === 'mission')    return state.mission.ideas; // not used currently
  return null;
}

// Get the ideas array for participant live state
function getLiveIdeasArray(phase, slot) {
  const l = session.live.ideas;
  if (phase === 'principles') return l.principles;
  if (phase === 'purpose')    return l.purpose[slot];
  if (phase === 'strategy')   return l.strategy[slot];
  if (phase === 'okrs')       return l.okrs.metrics;
  if (phase === 'mission')    return l.mission;
  return null;
}


// ============================================================
// MOCK AI
// ============================================================

function mockAISynthesis(phase) {
  switch (phase) {
    case 'principles':
      return [
        { title: 'Assume Positive Intent',    description: 'Default to curiosity over judgment — treat every interaction as an opportunity to understand, not to win.' },
        { title: 'Own It End-to-End',          description: 'Take full responsibility for outcomes, not just outputs. Follow through until the problem is actually solved.' },
        { title: 'Clarity Over Cleverness',    description: 'Favor clear, simple communication over impressive-sounding complexity in both code and conversation.' },
        { title: 'Move With Purpose',          description: 'Bias toward action, but not at the cost of direction — know why you\'re moving fast before you accelerate.' },
        { title: 'Make the Invisible Visible', description: 'Surface blockers, risks, and context early and often. Hidden problems compound; shared problems shrink.' }
      ];
    case 'purpose':
      return [
        'To empower the people who build the future by making the hardest design decisions feel effortless.',
        'To create the clarity and tools that let passionate teams do the most meaningful work of their careers.',
        'To bridge the gap between imagination and reality — so that great ideas actually ship.',
        'To be the steady foundation that ambitious teams build on when everything else feels uncertain.',
        'To make strategic design leadership accessible to every team, not just those with the biggest budgets.',
        'To ensure no brilliant product idea fails because the team behind it lacked alignment.',
        'To accelerate human progress by helping the builders within it move with conviction and speed.'
      ];
    case 'mission':
      return [
        'We build a structured facilitation platform for design and product teams so they can align on strategy in hours, not months.',
        'We build AI-powered workshop tools for cross-functional leaders so they can transform ambiguity into actionable team identity.',
        'We build collaborative clarity frameworks for forward-thinking organizations so they can move faster with less friction and more focus.',
        'We build intelligent alignment experiences for high-growth teams so they can establish a shared vision that actually guides daily decisions.'
      ];
    case 'strategy':
      return {
        pillars: [
          { title: 'AI-First Facilitation',   description: 'Embed AI synthesis at every step to compress decision-making from days to minutes without sacrificing depth or quality.' },
          { title: 'Opinionated Simplicity',   description: 'Design every interaction with radical constraints — fewer inputs, clearer outputs, zero cognitive overhead for the facilitator.' },
          { title: 'Artifact-Driven Outcomes', description: 'Every session produces a polished, shareable document that outlives the meeting and can be socialized across the org instantly.' }
        ],
        critique: 'Strong instincts, but these pillars risk being output-focused rather than capability-focused. "AI-First Facilitation" may over-index on the tool vs. the outcome — what\'s the plan when AI is wrong? There\'s no pillar for trust or validation loops. "Opinionated Simplicity" will polarize early adopters; be intentional about who you\'re willing to lose. Critically, none of these pillars address distribution or growth. You can build the best alignment tool in the world and have it die quietly. Consider adding a "Community & Champions" growth pillar.'
      };
    case 'okrs': {
      const obj0 = state.okrs.objectives[0] || session.live.ideas.okrs.objectives[0] || 'Objective 1';
      const obj1 = state.okrs.objectives[1] || session.live.ideas.okrs.objectives[1];
      const results = [{ objective: obj0, keyResults: [
        'Increase workshop completion rate from baseline to 80% within Q2.',
        'Achieve average post-session NPS of 50+ across 10 pilot workshops.',
        'Reduce average time-to-aligned-output from 4 hours to under 2.5 hours by end of quarter.',
        'Onboard 3 enterprise pilot teams with at least 1 repeat session each.'
      ]}];
      if (obj1 && obj1.trim()) {
        results.push({ objective: obj1, keyResults: [
          'Ship AI synthesis integration with live API for 2 phases by end of month.',
          'Reduce facilitator session prep time from 60 minutes to under 15 minutes.',
          'Achieve a Lighthouse performance score of 90+ on the application.',
          'Pass a WCAG 2.1 AA accessibility audit with zero critical failures before launch.'
        ]});
      }
      return results;
    }
    default: return [];
  }
}


// ============================================================
// RENDER ENGINE
// ============================================================

function render() {
  renderBreadcrumb();
  renderPresenceBar();
  renderSidebar();
  renderPhaseContent();
}

// Focus-safe render for socket-triggered updates
function renderFromSocket() {
  const active   = document.activeElement;
  const ref      = active?.dataset?.ideaRef;
  const selStart = active?.selectionStart;
  render();
  if (ref) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-idea-ref="${ref}"]`);
      if (el) { el.focus(); try { el.setSelectionRange(selStart, selStart); } catch(e) {} }
    });
  }
}

function renderBreadcrumb() {
  if (session.mode === null || session.mode === 'participant') return;
  const items      = document.querySelectorAll('.breadcrumb-item');
  const currentIdx = PHASES.indexOf(state.phase);
  items.forEach((el, i) => {
    el.classList.remove('active', 'completed');
    if (i === currentIdx) {
      el.classList.add('active');
      el.style.cursor = '';
      el.onclick = null;
    } else if (i < currentIdx) {
      el.classList.add('completed');
      el.style.cursor = 'pointer';
      el.onclick = () => goToPhase(el.dataset.phase);
    } else {
      el.style.cursor = '';
      el.onclick = null;
    }
  });
}

function renderPresenceBar() {
  const bar = document.getElementById('presenceBar');
  if (!bar) return;

  if ((session.mode !== 'host' && session.mode !== 'participant') || session.presence.length === 0) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  const avatars = session.presence.map(p => `
    <div class="presence-avatar" style="--avatar-color:${p.color}" title="${escapeHtml(p.name)}${p.isFacilitator ? ' (facilitator)' : ''}">
      ${escapeHtml(p.name.charAt(0).toUpperCase())}
      ${p.isFacilitator ? '<span class="presence-host-dot"></span>' : ''}
    </div>`).join('');

  bar.innerHTML = `
    <div class="presence-room-code" id="copyRoomCode" title="Click to copy room code" style="cursor:pointer">
      <span class="presence-code-label">Room</span>
      <span class="presence-code-value" id="roomCodeDisplay">${session.roomCode}</span>
    </div>
    <div class="presence-divider"></div>
    <div class="presence-avatars">${avatars}</div>
    <span class="presence-count">${session.presence.length} online</span>`;

  document.getElementById('copyRoomCode')?.addEventListener('click', () => {
    navigator.clipboard.writeText(session.roomCode).then(() => {
      const el = document.getElementById('roomCodeDisplay');
      if (!el) return;
      const orig = el.textContent;
      el.textContent = 'Copied!';
      el.style.letterSpacing = '0';
      setTimeout(() => { el.textContent = orig; el.style.letterSpacing = ''; }, 1500);
    });
  });
}

function renderSidebar() {
  // In participant mode, drive sidebar from live state
  const stackData = session.mode === 'participant' ? session.live.stack : state.stack;
  const layers = ['principles', 'purpose', 'mission', 'strategy', 'okrs'];
  let count = 0;

  layers.forEach(key => {
    const layer   = document.getElementById(`layer-${key}`);
    const content = document.getElementById(`layer-${key}-content`);
    if (!layer || !content) return;
    const data = stackData[key];
    const has  = Array.isArray(data) ? data.length > 0 : !!data;

    if (has) {
      count++;
      layer.classList.add('populated');
      content.classList.remove('empty');
      content.innerHTML = renderSidebarLayer(key, data);

      // Inject edit button (solo/host only, not participant)
      if (session.mode !== 'participant') {
        const label = layer.querySelector('.layer-label');
        if (label && !label.querySelector('.layer-edit-btn')) {
          const btn = document.createElement('button');
          btn.className = 'layer-edit-btn';
          btn.textContent = 'Edit';
          btn.addEventListener('click', e => { e.stopPropagation(); goToPhase(key); });
          label.appendChild(btn);
        }
      }
    } else {
      layer.classList.remove('populated');
      content.classList.add('empty');
      content.innerHTML = '<p class="layer-empty-text">Not yet defined</p>';
      layer.querySelector('.layer-edit-btn')?.remove();
    }
  });

  document.getElementById('progressBar').style.width = Math.round(count / 5 * 100) + '%';
  document.getElementById('progressLabel').textContent =
    `${count} of 5 layer${count !== 1 ? 's' : ''} complete`;
}

function renderSidebarLayer(key, data) {
  if (key === 'principles' || key === 'strategy') {
    return data.map(p => `<span class="layer-principle-chip">${escapeHtml(p.title)}</span>`).join('');
  }
  if (key === 'purpose' || key === 'mission') {
    return `<p class="layer-statement-text">${escapeHtml(data)}</p>`;
  }
  if (key === 'okrs') {
    return data.map(o => `
      <div class="layer-okr-item">
        <p class="layer-okr-obj">${escapeHtml(o.objective)}</p>
        <p class="layer-okr-krs">${o.keyResults.length} KR${o.keyResults.length !== 1 ? 's' : ''}</p>
      </div>`).join('');
  }
  return '';
}

function renderPhaseContent() {
  const el = document.getElementById('phaseContent');
  if (!el) return;

  // LOBBY
  if (session.mode === null) {
    el.innerHTML = renderLobby();
    attachLobbyListeners();
    return;
  }

  // PARTICIPANT VIEW
  if (session.mode === 'participant') {
    el.innerHTML = renderParticipantView();
    attachParticipantListeners();
    return;
  }

  // FACILITATOR (solo or host) — full workshop flow
  const map = {
    setup:      renderSetup,
    principles: renderPrinciples,
    purpose:    renderPurpose,
    mission:    renderMission,
    strategy:   renderStrategy,
    okrs:       renderOKRs,
    output:     renderOutput
  };
  el.innerHTML = (map[state.phase] || renderSetup)();
  attachEventListeners();
}


// ============================================================
// LOBBY
// ============================================================

function renderLobby() {
  const isOnServer = window.location.protocol !== 'file:';
  const noServerNote = !isOnServer
    ? `<div class="lobby-server-note">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
        <span>
          <strong>Multiplayer &amp; AI require the Node server.</strong><br/>
          Open a terminal in this folder and run:<br/>
          <code>ANTHROPIC_API_KEY=sk-ant-… npm start</code><br/>
          Then visit <code>http://localhost:3000</code>
        </span>
      </div>`
    : `<div id="lobbyAiStatus" style="display:inline-flex;align-items:center;gap:7px;padding:5px 13px;border-radius:99px;border:1px solid #e4e4e7;background:#fafafa;font-size:12px;color:#71717a;margin-top:6px;transition:all .3s">
        <span id="lobbyAiDot" style="width:7px;height:7px;border-radius:50%;background:#d4d4d8;flex-shrink:0;transition:background .4s"></span>
        <span id="lobbyAiStatusText">Checking AI status…</span>
      </div>`;

  return `
    <div class="lobby-view">
      <div class="lobby-hero">
        <div class="setup-logo-mark" style="margin-bottom:28px">
          <div class="setup-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div class="setup-logo-wordmark">Vision Stack</div>
          <span class="setup-logo-version">Workshop</span>
        </div>
        <h1 class="phase-title" style="margin-bottom:10px">Your workshop,<br/>your room.</h1>
        <p class="phase-description">Host a live session for your team or run through it solo. No FigJam required.</p>
        ${noServerNote}
      </div>

      <div class="lobby-cards">

        <!-- HOST -->
        <div class="lobby-card lobby-card-host">
          <div class="lobby-card-icon" style="background:linear-gradient(135deg,var(--accent),#a78bfa)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <h3 class="lobby-card-title">Host a Workshop</h3>
          <p class="lobby-card-desc">Start a live session. Share a 4-letter room code and your team joins in real time.</p>
          <div class="lobby-fields">
            <input class="field-input" id="lobbyTeamName" type="text" placeholder="Team name" value="${escapeHtml(state.teamName)}" autocomplete="off" ${!isOnServer ? 'disabled' : ''} />
            <input class="field-input" id="lobbyFacilitator" type="text" placeholder="Your name (facilitator)" value="${escapeHtml(state.facilitator)}" autocomplete="off" ${!isOnServer ? 'disabled' : ''} />
          </div>
          <button class="btn btn-primary" id="createSessionBtn" ${!isOnServer ? 'disabled' : ''} style="width:100%;justify-content:center;margin-top:4px">
            Create Session
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
          <p id="createError" class="lobby-error" style="display:none"></p>
        </div>

        <!-- JOIN -->
        <div class="lobby-card">
          <div class="lobby-card-icon" style="background:linear-gradient(135deg,#16a34a,#4ade80)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          </div>
          <h3 class="lobby-card-title">Join a Session</h3>
          <p class="lobby-card-desc">Enter the room code your facilitator shared and contribute in real time.</p>
          <div class="lobby-fields">
            <input class="field-input lobby-code-input" id="lobbyCode" type="text" placeholder="Room code (e.g. A3K9)" maxlength="4" autocomplete="off" autocapitalize="characters" ${!isOnServer ? 'disabled' : ''} />
            <input class="field-input" id="lobbyParticipantName" type="text" placeholder="Your name" autocomplete="off" ${!isOnServer ? 'disabled' : ''} />
          </div>
          <button class="btn btn-primary" id="joinSessionBtn" ${!isOnServer ? 'disabled' : ''} style="width:100%;justify-content:center;background:var(--success);box-shadow:0 1px 3px rgba(22,163,74,.3),0 4px 12px rgba(22,163,74,.2)">
            Join Session
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
          <p id="joinError" class="lobby-error" style="display:none"></p>
        </div>

      </div>

      <div class="lobby-solo">
        <div class="lobby-solo-divider"><span>or</span></div>
        <button class="btn btn-ghost" id="soloModeBtn" style="width:100%;justify-content:center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          Continue in Solo Mode
        </button>
        <p class="lobby-solo-hint">No server needed. Run the full workshop yourself.</p>
      </div>

    </div>`;
}

function attachLobbyListeners() {
  bindInput('lobbyTeamName',    v => state.teamName    = v);
  bindInput('lobbyFacilitator', v => state.facilitator = v);
  bindInput('lobbyCode', v => {
    const el = document.getElementById('lobbyCode');
    if (el) el.value = v.toUpperCase();
  });

  on('createSessionBtn', 'click', e => {
    addRipple(e);
    const teamName   = document.getElementById('lobbyTeamName')?.value.trim() || 'Our Team';
    const facilitator = document.getElementById('lobbyFacilitator')?.value.trim() || 'Facilitator';
    state.teamName    = teamName;
    state.facilitator = facilitator;
    connectAsHost(teamName, facilitator);
  });

  on('joinSessionBtn', 'click', e => {
    addRipple(e);
    const code = document.getElementById('lobbyCode')?.value.trim().toUpperCase();
    const name = document.getElementById('lobbyParticipantName')?.value.trim();
    if (!code) { showLobbyError('joinError', 'Enter a room code.'); return; }
    if (!name) { showLobbyError('joinError', 'Enter your name.'); return; }
    connectAsParticipant(code, name);
  });

  on('soloModeBtn', 'click', e => {
    addRipple(e);
    session.mode = 'solo';
    state.phase  = 'setup';
    render();
  });

  // Auto-uppercase room code input
  const codeInput = document.getElementById('lobbyCode');
  if (codeInput) {
    codeInput.addEventListener('input', () => {
      const pos = codeInput.selectionStart;
      codeInput.value = codeInput.value.toUpperCase();
      codeInput.setSelectionRange(pos, pos);
    });
  }

  // Check AI availability and update status badge
  if (window.location.protocol !== 'file:') {
    fetch('/api/health')
      .then(r => r.json())
      .then(({ aiEnabled }) => {
        const dot    = document.getElementById('lobbyAiDot');
        const txt    = document.getElementById('lobbyAiStatusText');
        const badge  = document.getElementById('lobbyAiStatus');
        if (!dot || !txt || !badge) return;
        if (aiEnabled) {
          dot.style.background        = '#16a34a';
          txt.textContent             = 'AI synthesis ready';
          badge.style.background      = '#f0fdf4';
          badge.style.borderColor     = '#bbf7d0';
          badge.style.color           = '#15803d';
        } else {
          dot.style.background        = '#d97706';
          txt.innerHTML               = 'AI not configured — set <code style="background:#fef3c7;padding:1px 5px;border-radius:3px;font-size:11px">ANTHROPIC_API_KEY</code> and restart';
          badge.style.background      = '#fffbeb';
          badge.style.borderColor     = '#fde68a';
          badge.style.color           = '#92400e';
        }
      })
      .catch(() => {
        const badge = document.getElementById('lobbyAiStatus');
        if (badge) badge.style.display = 'none';
      });
  }
}

function showLobbyError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}


// ============================================================
// PARTICIPANT VIEW
// ============================================================

function renderParticipantView() {
  const live    = session.live;
  const phase   = live.phase;
  const ai      = live.aiResults[phase];
  const sel     = live.selections[phase];
  const status  = live.status;

  const phaseInfo = {
    principles: { num: '1 of 5', name: 'Principles', desc: 'What specific behaviors do you value most in your colleagues?', slots: [{ key: 'principles', slot: null, placeholder: 'e.g. Always assume the user is confused…' }] },
    purpose:    { num: '2 of 5', name: 'Purpose', desc: 'Contribute ideas to each of the three prompts below.', slots: [
      { key: 'who',      slot: 'who',      label: 'Who do we help?',                      placeholder: 'e.g. Early-stage startup founders…' },
      { key: 'struggle', slot: 'struggle', label: 'What is their biggest struggle?',       placeholder: 'e.g. They can\'t align their team…' },
      { key: 'change',   slot: 'change',   label: 'How does our work change their lives?', placeholder: 'e.g. They ship with confidence…' }
    ]},
    mission:    { num: '3 of 5', name: 'Mission', desc: 'Drop any mission draft ideas — phrases, fragments, or full sentences.', slots: [{ key: 'mission', slot: null, placeholder: 'e.g. We build tools that help teams…' }] },
    strategy:   { num: '4 of 5', name: 'Strategy', desc: 'Add focus areas to any of the four clusters.', slots: [
      { key: 'ux',        slot: 'ux',        label: 'User Experience',      placeholder: 'Key UX focus area…' },
      { key: 'technical', slot: 'technical', label: 'Technical Foundation', placeholder: 'Technical priority…' },
      { key: 'process',   slot: 'process',   label: 'Process & Operations', placeholder: 'Process improvement…' },
      { key: 'custom',    slot: 'custom',    label: live.ideas.customLabel || 'Custom', placeholder: 'Another focus area…' }
    ]},
    okrs:       { num: '5 of 5', name: 'OKRs', desc: 'Brainstorm raw metric ideas — anything that could measure success.', slots: [{ key: 'metrics', slot: null, placeholder: 'e.g. fewer bugs, faster handoff, more signups…' }] },
    output:     { num: 'Done', name: 'Output', desc: 'The workshop is complete. View your Vision Stack below.', slots: [] }
  };

  const info = phaseInfo[phase] || phaseInfo.principles;
  const isOutput = phase === 'output';

  // Collect all ideas for live feed
  const allIdeas = collectAllLiveIdeas(phase);

  // Render AI results for participant (read-only)
  let aiSection = '';
  if (ai && !isOutput) {
    aiSection = renderParticipantAISection(phase, ai, sel);
  }

  // Build input sections
  let inputSections = '';
  if (!isOutput && status !== 'selecting') {
    inputSections = info.slots.map(s => {
      const slot     = s.slot || s.key;
      const arr      = getLiveIdeasArray(phase === 'okrs' ? 'okrs' : phase, slot === 'metrics' ? null : slot) || getLiveIdeasArray('okrs', null);
      const myIdeas  = (slot === 'metrics' ? getLiveIdeasArray('okrs', null) : getLiveIdeasArray(phase, slot) || [])
                       .filter(i => ideaOwnerId(i) === session.myId);
      const areaId   = `pArea-${s.key}`;
      return `
        <div class="participant-input-section">
          ${s.label ? `<div class="purpose-section-label" style="margin-bottom:10px"><span class="purpose-section-dot" style="background:var(--accent)"></span>${s.label}</div>` : ''}
          <div class="participant-idea-input">
            <textarea class="sticky-input participant-sticky" id="pInput-${s.key}" placeholder="${s.placeholder}" rows="1"></textarea>
            <button class="btn btn-primary participant-add-btn" data-phase="${phase}" data-slot="${slot}" data-input-id="pInput-${s.key}">Add</button>
          </div>
          ${myIdeas.length > 0 ? `
          <div class="participant-my-ideas">
            ${myIdeas.map(idea => `
            <div class="participant-my-idea">
              <span>${escapeHtml(ideaValue(idea))}</span>
              <button class="sticky-delete" data-phase="${phase}" data-slot="${slot}" data-idea-id="${idea.id}">×</button>
            </div>`).join('')}
          </div>` : ''}
        </div>`;
    }).join('');
  }

  // Live feed
  const liveFeedHtml = allIdeas.length > 0 ? `
    <div class="live-feed">
      <p class="live-feed-label">
        <span class="live-dot"></span>
        Live from the room (${allIdeas.length} idea${allIdeas.length !== 1 ? 's' : ''})
      </p>
      <div class="live-feed-ideas">
        ${allIdeas.map(idea => `
        <div class="live-idea-card" style="--owner-color:${ideaColor(idea) || 'var(--accent)'}">
          <span class="live-idea-owner-dot"></span>
          <span class="live-idea-text">${escapeHtml(ideaValue(idea))}</span>
          <span class="live-idea-name">${escapeHtml(ideaOwnerName(idea) || '')}</span>
        </div>`).join('')}
      </div>
    </div>` : '';

  // Status bar
  const statusHtml = `
    <div class="participant-status-bar ${status}">
      ${status === 'synthesizing'
        ? `<span class="loading-dots"><span></span><span></span><span></span></span> Facilitator is synthesizing with AI…`
        : status === 'selecting'
        ? `<span class="participant-status-icon">👁</span> Facilitator is reviewing options…`
        : `<span class="participant-status-icon" style="opacity:.5">⬤</span> Brainstorming in progress. Add your ideas above.`}
    </div>`;

  return `
    <div class="participant-view">
      <div class="phase-eyebrow"><div class="phase-eyebrow-dot"></div>Phase ${info.num}</div>
      <h1 class="phase-title" style="font-size:26px;margin-bottom:8px">${info.name}</h1>
      ${!isOutput ? `<div class="step-prompt" style="margin-bottom:24px">${info.desc}</div>` : ''}

      ${inputSections}
      ${liveFeedHtml}
      ${statusHtml}
      ${aiSection}

      ${isOutput ? `
      <div class="output-artifact" style="margin-top:24px">
        ${renderOutputArtifactBody(session.live.stack)}
      </div>` : ''}
    </div>`;
}

function collectAllLiveIdeas(phase) {
  const l = session.live.ideas;
  if (phase === 'principles') return l.principles;
  if (phase === 'purpose')    return [...l.purpose.who, ...l.purpose.struggle, ...l.purpose.change];
  if (phase === 'strategy')   return [...l.strategy.ux, ...l.strategy.technical, ...l.strategy.process, ...l.strategy.custom];
  if (phase === 'okrs')       return l.okrs.metrics;
  if (phase === 'mission')    return l.mission;
  return [];
}

function renderParticipantAISection(phase, ai, sel) {
  if (phase === 'principles' && Array.isArray(ai)) {
    const selSet = new Set(Array.isArray(sel) ? sel : []);
    return `
      <div class="step-card ai-results-section" style="margin-top:16px">
        <div class="ai-results-header">
          <div class="ai-results-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>
            AI Synthesized
          </div>
          <span class="ai-results-hint">Facilitator is selecting</span>
        </div>
        <div class="option-cards-grid">
          ${ai.map((opt, i) => `
          <div class="option-card ${selSet.has(i) ? 'selected' : ''}" style="cursor:default;pointer-events:none">
            <div class="option-card-check">${selSet.has(i) ? '✓' : ''}</div>
            <div class="option-card-title">${escapeHtml(opt.title)}</div>
            <div class="option-card-desc">${escapeHtml(opt.description)}</div>
          </div>`).join('')}
        </div>
      </div>`;
  }
  if ((phase === 'purpose' || phase === 'mission') && Array.isArray(ai)) {
    const selectedIdx = typeof sel === 'number' ? sel : null;
    return `
      <div class="step-card ai-results-section" style="margin-top:16px">
        <div class="ai-results-header"><div class="ai-results-badge">AI Synthesized</div><span class="ai-results-hint">Facilitator is selecting</span></div>
        <div class="option-cards-grid">
          ${ai.map((opt, i) => `
          <div class="option-card ${selectedIdx === i ? 'selected' : ''}" style="cursor:default;pointer-events:none">
            <div class="option-card-check">${selectedIdx === i ? '✓' : ''}</div>
            <div class="option-card-title">${escapeHtml(typeof opt === 'string' ? opt : opt.title)}</div>
          </div>`).join('')}
        </div>
      </div>`;
  }
  return '';
}

function attachParticipantListeners() {
  // Add idea buttons
  document.querySelectorAll('.participant-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const phase   = btn.dataset.phase;
      const slot    = btn.dataset.slot;
      const inputId = btn.dataset.inputId;
      const input   = document.getElementById(inputId);
      const value   = input?.value.trim();
      if (!value || !session.socket) return;

      const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      // Optimistic update
      const ideaObj = { id, value, ownerSocketId: session.myId, ownerName: session.myName, ownerColor: session.myColor };
      const arr = getLiveIdeasArray(phase, slot === 'metrics' ? null : (slot !== phase ? slot : null)) || getLiveIdeasArrayBySlot(phase, slot);
      if (arr) arr.push(ideaObj);
      if (input) { input.value = ''; input.style.height = 'auto'; }
      renderFromSocket();

      session.socket.emit('idea:add', { phase, slot, value, id });
    });
  });

  // Remove own idea
  document.querySelectorAll('.sticky-delete[data-idea-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const phase = btn.dataset.phase;
      const slot  = btn.dataset.slot;
      const id    = btn.dataset.ideaId;
      // Optimistic remove
      const arr = getLiveIdeasArrayBySlot(phase, slot);
      if (arr) { const idx = arr.findIndex(i => i.id === id); if (idx !== -1) arr.splice(idx, 1); }
      renderFromSocket();
      if (session.socket) session.socket.emit('idea:remove', { phase, slot, id });
    });
  });

  // Auto-resize participant textareas
  document.querySelectorAll('.participant-sticky').forEach(el => {
    autoResizeTextarea(el);
    el.addEventListener('input', () => autoResizeTextarea(el));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const addBtn = document.querySelector(`.participant-add-btn[data-input-id="${el.id}"]`);
        if (addBtn) addBtn.click();
      }
    });
  });
}

// Helper to route phase+slot to live ideas array
function getLiveIdeasArrayBySlot(phase, slot) {
  const l = session.live.ideas;
  if (phase === 'principles') return l.principles;
  if (phase === 'purpose')    return l.purpose[slot] || l.purpose.who;
  if (phase === 'mission')    return l.mission;
  if (phase === 'strategy')   return l.strategy[slot] || l.strategy.ux;
  if (phase === 'okrs')       return l.okrs.metrics;
  return null;
}


// ============================================================
// SHARED COMPONENT HELPERS
// ============================================================

function renderStickyRow(item, idx, placeholder = '') {
  const value      = ideaValue(item);
  const ref        = ideaId(item, idx);
  const color      = ideaColor(item);
  const ownerName  = ideaOwnerName(item);
  const mine       = isMineOrSolo(item);

  return `
    <div class="sticky-row ${color ? 'mp-sticky' : ''}" data-sticky-idx="${idx}" data-idea-ref="${ref}"
         ${color ? `style="--owner-color:${color}"` : ''}>
      <textarea class="sticky-input" data-sticky-idx="${idx}" data-idea-ref="${ref}"
                placeholder="${placeholder}" rows="1"
                ${!mine ? 'readonly' : ''}>${escapeHtml(value)}</textarea>
      ${mine  ? `<button class="sticky-delete" data-sticky-idx="${idx}" data-idea-ref="${ref}" title="Remove">×</button>` : ''}
      ${color ? `<span class="sticky-owner-badge" title="${escapeHtml(ownerName || '')}" style="background:${color}">${escapeHtml((ownerName || '?').charAt(0))}</span>` : ''}
    </div>`;
}

function renderAddStickyBtn(id, label = 'Add idea') {
  return `
    <button class="add-sticky-btn" id="${id}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
      ${label}
    </button>`;
}

function aiSparkIcon() {
  return `<svg class="ai-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
  </svg>`;
}

function renderAIBar(btnId, hint, disabled, hasResult) {
  return `
    <div class="ai-action-bar">
      <p class="ai-hint">${hint}</p>
      <div class="ai-action-btns">
        <button class="btn btn-ghost btn-copy-prompt" id="copyPromptBtn" ${disabled ? 'disabled' : ''}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          Copy Prompt
        </button>
        <button class="btn btn-ai" id="${btnId}" ${disabled ? 'disabled' : ''}>
          ${aiSparkIcon()}
          ${hasResult ? 'Re-synthesize' : 'AI Synthesize'}
        </button>
      </div>
    </div>
    <div class="copy-prompt-panel" id="copyPromptPanel">
      <div class="cpp-inner">
        <div class="cpp-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Prompt copied — open any AI assistant, paste it in, then paste the response below
        </div>
        <div class="cpp-links">
          <a href="https://claude.ai/new" target="_blank" rel="noopener" class="cpp-link cpp-claude">Claude.ai ↗</a>
          <a href="https://chatgpt.com/" target="_blank" rel="noopener" class="cpp-link cpp-chatgpt">ChatGPT ↗</a>
          <a href="https://gemini.google.com/" target="_blank" rel="noopener" class="cpp-link cpp-gemini">Gemini ↗</a>
        </div>
        <textarea class="cpp-textarea" id="pasteArea" placeholder="Paste the AI's response here — results appear automatically…" rows="4"></textarea>
        <p class="cpp-parse-status" id="parseStatus"></p>
      </div>
    </div>`;
}

function renderAIBadge() {
  return `
    <div class="ai-results-header">
      <div class="ai-results-badge">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>
        AI Synthesized
      </div>
      <span class="ai-results-hint">Click to select · Click text to edit</span>
    </div>`;
}

function renderFinalizeBar(id, countText, disabled, label = 'Commit to Stack') {
  return `
    <div class="finalize-bar">
      <p class="finalize-count">${countText}</p>
      <button class="btn btn-success" id="${id}" ${disabled ? 'disabled' : ''}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ${label}
      </button>
    </div>`;
}


// ============================================================
// FACILITATOR PHASE RENDERS (solo + host)
// ============================================================

function renderSetup() {
  return `
    <div class="phase-view">
      <div class="setup-hero">
        <div class="setup-logo-mark">
          <div class="setup-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div><div class="setup-logo-wordmark">Vision Stack</div></div>
          <span class="setup-logo-version">Workshop</span>
        </div>
        <div class="phase-eyebrow"><div class="phase-eyebrow-dot"></div>Getting Started</div>
        <h1 class="phase-title">Build your team's<br/>north star.</h1>
        <p class="phase-description">
          In under four hours, your team will align on <strong>Principles, Purpose, Mission, Strategy,</strong> and <strong>OKRs</strong> —
          the five layers that define how you work, why you exist, and how you measure success.
        </p>
        <div id="setupAiNote" style="display:none;margin-top:12px;padding:10px 14px;border-radius:10px;border:1px solid #fde68a;background:#fffbeb;font-size:13px;color:#92400e;line-height:1.5">
          <strong>AI synthesis is not configured.</strong> You can still run the full workshop — the AI step will return example output instead of real synthesis.
          To enable AI: restart the server with <code style="background:#fef3c7;padding:1px 5px;border-radius:3px">ANTHROPIC_API_KEY=sk-ant-…</code> set.
        </div>
      </div>
      <div class="setup-fields">
        <div class="field-group">
          <label class="field-label" for="teamNameInput">Team Name</label>
          <p class="field-hint">This will appear on your final Vision Stack artifact.</p>
          <input class="field-input" id="teamNameInput" type="text" placeholder="e.g. Antigravity Design Team" value="${escapeHtml(state.teamName)}" autocomplete="off" />
        </div>
        <div class="field-group">
          <label class="field-label" for="facilitatorInput">Facilitator Name</label>
          <p class="field-hint">Who is running today's workshop?</p>
          <input class="field-input" id="facilitatorInput" type="text" placeholder="e.g. Sarah Kim" value="${escapeHtml(state.facilitator)}" autocomplete="off" />
        </div>
      </div>
      <div class="agenda-card">
        <p class="agenda-title">Workshop Agenda</p>
        <ul class="agenda-list">
          ${[['1','Principles','45 min'],['2','Purpose','30 min'],['3','Mission','40 min']].map(([n,name,t]) => `
          <li class="agenda-item"><span class="agenda-num">${n}</span><span class="agenda-phase-name">${name}</span><span class="agenda-time">${t}</span></li>`).join('')}
          <li class="agenda-item"><span class="agenda-num" style="background:var(--warn-soft);color:var(--warn);">⏸</span><span class="agenda-phase-name">Break</span><span class="agenda-time">20 min</span></li>
          ${[['4','Strategy','50 min'],['5','OKRs','40 min']].map(([n,name,t]) => `
          <li class="agenda-item"><span class="agenda-num">${n}</span><span class="agenda-phase-name">${name}</span><span class="agenda-time">${t}</span></li>`).join('')}
          <li class="agenda-item"><span class="agenda-num" style="background:var(--success-soft);color:var(--success);">✓</span><span class="agenda-phase-name">Wrap-up & Output</span><span class="agenda-time">15 min</span></li>
        </ul>
      </div>
      <div class="phase-nav">
        <div></div>
        <button class="btn btn-primary" id="startWorkshopBtn">
          Begin Workshop
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </div>
    </div>`;
}

function renderPrinciples() {
  const p = state.principles;
  const hasIdeas   = p.ideas.some(s => ideaValue(s).trim());
  const hasResults = p.aiResult && p.aiResult.length > 0;
  const selCount   = p.selected.size;

  return `
    <div class="phase-view">
      <div class="phase-eyebrow"><div class="phase-eyebrow-dot"></div>Phase 1 of 5 · 45 min</div>
      <h1 class="phase-title">Principles</h1>
      <p class="phase-description">Principles are the <strong>behaviors and beliefs</strong> that define your team's culture. Think specific actions — <em>"Always assume the user is confused"</em> beats <em>"Integrity."</em></p>
      <div class="step-card">
        <div class="step-card-header"><span class="step-num">Step 1 · 7 min</span></div>
        <h3 class="step-title">Silent Brainstorm</h3>
        <p class="step-desc">Each team member independently writes down specific behaviors they value in great colleagues.</p>
        <div class="step-prompt">"What specific behaviors do you value most in your colleagues?"</div>
        <div class="stickies-area" id="stickiesArea">
          ${p.ideas.map((v, i) => renderStickyRow(v, i, 'e.g. Always question assumptions before writing a single line of code…')).join('')}
        </div>
        ${renderAddStickyBtn('addStickyBtn')}
        ${renderAIBar('synthesizeBtn',
          hasIdeas ? `${p.ideas.filter(s=>ideaValue(s).trim()).length} idea${p.ideas.filter(s=>ideaValue(s).trim()).length !== 1 ? 's' : ''} ready.` : 'Add at least one idea.',
          !hasIdeas, !!p.aiResult)}
      </div>
      ${hasResults ? `
      <div class="step-card ai-results-section">
        <div class="step-card-header"><span class="step-num">Step 2–3 · 33 min</span></div>
        <h3 class="step-title">Vote & Refine</h3>
        <p class="step-desc">Select themes that resonate. Click text to edit. Aim for 4–5 principles.</p>
        ${renderAIBadge()}
        <div class="option-cards-grid" id="optionCardsGrid">
          ${p.aiResult.map((opt, i) => `
          <div class="option-card ${p.selected.has(i) ? 'selected' : ''}" data-option-idx="${i}">
            <div class="option-card-check">${p.selected.has(i) ? '✓' : ''}</div>
            <div class="option-card-title" contenteditable="${p.selected.has(i)}" data-field="title" data-option-idx="${i}">${escapeHtml(opt.title)}</div>
            <div class="option-card-desc"  contenteditable="${p.selected.has(i)}" data-field="desc"  data-option-idx="${i}">${escapeHtml(opt.description)}</div>
            <p class="option-card-edit-hint">Click text above to edit wording.</p>
          </div>`).join('')}
        </div>
        ${renderFinalizeBar('finalizeBtn', selCount === 0 ? 'Select the principles that resonate.' : `<strong>${selCount} principle${selCount !== 1 ? 's' : ''}</strong> selected.`, selCount === 0)}
      </div>` : ''}
      <div class="phase-nav"><button class="btn btn-ghost" id="backBtn">← Back</button><div></div></div>
    </div>`;
}

function renderPurpose() {
  const p = state.purpose;
  const totalIdeas = [...p.who, ...p.struggle, ...p.change].filter(s => ideaValue(s).trim()).length;
  const hasResults = p.aiResult && p.aiResult.length > 0;
  const sections = [
    { key: 'who',      dotClass: 'who',      label: 'Who do we help?',                      placeholder: 'e.g. Early-stage startup founders who…' },
    { key: 'struggle', dotClass: 'struggle',  label: 'What is their biggest struggle?',       placeholder: 'e.g. They struggle to align their team…' },
    { key: 'change',   dotClass: 'change',    label: 'How does our work change their lives?', placeholder: 'e.g. They can finally ship with confidence…' }
  ];
  return `
    <div class="phase-view">
      <div class="phase-eyebrow"><div class="phase-eyebrow-dot"></div>Phase 2 of 5 · 30 min</div>
      <h1 class="phase-title">Purpose</h1>
      <p class="phase-description">Purpose is your team's <strong>"why"</strong> — the fundamental reason you exist beyond the work itself.</p>
      <div class="step-card">
        <div class="step-card-header"><span class="step-num">Step 1 · 8 min</span></div>
        <h3 class="step-title">The "Why" Prompts</h3>
        <p class="step-desc">Add sticky notes in each area. Short phrases are fine — the AI will weave them into statements.</p>
        <div class="purpose-sections">
          ${sections.map(s => `
          <div class="purpose-section">
            <div class="purpose-section-label"><span class="purpose-section-dot ${s.dotClass}"></span>${s.label}</div>
            <div class="stickies-area" id="stickiesArea-${s.key}">
              ${p[s.key].map((v, i) => renderStickyRow(v, i, s.placeholder)).join('')}
            </div>
            ${renderAddStickyBtn(`addStickyBtn-${s.key}`)}
          </div>`).join('')}
        </div>
        ${renderAIBar('synthesizeBtn',
          totalIdeas > 0 ? `${totalIdeas} idea${totalIdeas !== 1 ? 's' : ''} across all prompts.` : 'Fill in at least one area.',
          totalIdeas === 0, !!p.aiResult)}
      </div>
      ${hasResults ? `
      <div class="step-card ai-results-section">
        <div class="step-card-header"><span class="step-num">Step 2 · 22 min</span></div>
        <h3 class="step-title">Select Your Purpose</h3>
        <p class="step-desc">Pick the statement that resonates most — one only. Click text to edit.</p>
        ${renderAIBadge()}
        <div class="option-cards-grid" id="purposeCardsGrid">
          ${p.aiResult.map((stmt, i) => `
          <div class="purpose-statement-card ${p.selectedIdx === i ? 'selected' : ''}" data-option-idx="${i}">
            <div class="option-card-check">${p.selectedIdx === i ? '✓' : ''}</div>
            <span contenteditable="${p.selectedIdx === i}" data-option-idx="${i}">${escapeHtml(stmt)}</span>
          </div>`).join('')}
        </div>
        ${renderFinalizeBar('finalizeBtn', p.selectedIdx === null ? 'Select one purpose statement.' : '<strong>1 statement</strong> selected.', p.selectedIdx === null)}
      </div>` : ''}
      <div class="phase-nav"><button class="btn btn-ghost" id="backBtn">← Back</button><div></div></div>
    </div>`;
}

function renderMission() {
  const m = state.mission;
  const hasContent = m.drafts.some(d => d.solution.trim() || d.audience.trim() || d.outcome.trim());
  const hasResults = m.aiResult && m.aiResult.length > 0;
  return `
    <div class="phase-view">
      <div class="phase-eyebrow"><div class="phase-eyebrow-dot"></div>Phase 3 of 5 · 40 min</div>
      <h1 class="phase-title">Mission</h1>
      <p class="phase-description">Mission is your team's <strong>"what"</strong> — the concrete objective you're working to achieve over the next 1–3 years.</p>
      <div class="step-card">
        <div class="step-card-header"><span class="step-num">Step 1 · 10 min</span></div>
        <h3 class="step-title">Mad-Libs Framework</h3>
        <p class="step-desc">Fill in the blanks. Write 2–3 variations to explore different framings of your mission.</p>
        <div class="madlibs-drafts" id="madlibsDrafts">
          ${m.drafts.map((d, i) => `
          <div class="madlibs-draft" data-draft-idx="${i}">
            <button class="madlibs-delete" data-draft-idx="${i}" title="Remove">×</button>
            <div class="madlibs-line"><span class="madlibs-text">We build</span><input class="madlibs-input" data-draft-idx="${i}" data-field="solution" placeholder="your solution / product" value="${escapeHtml(d.solution)}" /></div>
            <div class="madlibs-line"><span class="madlibs-text">for</span><input class="madlibs-input" data-draft-idx="${i}" data-field="audience" placeholder="specific audience" value="${escapeHtml(d.audience)}" /></div>
            <div class="madlibs-line"><span class="madlibs-text">so they can</span><input class="madlibs-input" data-draft-idx="${i}" data-field="outcome" placeholder="primary outcome they achieve" value="${escapeHtml(d.outcome)}" /></div>
          </div>`).join('')}
        </div>
        <button class="add-draft-btn" id="addDraftBtn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          Add variation
        </button>
        ${renderAIBar('synthesizeBtn',
          hasContent ? `${m.drafts.filter(d=>d.solution.trim()||d.audience.trim()||d.outcome.trim()).length} draft${m.drafts.length !== 1 ? 's' : ''} ready.` : 'Fill in at least one draft.',
          !hasContent, !!m.aiResult)}
      </div>
      ${hasResults ? `
      <div class="step-card ai-results-section">
        <div class="step-card-header"><span class="step-num">Step 2 · 30 min</span></div>
        <h3 class="step-title">Debate & Align</h3>
        <p class="step-desc">Choose the statement that's closest, then debate and edit until it's exactly right.</p>
        ${renderAIBadge()}
        <div class="option-cards-grid" id="missionCardsGrid">
          ${m.aiResult.map((stmt, i) => `
          <div class="mission-option-card ${m.selectedIdx === i ? 'selected' : ''}" data-option-idx="${i}">
            <div class="option-card-check">${m.selectedIdx === i ? '✓' : ''}</div>
            <div class="mission-option-text" contenteditable="${m.selectedIdx === i}" data-option-idx="${i}">${escapeHtml(stmt)}</div>
          </div>`).join('')}
        </div>
        ${renderFinalizeBar('finalizeBtn', m.selectedIdx === null ? 'Select one mission statement.' : '<strong>1 statement</strong> selected.', m.selectedIdx === null)}
      </div>` : ''}
      <div class="phase-nav"><button class="btn btn-ghost" id="backBtn">← Back</button><div></div></div>
    </div>`;
}

function renderStrategy() {
  const s = state.strategy;
  const totalIdeas = Object.values(s.clusters).flat().filter(v => ideaValue(v).trim()).length;
  const hasResults = s.aiResult && s.aiResult.pillars;
  const selCount   = s.selected.size;
  const clusterDefs = [
    { key: 'ux',        label: 'User Experience',     fixed: true },
    { key: 'technical', label: 'Technical Foundation', fixed: true },
    { key: 'process',   label: 'Process & Operations', fixed: true },
    { key: 'custom',    label: s.customLabel,           fixed: false }
  ];
  return `
    <div class="phase-view">
      <div class="phase-eyebrow"><div class="phase-eyebrow-dot"></div>Phase 4 of 5 · 50 min</div>
      <h1 class="phase-title">Strategy</h1>
      <p class="phase-description">Strategy is your team's <strong>"how"</strong> — specific focus areas and approach. Be opinionated. What are you choosing <em>not</em> to do?</p>
      <div class="step-card">
        <div class="step-card-header"><span class="step-num">Step 1 · 15 min</span></div>
        <h3 class="step-title">Strategic Pillars Brainstorm</h3>
        <p class="step-desc">Drop ideas into the clusters. The last column header is editable.</p>
        <div class="clusters-grid">
          ${clusterDefs.map(c => `
          <div class="cluster-section">
            ${c.fixed ? `<div class="cluster-header">${c.label}</div>` : `<input class="cluster-label-input" id="customLabelInput" value="${escapeHtml(s.customLabel)}" placeholder="Custom pillar area…" />`}
            <div class="stickies-area" id="stickiesArea-${c.key}">
              ${s.clusters[c.key].map((v, i) => renderStickyRow(v, i, 'Key focus area…')).join('')}
            </div>
            ${renderAddStickyBtn(`addStickyBtn-${c.key}`)}
          </div>`).join('')}
        </div>
        ${renderAIBar('synthesizeBtn',
          totalIdeas > 0 ? `${totalIdeas} idea${totalIdeas !== 1 ? 's' : ''} across clusters.` : 'Add ideas to at least one cluster.',
          totalIdeas === 0, !!s.aiResult)}
      </div>
      ${hasResults ? `
      <div class="step-card ai-results-section">
        <div class="step-card-header"><span class="step-num">Step 2 · 35 min</span></div>
        <h3 class="step-title">Pillars & Devil's Advocate</h3>
        <p class="step-desc">Select up to 3 pillars. Read the critique — use it to pressure-test your choices.</p>
        ${renderAIBadge()}
        <div class="option-cards-grid" id="strategyCardsGrid">
          ${s.aiResult.pillars.map((p, i) => `
          <div class="option-card ${s.selected.has(i) ? 'selected' : ''}" data-option-idx="${i}">
            <div class="option-card-check">${s.selected.has(i) ? '✓' : ''}</div>
            <div class="option-card-title" contenteditable="${s.selected.has(i)}" data-field="title" data-option-idx="${i}">${escapeHtml(p.title)}</div>
            <div class="option-card-desc"  contenteditable="${s.selected.has(i)}" data-field="desc"  data-option-idx="${i}">${escapeHtml(p.description)}</div>
            <p class="option-card-edit-hint">Click text above to edit wording.</p>
          </div>`).join('')}
        </div>
        <div class="critique-card">
          <div class="critique-header"><span class="critique-badge">⚡ Devil's Advocate</span></div>
          <p class="critique-text">${escapeHtml(s.aiResult.critique)}</p>
        </div>
        ${renderFinalizeBar('finalizeBtn', selCount === 0 ? 'Select your strategic pillars (up to 3).' : `<strong>${selCount} pillar${selCount !== 1 ? 's' : ''}</strong> selected.`, selCount === 0)}
      </div>` : ''}
      <div class="phase-nav"><button class="btn btn-ghost" id="backBtn">← Back</button><div></div></div>
    </div>`;
}

function renderOKRs() {
  const o = state.okrs;
  const hasObj0    = o.objectives[0].trim().length > 0;
  const hasMetrics = o.metricIdeas.some(s => ideaValue(s).trim());
  const canSynth   = hasObj0 && hasMetrics;
  const hasResults = o.aiResult && o.aiResult.length > 0;
  const totalSel   = o.selected[0].size + (o.selected[1]?.size || 0);
  return `
    <div class="phase-view">
      <div class="phase-eyebrow"><div class="phase-eyebrow-dot"></div>Phase 5 of 5 · 40 min</div>
      <h1 class="phase-title">OKRs</h1>
      <p class="phase-description"><strong>Objectives</strong> are qualitative and inspiring. <strong>Key Results</strong> are specific, measurable, time-bound. Max 2 objectives.</p>
      <div class="step-card">
        <div class="step-card-header"><span class="step-num">Step 1 · 10 min</span></div>
        <h3 class="step-title">Draft Your Objectives</h3>
        <div class="objective-inputs">
          <div class="objective-input-row"><div class="objective-badge">O1</div><input class="field-input" id="objInput0" data-obj-idx="0" type="text" placeholder="e.g. Delight our early users at every touchpoint" value="${escapeHtml(o.objectives[0])}" /></div>
          <div class="objective-input-row"><div class="objective-badge secondary">O2</div><input class="field-input" id="objInput1" data-obj-idx="1" type="text" placeholder="Optional second objective" value="${escapeHtml(o.objectives[1])}" /></div>
        </div>
      </div>
      <div class="step-card">
        <div class="step-card-header"><span class="step-num">Step 2 · 10 min</span></div>
        <h3 class="step-title">Metrics Brainstorm</h3>
        <div class="step-prompt">"How would we know if we succeeded?"</div>
        <div class="stickies-area" id="stickiesArea-metrics">
          ${o.metricIdeas.map((v, i) => renderStickyRow(v, i, 'e.g. fewer bugs, faster handoff, more signups…')).join('')}
        </div>
        ${renderAddStickyBtn('addStickyBtn-metrics')}
        ${renderAIBar('synthesizeBtn',
          canSynth ? 'Ready to generate SMART Key Results.' : !hasObj0 ? 'Add at least one Objective first.' : 'Add at least one metric idea.',
          !canSynth, !!o.aiResult)}
      </div>
      ${hasResults ? `
      <div class="step-card ai-results-section">
        <div class="step-card-header"><span class="step-num">Step 3 · 20 min</span></div>
        <h3 class="step-title">Reality Check & Finalize</h3>
        <p class="step-desc">Select 2–3 Key Results per Objective. Do you have the data to measure this <em>today</em>?</p>
        ${renderAIBadge()}
        ${o.aiResult.map((objData, objIdx) => `
        <div class="okr-results-block">
          <div class="okr-obj-label">${escapeHtml(objData.objective)}</div>
          <div id="krGrid-${objIdx}">
            ${objData.keyResults.map((kr, krIdx) => `
            <div class="kr-option-card ${o.selected[objIdx]?.has(krIdx) ? 'selected' : ''}" data-obj-idx="${objIdx}" data-kr-idx="${krIdx}">
              <div class="option-card-check">${o.selected[objIdx]?.has(krIdx) ? '✓' : ''}</div>
              ${escapeHtml(kr)}
            </div>`).join('')}
          </div>
        </div>`).join('')}
        <div class="reality-check">
          <span class="reality-check-icon">💡</span>
          <p class="reality-check-text">"Do we have the tools and data to measure this <strong>today</strong>? If not, adjust until it is measurable with what you have right now."</p>
        </div>
        ${renderFinalizeBar('finalizeBtn', totalSel === 0 ? 'Select 2–3 Key Results per Objective.' : `<strong>${totalSel} Key Result${totalSel !== 1 ? 's' : ''}</strong> selected.`, totalSel === 0, 'Commit to Stack & Finish')}
      </div>` : ''}
      <div class="phase-nav"><button class="btn btn-ghost" id="backBtn">← Back</button><div></div></div>
    </div>`;
}

function renderOutput() {
  const { stack, teamName, facilitator } = state;
  const today = new Date();
  const reviewDate = new Date(today); reviewDate.setDate(today.getDate() + 30);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return `
    <div class="phase-view output-view">
      <div class="phase-eyebrow"><div class="phase-eyebrow-dot"></div>Workshop Complete</div>
      <h1 class="phase-title">Your Vision Stack</h1>
      <p class="phase-description" style="margin-bottom:24px">Read it top to bottom — it should tell a cohesive story.</p>
      <div class="output-artifact">
        <div class="output-artifact-header">
          <p class="output-team-label">Vision Stack</p>
          <h2 class="output-team-name">${escapeHtml(teamName || 'Our Team')}</h2>
          <p class="output-meta">${facilitator ? `Facilitated by ${escapeHtml(facilitator)} · ` : ''}${fmt(today)}</p>
        </div>
        <div class="output-layers">${renderOutputArtifactBody(stack)}</div>
      </div>
      <div class="next-steps-card">
        <h3 class="next-steps-title">Next Steps</h3>
        <ul class="next-steps-list">
          ${[
            ['<strong>Assign an owner</strong> to move this into your central docs (Notion, Confluence, etc.) by end of week.'],
            ['<strong>Socialize the work</strong> with cross-functional leadership and adjacent teams for public accountability.'],
            ['<strong>Schedule a 30-minute review</strong> in one month to check progress against your OKRs.']
          ].map(([text], i) => `
          <li class="next-step-item">
            <div class="next-step-check" id="check${i}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:none"><polyline points="20 6 9 17 4 12"/></svg></div>
            <p class="next-step-text">${text}</p>
          </li>`).join('')}
        </ul>
        <div class="review-date-row">
          <label class="review-date-label">30-day check-in:</label>
          <input class="review-date-input" type="date" id="reviewDateInput" value="${reviewDate.toISOString().slice(0,10)}" />
        </div>
      </div>
      <div class="output-actions">
        <button class="btn btn-ghost" id="backBtn">← Back to OKRs</button>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-ghost" id="downloadJsonBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download JSON
          </button>
          <button class="btn btn-print" onclick="window.print()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print / Export PDF
          </button>
        </div>
      </div>
    </div>`;
}

function renderOutputArtifactBody(stack) {
  const emptyMsg = label => `<p style="font-size:13px;color:var(--text-tertiary);font-style:italic;">No ${label} defined.</p>`;
  const layers = [
    { num: '1', key: 'principles', name: 'Principles', tag: 'How we work' },
    { num: '2', key: 'purpose',    name: 'Purpose',    tag: 'Why we exist' },
    { num: '3', key: 'mission',    name: 'Mission',    tag: 'What we do' },
    { num: '4', key: 'strategy',   name: 'Strategy',   tag: 'How we win' },
    { num: '5', key: 'okrs',       name: 'OKRs',       tag: 'How we measure' }
  ];
  return layers.map(l => `
    <div class="output-layer-block">
      <div class="output-layer-eyebrow">
        <div class="output-layer-num">${l.num}</div>
        <span class="output-layer-name">${l.name}</span>
        <span class="output-layer-tag">${l.tag}</span>
      </div>
      ${renderOutputLayer(l.key, stack[l.key])}
    </div>`).join('');
}

function renderOutputLayer(key, data) {
  const has = Array.isArray(data) ? data.length > 0 : !!data;
  if (!has) return `<p style="font-size:13px;color:var(--text-tertiary);font-style:italic;">Not yet defined.</p>`;
  if (key === 'principles') return `<div class="output-principles-row">${data.map(p => `<div class="output-principle-card"><p class="output-principle-title">${escapeHtml(p.title)}</p><p class="output-principle-desc">${escapeHtml(p.description)}</p></div>`).join('')}</div>`;
  if (key === 'purpose' || key === 'mission') return `<p class="output-statement">"${escapeHtml(data)}"</p>`;
  if (key === 'strategy') return `<div class="output-pillars-row">${data.map(p => `<div class="output-pillar-card"><p class="output-pillar-title">${escapeHtml(p.title)}</p><p class="output-pillar-desc">${escapeHtml(p.description)}</p></div>`).join('')}</div>`;
  if (key === 'okrs') return `<div class="output-okr-row">${data.map(o => `<div class="output-okr-objective"><p class="output-okr-obj-title">${escapeHtml(o.objective)}</p><ul class="output-kr-list">${o.keyResults.map(kr => `<li class="output-kr-item"><span class="output-kr-bullet"></span>${escapeHtml(kr)}</li>`).join('')}</ul></div>`).join('')}</div>`;
  return '';
}


// ============================================================
// EVENT LISTENERS — FACILITATOR
// ============================================================

function attachEventListeners() {
  const phase = state.phase;
  const handlers = {
    setup:      attachSetupListeners,
    principles: attachPrinciplesListeners,
    purpose:    attachPurposeListeners,
    mission:    attachMissionListeners,
    strategy:   attachStrategyListeners,
    okrs:       attachOKRsListeners,
    output:     attachOutputListeners
  };
  handlers[phase]?.();

  on('backBtn', 'click', () => {
    const idx = PHASES.indexOf(state.phase);
    if (idx > 0) goToPhase(PHASES[idx - 1]);
  });
}

function attachSetupListeners() {
  bindInput('teamNameInput',    v => state.teamName    = v);
  bindInput('facilitatorInput', v => state.facilitator = v);

  // Fresh start — clear any saved session
  on('startWorkshopBtn', 'click', e => { addRipple(e); clearState(); goToPhase('principles'); });

  // Inject resume button if saved state exists
  const meta = getSavedMeta();
  if (meta && meta.phase && meta.phase !== 'setup') {
    const nav = document.querySelector('.phase-nav');
    if (nav) {
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'btn btn-ghost';
      resumeBtn.style.cssText = 'justify-content:center;';
      const label = meta.teamName ? `"${meta.teamName}"` : 'previous session';
      const phaseLabel = meta.phase.charAt(0).toUpperCase() + meta.phase.slice(1);
      resumeBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Resume ${label} · ${phaseLabel}`;
      resumeBtn.addEventListener('click', e => {
        addRipple(e);
        session.mode = 'solo';
        restoreState();
        render();
      });
      nav.insertBefore(resumeBtn, nav.firstChild);
    }
  }

  // Show AI warning if server is running but key is missing
  if (window.location.protocol !== 'file:') {
    fetch('/api/health')
      .then(r => r.json())
      .then(({ aiEnabled }) => {
        if (!aiEnabled) {
          const note = document.getElementById('setupAiNote');
          if (note) note.style.display = 'block';
        }
      })
      .catch(() => {});
  }
}

// ============================================================
// COPY-PROMPT FLOW (external LLM fallback)
// ============================================================

function buildPromptClient(phase) {
  const inputs = gatherInputs(phase);
  const jsonNote = '\n\nRespond with ONLY valid JSON — no markdown fences, no explanation.';

  switch (phase) {
    case 'principles': {
      const list = inputs.ideas.map((v, i) => `${i + 1}. ${v}`).join('\n');
      return `Act as an expert organizational designer. Review these team behaviors and cluster them into 4-6 distinct thematic principles. For each, provide a punchy title (2-4 words) and a 1-sentence description.

Team behaviors:
${list}${jsonNote}

Format:
[{"title": "...", "description": "..."}, ...]`;
    }
    case 'purpose': {
      return `Based on these inputs, generate 7 distinct, inspiring one-sentence Purpose Statements that explain the fundamental reason this team exists.

Who we help: ${inputs.who.join('; ')}
Their biggest struggles: ${inputs.struggle.join('; ')}
The change we create: ${inputs.change.join('; ')}${jsonNote}

Format:
["statement 1", "statement 2", ...]`;
    }
    case 'mission': {
      const lines = inputs.drafts.map((d, i) =>
        `${i + 1}. We build ${d.solution || '…'} for ${d.audience || '…'} so they can ${d.outcome || '…'}`
      ).join('\n');
      return `Synthesize these rough mission drafts into exactly 4 polished statements using the format "We build [X] for [Y] so they can [Z]."

Drafts:
${lines}${jsonNote}

Format:
["We build ...", "We build ...", "We build ...", "We build ..."]`;
    }
    case 'strategy': {
      const clusters = [
        inputs.clusters.ux.length        && `UX & Design: ${inputs.clusters.ux.join(', ')}`,
        inputs.clusters.technical.length && `Technical: ${inputs.clusters.technical.join(', ')}`,
        inputs.clusters.process.length   && `Process & Operations: ${inputs.clusters.process.join(', ')}`,
        inputs.clusters.custom.length    && `${inputs.customLabel || 'Other'}: ${inputs.clusters.custom.join(', ')}`,
      ].filter(Boolean).join('\n');
      return `Act as a critical business strategist. Synthesize these inputs into exactly 3 strategic pillars, then write an aggressive critique pointing out risks and gaps.

Inputs:
${clusters}${jsonNote}

Format:
{"pillars": [{"title": "...", "description": "..."}, {"title": "...", "description": "..."}, {"title": "...", "description": "..."}], "critique": "..."}`;
    }
    case 'okrs': {
      const objLines = inputs.objectives.map((o, i) => `Objective ${i + 1}: ${o}`).join('\n');
      return `For each objective, generate exactly 4 SMART Key Results — specific, measurable, time-bound, aggressive but realistic.

${objLines}
Rough metric ideas: ${inputs.metricIdeas.join(', ')}${jsonNote}

Format:
[{"objective": "...", "keyResults": ["...", "...", "...", "..."]}, ...]`;
    }
    default: return '';
  }
}

function parseAIResponse(text) {
  const cleaned = text
    .replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```\s*$/im, '')
    .trim();
  try { return JSON.parse(cleaned); } catch(_) {}
  const m = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (m) { try { return JSON.parse(m[1]); } catch(_) {} }
  return null;
}

function applyAIResult(phase, result) {
  switch (phase) {
    case 'principles': state.principles.aiResult = result; state.principles.selected = new Set(); break;
    case 'purpose':    state.purpose.aiResult    = result; state.purpose.selectedIdx  = null; break;
    case 'mission':    state.mission.aiResult    = result; state.mission.selectedIdx  = null; break;
    case 'strategy':   state.strategy.aiResult   = result; state.strategy.selected    = new Set(); break;
    case 'okrs':       state.okrs.aiResult        = result; state.okrs.selected        = result.map(() => new Set()); break;
  }
  if (session.mode === 'host' && session.socket) {
    session.socket.emit('ai:result', { phase, result });
  }
  renderPhaseContent();
  scrollToResults(null);
}

function attachAIBarListeners(phase) {
  on('synthesizeBtn', 'click', e => { addRipple(e); runSynthesis(phase); });

  on('copyPromptBtn', 'click', e => {
    addRipple(e);
    if (!hasEnoughInputs(phase)) return;
    const prompt = buildPromptClient(phase);
    const showPanel = () => {
      const panel = document.getElementById('copyPromptPanel');
      if (panel) panel.classList.add('visible');
    };
    navigator.clipboard.writeText(prompt).then(showPanel).catch(showPanel);
  });

  const pasteArea = document.getElementById('pasteArea');
  if (pasteArea) {
    pasteArea.addEventListener('input', () => {
      const text   = pasteArea.value.trim();
      const status = document.getElementById('parseStatus');
      if (!text) { if (status) { status.textContent = ''; status.className = 'cpp-parse-status'; } return; }

      const result = parseAIResponse(text);
      if (result) {
        if (status) { status.textContent = '✓ Parsed — applying results…'; status.className = 'cpp-parse-status success'; }
        setTimeout(() => applyAIResult(phase, result), 500);
      } else {
        if (status) {
          status.textContent = 'Could not parse that response. Try copying just the JSON block, or ask your AI to respond with JSON only.';
          status.className = 'cpp-parse-status error';
        }
      }
    });
  }
}

function attachPrinciplesListeners() {
  const p = state.principles;
  setupStickyArea('stickiesArea', p.ideas, 'principles', null, 'addStickyBtn',
    () => { p.ideas.push(''); renderPhaseContent(); focusLastStickyIn('stickiesArea'); },
    (ref) => { removeStickyByRef(p.ideas, ref); renderPhaseContent(); },
    (el) => { setStickyValue(p.ideas, el); refreshAIBtn('synthesizeBtn', p.ideas.some(s => ideaValue(s).trim())); }
  );
  attachAIBarListeners('principles');
  attachOptionGrid('optionCardsGrid', {
    onToggle: (idx) => {
      p.selected.has(idx) ? p.selected.delete(idx) : p.selected.add(idx);
      emitSelection('principles', [...p.selected]);
    },
    onEdit: (el) => {
      const idx = parseInt(el.dataset.optionIdx);
      if (el.dataset.field === 'title') p.aiResult[idx].title = el.innerText.trim();
      if (el.dataset.field === 'desc')  p.aiResult[idx].description = el.innerText.trim();
    },
    finalizeId: 'finalizeBtn',
    onFinalize: () => finalizePrinciples()
  });
  document.querySelectorAll('.sticky-input').forEach(autoResizeTextarea);
}

function attachPurposeListeners() {
  const p = state.purpose;
  ['who', 'struggle', 'change'].forEach(key => {
    setupStickyArea(`stickiesArea-${key}`, p[key], 'purpose', key, `addStickyBtn-${key}`,
      () => { p[key].push(''); renderPhaseContent(); focusLastStickyIn(`stickiesArea-${key}`); },
      (ref) => { removeStickyByRef(p[key], ref); renderPhaseContent(); },
      () => { refreshAIBtn('synthesizeBtn', [...p.who,...p.struggle,...p.change].some(s=>ideaValue(s).trim())); }
    );
  });
  attachAIBarListeners('purpose');
  const grid = document.getElementById('purposeCardsGrid');
  if (grid) {
    grid.addEventListener('click', e => {
      const card = e.target.closest('.purpose-statement-card');
      if (!card || e.target.contentEditable === 'true') return;
      const idx = parseInt(card.dataset.optionIdx);
      p.selectedIdx = p.selectedIdx === idx ? null : idx;
      emitSelection('purpose', p.selectedIdx);
      renderPhaseContent(); scrollToResults('purposeResults');
    });
    grid.addEventListener('input', e => {
      const span = e.target.closest('[data-option-idx]');
      if (span) p.aiResult[parseInt(span.dataset.optionIdx)] = span.innerText.trim();
    });
  }
  on('finalizeBtn', 'click', e => { addRipple(e); finalizePurpose(); });
  document.querySelectorAll('.sticky-input').forEach(autoResizeTextarea);
}

function attachMissionListeners() {
  const m = state.mission;
  const draftsEl = document.getElementById('madlibsDrafts');
  if (draftsEl) {
    draftsEl.addEventListener('input', e => {
      const input = e.target.closest('.madlibs-input'); if (!input) return;
      m.drafts[parseInt(input.dataset.draftIdx)][input.dataset.field] = input.value;
      refreshAIBtn('synthesizeBtn', m.drafts.some(d => d.solution.trim()||d.audience.trim()||d.outcome.trim()));
    });
    draftsEl.addEventListener('click', e => {
      const btn = e.target.closest('.madlibs-delete'); if (!btn) return;
      const idx = parseInt(btn.dataset.draftIdx);
      if (m.drafts.length === 1) m.drafts[0] = { solution:'', audience:'', outcome:'' };
      else m.drafts.splice(idx, 1);
      renderPhaseContent();
    });
  }
  on('addDraftBtn', 'click', () => { m.drafts.push({ solution:'', audience:'', outcome:'' }); renderPhaseContent(); });
  attachAIBarListeners('mission');
  const grid = document.getElementById('missionCardsGrid');
  if (grid) {
    grid.addEventListener('click', e => {
      const card = e.target.closest('.mission-option-card');
      if (!card || e.target.contentEditable === 'true') return;
      const idx = parseInt(card.dataset.optionIdx);
      m.selectedIdx = m.selectedIdx === idx ? null : idx;
      emitSelection('mission', m.selectedIdx);
      renderPhaseContent(); scrollToResults('missionResults');
    });
    grid.addEventListener('input', e => {
      const el = e.target.closest('[data-option-idx]');
      if (el) m.aiResult[parseInt(el.dataset.optionIdx)] = el.innerText.trim();
    });
  }
  on('finalizeBtn', 'click', e => { addRipple(e); finalizeMission(); });
}

function attachStrategyListeners() {
  const s = state.strategy;
  ['ux', 'technical', 'process', 'custom'].forEach(key => {
    setupStickyArea(`stickiesArea-${key}`, s.clusters[key], 'strategy', key, `addStickyBtn-${key}`,
      () => { s.clusters[key].push(''); renderPhaseContent(); },
      (ref) => { removeStickyByRef(s.clusters[key], ref); renderPhaseContent(); },
      () => { refreshAIBtn('synthesizeBtn', Object.values(s.clusters).flat().some(v=>ideaValue(v).trim())); }
    );
  });
  bindInput('customLabelInput', v => {
    s.customLabel = v;
    if (session.mode === 'host' && session.socket) session.socket.emit('strategy:customLabel', { label: v });
  });
  attachAIBarListeners('strategy');
  attachOptionGrid('strategyCardsGrid', {
    onToggle: (idx) => {
      if (s.selected.has(idx)) s.selected.delete(idx);
      else if (s.selected.size < 3) s.selected.add(idx);
      emitSelection('strategy', [...s.selected]);
    },
    onEdit: (el) => {
      const idx = parseInt(el.dataset.optionIdx);
      if (el.dataset.field === 'title') s.aiResult.pillars[idx].title = el.innerText.trim();
      if (el.dataset.field === 'desc')  s.aiResult.pillars[idx].description = el.innerText.trim();
    },
    finalizeId: 'finalizeBtn',
    onFinalize: () => finalizeStrategy()
  });
  document.querySelectorAll('.sticky-input').forEach(autoResizeTextarea);
}

function attachOKRsListeners() {
  const o = state.okrs;
  [0, 1].forEach(i => {
    bindInput(`objInput${i}`, v => {
      o.objectives[i] = v;
      if (session.mode === 'host' && session.socket) session.socket.emit('okr:objectives', { objectives: o.objectives });
      refreshAIBtn('synthesizeBtn', o.objectives[0].trim() && o.metricIdeas.some(s=>ideaValue(s).trim()));
    });
  });
  setupStickyArea('stickiesArea-metrics', o.metricIdeas, 'okrs', null, 'addStickyBtn-metrics',
    () => { o.metricIdeas.push(''); renderPhaseContent(); focusLastStickyIn('stickiesArea-metrics'); },
    (ref) => { removeStickyByRef(o.metricIdeas, ref); renderPhaseContent(); },
    () => { refreshAIBtn('synthesizeBtn', o.objectives[0].trim() && o.metricIdeas.some(s=>ideaValue(s).trim())); }
  );
  attachAIBarListeners('okrs');
  if (o.aiResult) {
    o.aiResult.forEach((_, objIdx) => {
      const grid = document.getElementById(`krGrid-${objIdx}`);
      if (!grid) return;
      grid.addEventListener('click', e => {
        const card = e.target.closest('.kr-option-card'); if (!card) return;
        const krIdx = parseInt(card.dataset.krIdx);
        const sel   = o.selected[objIdx]; if (!sel) return;
        sel.has(krIdx) ? sel.delete(krIdx) : (sel.size < 3 && sel.add(krIdx));
        emitSelection('okrs', o.selected.map(s => [...s]));
        renderPhaseContent(); scrollToResults('okrResults');
      });
    });
  }
  on('finalizeBtn', 'click', e => { addRipple(e); finalizeOKRs(); });
  document.querySelectorAll('.sticky-input').forEach(autoResizeTextarea);
}

function downloadStackJSON() {
  const today   = new Date();
  const payload = {
    teamName:   state.teamName   || 'Our Team',
    facilitator: state.facilitator || '',
    createdAt:  today.toISOString(),
    stack: {
      principles: state.stack.principles,
      purpose:    state.stack.purpose,
      mission:    state.stack.mission,
      strategy:   state.stack.strategy,
      okrs:       state.stack.okrs,
    }
  };
  const slug = (state.teamName || 'team').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const date = today.toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `vision-stack-${slug}-${date}.json` });
  a.click();
  URL.revokeObjectURL(url);
}

function attachOutputListeners() {
  [0, 1, 2].forEach(i => {
    const el = document.getElementById(`check${i}`);
    if (!el) return;
    el.addEventListener('click', () => {
      el.classList.toggle('checked');
      const svg = el.querySelector('svg');
      if (svg) svg.style.display = el.classList.contains('checked') ? 'block' : 'none';
    });
  });

  on('downloadJsonBtn', 'click', e => { addRipple(e); downloadStackJSON(); });
}


// ============================================================
// GENERIC STICKY HELPERS
// ============================================================

function setupStickyArea(areaId, arr, phase, slot, addBtnId, onAdd, onRemove, onChange) {
  delegateEvent(areaId, 'input', '.sticky-input', el => {
    setStickyValue(arr, el);
    autoResizeTextarea(el);
    onChange?.(el);
    // Emit edit to server if in host mode
    if (session.mode === 'host' && session.socket) {
      const id = el.dataset.ideaRef;
      if (id && isNaN(Number(id))) { // it's a UUID, not a solo index
        session.socket.emit('idea:edit', { phase, slot, id, value: el.value });
      }
    }
  });
  delegateEvent(areaId, 'keydown', '.sticky-input', (el, e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAdd(); }
  });
  delegateEvent(areaId, 'click', '.sticky-delete', el => {
    const ref = el.dataset.ideaRef;
    if (session.mode === 'host' && session.socket && isNaN(Number(ref))) {
      session.socket.emit('idea:remove', { phase, slot, id: ref });
    }
    onRemove(ref);
  });
  on(addBtnId, 'click', () => {
    if (session.mode === 'host' && session.socket) {
      // In host mode, new ideas go through server
      const id    = crypto.randomUUID?.() || `${Date.now()}`;
      const value = '';
      const idea  = { id, value, ownerSocketId: session.myId, ownerName: session.myName, ownerColor: session.myColor };
      arr.push(idea);
      renderPhaseContent();
      focusLastStickyIn(areaId);
      // Don't emit empty ideas — user will edit and emit:edit will handle it
    } else {
      onAdd();
    }
  });
}

// Update the value in a mixed string/object array
function setStickyValue(arr, el) {
  const ref = el.dataset.ideaRef;
  if (!ref) return;
  const numIdx = parseInt(ref);
  if (!isNaN(numIdx) && typeof arr[numIdx] === 'string') {
    arr[numIdx] = el.value;
  } else {
    const item = arr.find(i => typeof i === 'object' && i.id === ref);
    if (item) item.value = el.value;
  }
}

// Remove by ref (string index or UUID)
function removeStickyByRef(arr, ref) {
  const numIdx = parseInt(ref);
  if (!isNaN(numIdx) && !arr.find(i => typeof i === 'object' && i.id === ref)) {
    if (arr.length === 1) arr[0] = typeof arr[0] === 'string' ? '' : { ...arr[0], value: '' };
    else arr.splice(numIdx, 1);
  } else {
    const idx = arr.findIndex(i => typeof i === 'object' && i.id === ref);
    if (idx !== -1) arr.splice(idx, 1);
    if (arr.length === 0) arr.push('');
  }
}

function attachOptionGrid(gridId, { onToggle, onEdit, finalizeId, onFinalize }) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.addEventListener('click', e => {
    const card = e.target.closest('.option-card');
    if (!card || e.target.contentEditable === 'true') return;
    onToggle(parseInt(card.dataset.optionIdx));
    renderPhaseContent();
  });
  grid.addEventListener('input', e => {
    const el = e.target.closest('[data-option-idx]');
    if (el) onEdit(el);
  });
  on(finalizeId, 'click', e => { addRipple(e); onFinalize(); });
}


// ============================================================
// AI SYNTHESIS
// ============================================================

function gatherInputs(phase) {
  const vals = arr => arr.map(ideaValue).filter(v => v.trim());
  switch (phase) {
    case 'principles':
      return { ideas: vals(state.principles.ideas) };
    case 'purpose':
      return {
        who:      vals(state.purpose.who),
        struggle: vals(state.purpose.struggle),
        change:   vals(state.purpose.change),
      };
    case 'mission':
      return {
        drafts: state.mission.drafts.filter(
          d => d.solution.trim() || d.audience.trim() || d.outcome.trim()
        ),
      };
    case 'strategy': {
      const s = state.strategy;
      return {
        clusters: {
          ux:        vals(s.clusters.ux),
          technical: vals(s.clusters.technical),
          process:   vals(s.clusters.process),
          custom:    vals(s.clusters.custom),
        },
        customLabel: s.customLabel,
      };
    }
    case 'okrs':
      return {
        objectives:  state.okrs.objectives.filter(o => o.trim()),
        metricIdeas: vals(state.okrs.metricIdeas),
      };
    default:
      return {};
  }
}

function hasEnoughInputs(phase) {
  const inputs = gatherInputs(phase);
  switch (phase) {
    case 'principles': return inputs.ideas.length > 0;
    case 'purpose':    return inputs.who.length > 0 || inputs.struggle.length > 0 || inputs.change.length > 0;
    case 'mission':    return inputs.drafts.length > 0;
    case 'strategy':   return Object.values(inputs.clusters).some(arr => arr.length > 0);
    case 'okrs':       return inputs.objectives.length > 0 && inputs.metricIdeas.length > 0;
    default:           return true;
  }
}

async function runSynthesis(phase) {
  if (!hasEnoughInputs(phase)) return;

  const btn = document.getElementById('synthesizeBtn');
  if (!btn) return;
  btn.classList.add('loading');
  btn.innerHTML = `<span class="loading-dots"><span></span><span></span><span></span></span> Synthesizing…`;
  btn.disabled = true;

  // Tell participants we're synthesizing
  if (session.mode === 'host' && session.socket) {
    session.socket.emit('ai:thinking', { phase });
  }

  let result;
  if (window.location.protocol === 'file:') {
    // No server available in file:// mode — use mock data
    await delay(1800);
    result = mockAISynthesis(phase);
  } else {
    try {
      const resp = await fetch('/api/synthesize', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phase, inputs: gatherInputs(phase) }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || 'AI synthesis failed');
      }
      const data = await resp.json();
      result = data.result;
    } catch (err) {
      btn.classList.remove('loading');
      btn.innerHTML = 'Synthesize with AI';
      btn.disabled = false;
      const flash = document.createElement('p');
      flash.style.cssText = 'color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-top:12px;font-size:13px;';
      flash.textContent = '⚠ ' + (err.message || 'AI synthesis failed. Please try again.');
      btn.insertAdjacentElement('afterend', flash);
      setTimeout(() => flash.remove(), 8000);
      return;
    }
  }

  switch (phase) {
    case 'principles': state.principles.aiResult = result; state.principles.selected = new Set(); break;
    case 'purpose':    state.purpose.aiResult    = result; state.purpose.selectedIdx  = null; break;
    case 'mission':    state.mission.aiResult    = result; state.mission.selectedIdx  = null; break;
    case 'strategy':   state.strategy.aiResult   = result; state.strategy.selected    = new Set(); break;
    case 'okrs':       state.okrs.aiResult        = result; state.okrs.selected        = result.map(() => new Set()); break;
  }

  // Broadcast AI result to all participants
  if (session.mode === 'host' && session.socket) {
    session.socket.emit('ai:result', { phase, result });
  }

  renderPhaseContent();
  scrollToResults(null);
}


// ============================================================
// FINALIZE FUNCTIONS
// ============================================================

function finalizePrinciples() {
  const p = state.principles;
  const data = [...p.selected].map(i => ({ title: p.aiResult[i].title, description: p.aiResult[i].description }));
  state.stack.principles = data;
  emitStackCommit('principles', data);
  renderSidebar(); goToPhase('purpose');
}

function finalizePurpose() {
  const data = state.purpose.aiResult[state.purpose.selectedIdx];
  state.stack.purpose = data;
  emitStackCommit('purpose', data);
  renderSidebar(); goToPhase('mission');
}

function finalizeMission() {
  const data = state.mission.aiResult[state.mission.selectedIdx];
  state.stack.mission = data;
  emitStackCommit('mission', data);
  renderSidebar(); goToPhase('strategy');
}

function finalizeStrategy() {
  const s = state.strategy;
  const data = [...s.selected].map(i => ({ title: s.aiResult.pillars[i].title, description: s.aiResult.pillars[i].description }));
  state.stack.strategy = data;
  emitStackCommit('strategy', data);
  renderSidebar(); goToPhase('okrs');
}

function finalizeOKRs() {
  const o = state.okrs;
  const data = o.aiResult.map((objData, objIdx) => ({
    objective: objData.objective,
    keyResults: [...o.selected[objIdx]].map(krIdx => objData.keyResults[krIdx])
  })).filter(obj => obj.keyResults.length > 0);
  state.stack.okrs = data;
  emitStackCommit('okrs', data);
  renderSidebar(); goToPhase('output');
}

// Emit stack commit + phase advance to server
function emitStackCommit(layer, data) {
  if (session.mode === 'host' && session.socket) {
    session.socket.emit('stack:commit', { layer, data });
  }
}

function emitSelection(phase, selection) {
  if (session.mode === 'host' && session.socket) {
    session.socket.emit('selection:update', { phase, selection });
  }
}


// ============================================================
// PERSISTENCE (solo mode — localStorage)
// ============================================================

const STORAGE_KEY = 'vs:solo';

function saveState() {
  if (session.mode !== 'solo') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      teamName:    state.teamName,
      facilitator: state.facilitator,
      phase:       state.phase,
      stack:       state.stack,
      principles:  { ideas: state.principles.ideas, aiResult: state.principles.aiResult, selected: [...state.principles.selected] },
      purpose:     state.purpose,
      mission:     state.mission,
      strategy:    { clusters: state.strategy.clusters, customLabel: state.strategy.customLabel, aiResult: state.strategy.aiResult, selected: [...state.strategy.selected] },
      okrs:        { objectives: state.okrs.objectives, metricIdeas: state.okrs.metricIdeas, aiResult: state.okrs.aiResult, selected: state.okrs.selected.map(s => [...s]) },
    }));
  } catch(e) {}
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    state.teamName    = s.teamName    || '';
    state.facilitator = s.facilitator || '';
    state.phase       = s.phase       || 'principles';
    state.stack       = s.stack       || state.stack;
    if (s.principles) {
      state.principles.ideas    = s.principles.ideas    || [''];
      state.principles.aiResult = s.principles.aiResult || null;
      state.principles.selected = new Set(s.principles.selected || []);
    }
    if (s.purpose)  Object.assign(state.purpose,  s.purpose);
    if (s.mission)  Object.assign(state.mission,  s.mission);
    if (s.strategy) {
      Object.assign(state.strategy, s.strategy);
      state.strategy.selected = new Set(s.strategy.selected || []);
    }
    if (s.okrs) {
      Object.assign(state.okrs, s.okrs);
      state.okrs.selected = (s.okrs.selected || []).map(arr => new Set(arr));
    }
    return true;
  } catch(e) { return false; }
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

function getSavedMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { teamName, phase } = JSON.parse(raw);
    return { teamName, phase };
  } catch(e) { return null; }
}


// ============================================================
// NAVIGATION
// ============================================================

function goToPhase(phase) {
  state.phase = phase;
  if (session.mode === 'host' && session.socket) {
    session.socket.emit('phase:advance', { phase });
  }
  saveState();
  render();
  document.getElementById('phaseContent').scrollTop = 0;
}


// ============================================================
// SOCKET LAYER
// ============================================================

function initSocket() {
  if (typeof io === 'undefined') {
    console.warn('Socket.io not available — multiplayer disabled. Open via http://localhost:3000');
    return;
  }
  session.socket = io();
  setupSocketHandlers();
}

function connectAsHost(teamName, facilitatorName) {
  if (!session.socket) { initSocket(); }
  if (!session.socket) return;

  session.myName  = facilitatorName;
  session.socket.emit('host:create', { teamName, facilitatorName });
}

function connectAsParticipant(code, name) {
  if (!session.socket) { initSocket(); }
  if (!session.socket) { showLobbyError('joinError', 'Could not connect to server.'); return; }

  session.myName = name;
  session.socket.emit('participant:join', { code, name });
}

function setupSocketHandlers() {
  const sock = session.socket;
  if (!sock) return;

  // ---- HOST EVENTS ----

  sock.on('host:ready', ({ code, myColor }) => {
    session.mode     = 'host';
    session.roomCode = code;
    session.myId     = sock.id;
    session.myColor  = myColor;
    state.phase      = 'principles';
    render();
  });

  // ---- PARTICIPANT EVENTS ----

  sock.on('participant:ready', ({ myColor, myName, phase, teamName, facilitatorName, ideas, aiResults, selections, stack }) => {
    session.mode     = 'participant';
    session.myId     = sock.id;
    session.myColor  = myColor;
    session.myName   = myName;

    // Populate live state from server snapshot
    session.live.phase       = phase;
    session.live.teamName    = teamName;
    session.live.ideas       = ideas;
    session.live.aiResults   = aiResults;
    session.live.selections  = selections;
    session.live.stack       = stack;

    render();
  });

  sock.on('join:error', (msg) => {
    showLobbyError('joinError', msg);
  });

  // ---- SHARED EVENTS ----

  sock.on('presence:update', (participants) => {
    session.presence = participants;
    renderPresenceBar();
  });

  sock.on('ideas:update', ({ phase, slot, ideas }) => {
    // Update correct array in both host state and live state
    if (session.mode === 'host') {
      // Update host's state arrays
      if (phase === 'principles') state.principles.ideas = ideas;
      else if (phase === 'purpose' && slot) state.purpose[slot] = ideas;
      else if (phase === 'strategy' && slot) state.strategy.clusters[slot] = ideas;
      else if (phase === 'okrs') state.okrs.metricIdeas = ideas;
      else if (phase === 'mission') { /* mission ideas handled differently */ }
    }
    // Always update live state
    if (phase === 'principles') session.live.ideas.principles = ideas;
    else if (phase === 'purpose' && slot) session.live.ideas.purpose[slot] = ideas;
    else if (phase === 'strategy' && slot) session.live.ideas.strategy[slot] = ideas;
    else if (phase === 'okrs') session.live.ideas.okrs.metrics = ideas;
    else if (phase === 'mission') session.live.ideas.mission = ideas;

    renderFromSocket();
  });

  sock.on('phase:changed', ({ phase }) => {
    session.live.phase = phase;
    session.live.status = 'idle';
    if (session.mode === 'participant') {
      render();
      document.getElementById('phaseContent').scrollTop = 0;
    }
  });

  sock.on('ai:thinking', ({ phase }) => {
    session.live.status = 'synthesizing';
    if (session.mode === 'participant') renderFromSocket();
  });

  sock.on('ai:result', ({ phase, result }) => {
    session.live.aiResults[phase] = result;
    session.live.status = 'selecting';
    if (session.mode === 'participant') renderFromSocket();
  });

  sock.on('selection:changed', ({ phase, selection }) => {
    session.live.selections[phase] = selection;
    if (session.mode === 'participant') renderFromSocket();
  });

  sock.on('stack:updated', ({ stack }) => {
    session.live.stack   = stack;
    session.live.status  = 'idle';
    renderSidebar();
  });

  sock.on('okr:objectives', ({ objectives }) => {
    session.live.ideas.okrs.objectives = objectives;
    if (session.mode === 'participant') renderFromSocket();
  });

  sock.on('strategy:customLabel', ({ label }) => {
    session.live.ideas.customLabel = label;
    if (session.mode === 'participant') renderFromSocket();
  });

  sock.on('disconnect', () => {
    if (session.mode === 'participant') {
      const el = document.getElementById('phaseContent');
      if (el) el.innerHTML = `
        <div class="phase-view" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;text-align:center">
          <p style="font-size:32px;margin-bottom:16px">🔌</p>
          <h2 style="font-size:20px;font-weight:600;margin-bottom:8px">Disconnected</h2>
          <p style="color:var(--text-secondary);margin-bottom:24px">Reconnecting…</p>
        </div>`;
    }
  });
}


// ============================================================
// DOM UTILITIES
// ============================================================

function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function bindInput(id, setter) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => setter(el.value));
}

function delegateEvent(parentId, event, selector, handler) {
  const parent = document.getElementById(parentId);
  if (!parent) return;
  parent.addEventListener(event, e => {
    const target = e.target.closest(selector);
    if (target && parent.contains(target)) handler(target, e);
  });
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function focusLastStickyIn(areaId) {
  requestAnimationFrame(() => {
    const area = document.getElementById(areaId);
    if (!area) return;
    const inputs = area.querySelectorAll('.sticky-input');
    inputs[inputs.length - 1]?.focus();
  });
}

function refreshAIBtn(id, enabled) {
  const btn = document.getElementById(id);
  if (btn) btn.disabled = !enabled;
}

function scrollToResults(id) {
  requestAnimationFrame(() => {
    const el = id ? document.getElementById(id) : document.querySelector('.ai-results-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function addRipple(e) {
  const btn = e.currentTarget; if (!btn) return;
  const circle = document.createElement('span'); circle.classList.add('ripple');
  const rect = btn.getBoundingClientRect(); const size = Math.max(rect.width, rect.height);
  circle.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
  btn.appendChild(circle); circle.addEventListener('animationend', () => circle.remove());
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }


// ============================================================
// BOOT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Only attempt socket if on actual server
  if (window.location.protocol !== 'file:') {
    // Wait for socket.io script to load
    const tryInit = setInterval(() => {
      if (typeof io !== 'undefined') { clearInterval(tryInit); initSocket(); }
    }, 50);
    setTimeout(() => clearInterval(tryInit), 3000); // give up after 3s
  }
  render();
});
