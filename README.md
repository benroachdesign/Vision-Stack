# Vision Stack Workshop

An AI-powered facilitation tool for guiding teams through building their **Vision Stack** — the five strategic layers that define how a team works, why it exists, and how it measures success.

Built with Vanilla HTML, CSS, and JavaScript. No framework. No build step. Just Node.js for the server.

---

## What is a Vision Stack?

| Layer | Question |
|---|---|
| **Principles** | How do we work? |
| **Purpose** | Why do we exist? |
| **Mission** | What do we do? |
| **Strategy** | How do we win? |
| **OKRs** | How do we measure success? |

Each phase is a structured workshop activity. The facilitator guides the team through brainstorming, AI synthesis, and selection. The output is a shareable, printable artifact.

---

## Prerequisites

- [Node.js](https://nodejs.org) v18 or later
- An Anthropic API key — get one at [console.anthropic.com](https://console.anthropic.com)

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/benroachdesign/Vision-Stack.git
cd Vision-Stack

# 2. Install dependencies
npm install

# 3. Start the server with your API key
ANTHROPIC_API_KEY=sk-ant-your-key-here npm start

# 4. Open in your browser
open http://localhost:3000
```

> **Windows (Command Prompt):**
> ```cmd
> set ANTHROPIC_API_KEY=sk-ant-your-key-here && npm start
> ```
> **Windows (PowerShell):**
> ```powershell
> $env:ANTHROPIC_API_KEY="sk-ant-your-key-here"; npm start
> ```

The app opens to a lobby where you can host a team session or run solo.

---

## Modes

### Solo Mode
Run the full workshop by yourself. No server required — open `index.html` directly in a browser. AI synthesis falls back to curated example output.

### Team Mode (Multiplayer)
Host a live session for your whole team. Everyone joins from their own browser and contributes ideas in real time.

1. The **facilitator** starts the server and opens `http://localhost:3000`
2. Click **Host a Workshop** and enter a team name
3. Share the 4-letter room code (e.g. `A3K9`) with participants
4. Participants open `http://localhost:3000` (or your ngrok URL) and click **Join a Session**
5. Participants add sticky notes; the facilitator drives the AI synthesis and finalizes each phase

---

## Remote Workshops

To run a workshop with a remote team, expose your local server with [ngrok](https://ngrok.com):

```bash
# In a second terminal (while the server is running)
npx ngrok http 3000
```

Share the `https://xxxx.ngrok.io` URL with your team. Everyone opens it in their browser — no install required on their end.

---

## Development

```bash
# Auto-restart on file changes
npm run dev
```

The server runs on port 3000 by default. Set `PORT=8080` (or any port) to change it.

---

## Workshop Flow

Each phase follows the same rhythm: **brainstorm → AI synthesis → select → finalize**.

| # | Phase | Time | What happens |
|---|---|---|---|
| 1 | **Principles** | 45 min | Team writes specific behaviors. AI clusters them into 4–6 principles. Facilitator selects the keepers. |
| 2 | **Purpose** | 30 min | Team answers three prompts (who, struggle, change). AI generates 7 purpose statements. Team picks one. |
| 3 | **Mission** | 40 min | Team drafts mission fragments. AI synthesizes 4 polished statements. Team picks one. |
| — | *Break* | 20 min | |
| 4 | **Strategy** | 50 min | Team fills four focus clusters. AI proposes 3 strategic pillars + a critique. Team refines and selects. |
| 5 | **OKRs** | 40 min | Team sets 1–2 objectives and brainstorms metrics. AI generates 4 SMART Key Results per objective. |
| ✓ | **Output** | 15 min | Full Vision Stack artifact generated. Export as PDF or share the URL. |

---

## AI Synthesis

Each phase has a **Synthesize with AI** button. This sends the team's brainstormed ideas to Claude (Opus 4.6) and returns structured, workshop-ready output.

If `ANTHROPIC_API_KEY` is not set:
- The lobby shows an amber warning badge
- The setup page shows an inline note
- Clicking Synthesize returns curated example output instead of real AI results — the workshop still runs end-to-end

---

## Exporting Output

On the final Output screen, click **Export PDF**. The page prints in a clean single-column layout with all five Vision Stack layers. Use your browser's "Save as PDF" option.

---

## Project Structure

```
Vision Stack/
├── index.html      # App shell (two-panel layout)
├── styles.css      # All styles (~2,400 lines, no framework)
├── app.js          # Full client-side app logic + multiplayer
├── server.js       # Express + Socket.io server + AI proxy
├── package.json
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript |
| Realtime | Socket.io |
| Server | Node.js + Express |
| AI | Anthropic Claude API (`claude-opus-4-6`) |
| Fonts | Inter (Google Fonts) |
