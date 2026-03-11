/* ============================================================
   VISION STACK — Real-Time Workshop Server
   Socket.io + Express | Run: node server.js
   ============================================================ */

const express    = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');
const path       = require('path');

const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ---- AI SYNTHESIS ------------------------------------------

function buildPrompt(phase, inputs) {
  switch (phase) {
    case 'principles': {
      const list = inputs.ideas.map((v, i) => `${i + 1}. ${v}`).join('\n');
      return `Act as an expert organizational designer. Review these team behaviors and cluster them into 4-6 distinct thematic principles. For each theme, provide a punchy, memorable title (2-4 words) and a 1-sentence description of the behavior.

Team behaviors:
${list}

Respond with ONLY a valid JSON array, no markdown, no extra text:
[{"title": "...", "description": "..."}, ...]`;
    }
    case 'purpose': {
      return `Based on these team inputs about who we help, their struggles, and our impact, generate 7 distinct, inspiring Purpose Statements. Each must be exactly one sentence long, evoke emotion, and explain the fundamental reason this team exists.

Who we help: ${inputs.who.join('; ')}
Their biggest struggles: ${inputs.struggle.join('; ')}
The change we create: ${inputs.change.join('; ')}

Respond with ONLY a valid JSON array of exactly 7 strings, no markdown, no extra text:
["statement 1", "statement 2", ...]`;
    }
    case 'mission': {
      const lines = inputs.drafts.map((d, i) =>
        `${i + 1}. We build ${d.solution || '...'} for ${d.audience || '...'} so they can ${d.outcome || '...'}`
      ).join('\n');
      return `I am facilitating a team strategy workshop. Analyze these rough mission statement drafts and synthesize the core ideas into exactly 4 polished, concise mission statements. Each should clearly define what we build, who it's for, and the outcome. Use the format "We build [X] for [Y] so they can [Z]."

Drafts:
${lines}

Respond with ONLY a valid JSON array of exactly 4 strings, no markdown, no extra text:
["We build ...", "We build ...", "We build ...", "We build ..."]`;
    }
    case 'strategy': {
      const clusters = [
        inputs.clusters.ux.length        && `UX & Design: ${inputs.clusters.ux.join(', ')}`,
        inputs.clusters.technical.length && `Technical: ${inputs.clusters.technical.join(', ')}`,
        inputs.clusters.process.length   && `Process & Operations: ${inputs.clusters.process.join(', ')}`,
        inputs.clusters.custom.length    && `${inputs.customLabel || 'Other'}: ${inputs.clusters.custom.join(', ')}`,
      ].filter(Boolean).join('\n');
      return `We are establishing our strategic pillars. Act as a critical business strategist. First, synthesize these inputs into exactly 3 clear strategic pillars. Then write an aggressive critique: point out what we are failing to prioritize, the risks, and how to make these pillars more rigorous.

Inputs:
${clusters}

Respond with ONLY a valid JSON object, no markdown, no extra text:
{"pillars": [{"title": "...", "description": "..."}, {"title": "...", "description": "..."}, {"title": "...", "description": "..."}], "critique": "..."}`;
    }
    case 'okrs': {
      const objLines = inputs.objectives.map((o, i) => `Objective ${i + 1}: ${o}`).join('\n');
      return `Here are our Objectives and rough metric ideas. For each objective, generate exactly 4 distinct, SMART (Specific, Measurable, Achievable, Relevant, Time-bound) Key Results. Make them aggressive but realistic.

${objLines}
Rough metric ideas: ${inputs.metricIdeas.join(', ')}

Respond with ONLY a valid JSON array (one object per objective), no markdown, no extra text:
[{"objective": "...", "keyResults": ["...", "...", "...", "..."]}, ...]`;
    }
    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}

app.get('/api/health', (req, res) => {
  res.json({ aiEnabled: !!process.env.ANTHROPIC_API_KEY });
});

app.post('/api/synthesize', async (req, res) => {
  const { phase, inputs } = req.body || {};
  if (!phase || !inputs) {
    return res.status(400).json({ error: 'Missing phase or inputs' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI synthesis is not configured. Set the ANTHROPIC_API_KEY environment variable and restart the server.' });
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client    = new Anthropic({ apiKey });
    const prompt    = buildPrompt(phase, inputs);

    const message = await client.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 2048,
      system:     'You are an expert facilitator and organizational strategist. Always respond with raw, valid JSON only — no markdown code fences, no prose, no explanations. Output must be directly parseable by JSON.parse().',
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw     = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch (_) {
      const m = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (!m) throw new Error('AI returned an unparseable response. Please try again.');
      result = JSON.parse(m[1]);
    }

    res.json({ result });
  } catch (err) {
    console.error(`[AI synthesis] phase=${phase} error:`, err.message);
    res.status(500).json({ error: err.message || 'AI synthesis failed' });
  }
});

// ---- SESSION STORE -----------------------------------------

const sessions = new Map(); // code -> session

const COLORS = [
  '#5b5bd6', '#16a34a', '#d97706', '#dc2626',
  '#7c3aed', '#0891b2', '#db2777', '#059669'
];

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function createSession(teamName, facilitatorName) {
  return {
    teamName,
    facilitatorName,
    hostSocketId: null,
    phase: 'principles',
    stack:      { principles: [], purpose: null, mission: null, strategy: [], okrs: [] },
    aiResults:  { principles: null, purpose: null, mission: null, strategy: null, okrs: null },
    selections: { principles: [], purpose: null, mission: null, strategy: [], okrs: [[], []] },
    ideas: {
      principles: [],
      purpose:    { who: [], struggle: [], change: [] },
      mission:    [],
      strategy:   { ux: [], technical: [], process: [], custom: [] },
      customLabel: 'Culture & People',
      okrs:       { objectives: ['', ''], metrics: [] }
    },
    participants: new Map()  // socketId → { name, color, isFacilitator }
  };
}

function getSlotArray(session, phase, slot) {
  const ideas = session.ideas;
  if (phase === 'principles') return ideas.principles;
  if (phase === 'purpose')    return ideas.purpose[slot];
  if (phase === 'strategy')   return ideas.strategy[slot];
  if (phase === 'okrs')       return ideas.okrs.metrics;
  if (phase === 'mission')    return ideas.mission;
  return null;
}

function serializePresence(session) {
  return [...session.participants.entries()].map(([id, p]) => ({ id, ...p }));
}

// ---- SOCKET EVENTS -----------------------------------------

io.on('connection', (socket) => {
  let roomCode = null;
  let role     = null;

  // HOST creates a new session
  socket.on('host:create', ({ teamName, facilitatorName }) => {
    let code;
    do { code = makeCode(); } while (sessions.has(code));

    const session          = createSession(teamName, facilitatorName);
    session.hostSocketId   = socket.id;
    const color            = COLORS[0];
    session.participants.set(socket.id, { name: facilitatorName || 'Facilitator', color, isFacilitator: true });

    sessions.set(code, session);
    roomCode = code;
    role     = 'facilitator';
    socket.join(code);

    socket.emit('host:ready', { code, myColor: color });
    broadcastPresence(code);
  });

  // PARTICIPANT joins an existing session
  socket.on('participant:join', ({ code, name }) => {
    code = (code || '').toUpperCase().trim();
    const session = sessions.get(code);

    if (!session) {
      socket.emit('join:error', 'Room not found. Double-check the code and try again.');
      return;
    }

    const usedColors = new Set([...session.participants.values()].map(p => p.color));
    const color      = COLORS.find(c => !usedColors.has(c)) || COLORS[session.participants.size % COLORS.length];

    session.participants.set(socket.id, { name: name || 'Participant', color, isFacilitator: false });
    roomCode = code;
    role     = 'participant';
    socket.join(code);

    // Send full current state so late joiners are in sync
    socket.emit('participant:ready', {
      myColor:          color,
      myName:           name,
      phase:            session.phase,
      teamName:         session.teamName,
      facilitatorName:  session.facilitatorName,
      ideas:            session.ideas,
      aiResults:        session.aiResults,
      selections:       session.selections,
      stack:            session.stack
    });

    broadcastPresence(code);
  });

  // ---- IDEA CRUD (any participant, including host) ----------

  socket.on('idea:add', ({ phase, slot, value, id }) => {
    if (!roomCode) return;
    const session = sessions.get(roomCode);
    const me      = session?.participants.get(socket.id);
    if (!session || !me) return;

    const arr  = getSlotArray(session, phase, slot);
    if (!arr) return;

    const idea = { id: id || randomUUID(), value, ownerSocketId: socket.id, ownerName: me.name, ownerColor: me.color };
    arr.push(idea);
    io.to(roomCode).emit('ideas:update', { phase, slot, ideas: arr });
  });

  socket.on('idea:edit', ({ phase, slot, id, value }) => {
    if (!roomCode) return;
    const session = sessions.get(roomCode);
    const me      = session?.participants.get(socket.id);
    const arr     = getSlotArray(session, phase, slot);
    if (!arr || !me) return;

    const idea = arr.find(i => i.id === id);
    if (idea && (idea.ownerSocketId === socket.id || me.isFacilitator)) {
      idea.value = value;
      io.to(roomCode).emit('ideas:update', { phase, slot, ideas: arr });
    }
  });

  socket.on('idea:remove', ({ phase, slot, id }) => {
    if (!roomCode) return;
    const session = sessions.get(roomCode);
    const me      = session?.participants.get(socket.id);
    const arr     = getSlotArray(session, phase, slot);
    if (!arr || !me) return;

    const idx = arr.findIndex(i => i.id === id);
    if (idx !== -1 && (arr[idx].ownerSocketId === socket.id || me.isFacilitator)) {
      arr.splice(idx, 1);
      io.to(roomCode).emit('ideas:update', { phase, slot, ideas: arr });
    }
  });

  // ---- FACILITATOR-ONLY EVENTS -----------------------------

  function isHost() { return role === 'facilitator'; }

  socket.on('phase:advance', ({ phase }) => {
    if (!isHost() || !roomCode) return;
    const session = sessions.get(roomCode);
    if (session) { session.phase = phase; io.to(roomCode).emit('phase:changed', { phase }); }
  });

  socket.on('ai:thinking', ({ phase }) => {
    if (!isHost() || !roomCode) return;
    io.to(roomCode).emit('ai:thinking', { phase });
  });

  socket.on('ai:result', ({ phase, result }) => {
    if (!isHost() || !roomCode) return;
    const session = sessions.get(roomCode);
    if (session) { session.aiResults[phase] = result; io.to(roomCode).emit('ai:result', { phase, result }); }
  });

  socket.on('selection:update', ({ phase, selection }) => {
    if (!isHost() || !roomCode) return;
    const session = sessions.get(roomCode);
    if (session) { session.selections[phase] = selection; io.to(roomCode).emit('selection:changed', { phase, selection }); }
  });

  socket.on('stack:commit', ({ layer, data }) => {
    if (!isHost() || !roomCode) return;
    const session = sessions.get(roomCode);
    if (session) { session.stack[layer] = data; io.to(roomCode).emit('stack:updated', { stack: session.stack }); }
  });

  socket.on('okr:objectives', ({ objectives }) => {
    if (!isHost() || !roomCode) return;
    const session = sessions.get(roomCode);
    if (session) { session.ideas.okrs.objectives = objectives; socket.to(roomCode).emit('okr:objectives', { objectives }); }
  });

  socket.on('strategy:customLabel', ({ label }) => {
    if (!isHost() || !roomCode) return;
    const session = sessions.get(roomCode);
    if (session) { session.ideas.customLabel = label; socket.to(roomCode).emit('strategy:customLabel', { label }); }
  });

  // ---- DISCONNECT ------------------------------------------

  socket.on('disconnect', () => {
    if (!roomCode) return;
    const session = sessions.get(roomCode);
    if (!session) return;
    session.participants.delete(socket.id);
    broadcastPresence(roomCode);
    // Clean up empty sessions after 30 min
    if (session.participants.size === 0) {
      setTimeout(() => {
        const s = sessions.get(roomCode);
        if (s && s.participants.size === 0) sessions.delete(roomCode);
      }, 30 * 60 * 1000);
    }
  });

  function broadcastPresence(code) {
    const session = sessions.get(code);
    if (!session) return;
    io.to(code).emit('presence:update', serializePresence(session));
  }
});

// ---- START -------------------------------------------------

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log('\n  Vision Stack Workshop Server');
  console.log('  ────────────────────────────────────────');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log('  Share your 4-letter room code with participants.');
  console.log('  For remote workshops, use: npx ngrok http 3000\n');
});
