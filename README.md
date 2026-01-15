# Semantic AI-Agent Proxy Layer

A middleware platform that allows a user client to interact with unknown external AI agents using natural language. It uses Google's Gemini API to introspect external agent capabilities and generate the correct API calls on the fly.

## Architecture

1.  **Mock Agents**: Two sample agents to test against.
    *   **SalonBot** (Port 3001): Books appointments.
    *   **LibraryBot** (Port 3002): Manages book loans.
2.  **Proxy Server** (Port 3000): The core system that handles orchestration, Gemini integration, and caching.
3.  **Frontend**: A simple HTML interface to test the flow.

## Prerequisites

1.  **Node.js**: Installed on your machine.
2.  **MongoDB**: Must be installed and running locally on port `27017`.
3.  **Gemini API Key**: You need a valid API key from Google AI Studio.

## Setup & Running

### 1. Configure the Proxy Server
1.  Navigate to `proxy-server/`.
2.  Rename `.env.example` to `.env` (if you haven't already).
3.  Open `.env` and paste your `GEMINI_API_KEY`.

### 2. Start the Mock Agents
You need these running so the proxy has someone to talk to.
**Terminal 1 (SalonBot):**
```bash
cd mock-agents/salon-bot
npm install
npm start
# Runs on http://localhost:3001
```

**Terminal 2 (LibraryBot):**
```bash
cd mock-agents/library-bot
npm install
npm start
# Runs on http://localhost:3002
```

### 3. Start the Main Proxy Server
**Terminal 3:**
```bash
cd proxy-server
npm install
npm start
# Runs on http://localhost:3000
```

### 4. Run the Frontend
1.  Go to the `frontend/` folder.
2.  Open `index.html` in your browser.

## How to Test
1.  In the web interface, select a "Preset" (e.g., SalonBot).
2.  The **Target URL** will fill with `http://localhost:3001`.
3.  Type a natural language intent (e.g., "I need a haircut at 5pm").
4.  Click **Execute Request**.

The system will:
1.  Check Cache (Miss).
2.  Fetch Docs from SalonBot.
3.  Ask Gemini to translate "haircut at 5pm" to JSON based on docs.
4.  Execute the API call to SalonBot.
5.  Return the confirmation to you.
