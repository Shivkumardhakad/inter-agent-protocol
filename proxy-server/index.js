const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');
const Mapping = require('./models/Mapping');
const Registry = require('./models/Registry');
const Session = require('./models/Session');
const { generatePayload, summarizeResponse, decomposeIntent } = require('./services/aiService');

const app = express();
const PORT = 3000;
const cors = require('cors');

app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-agent-proxy', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Helper: Hash Intent
function hashIntent(intent) {
    return crypto.createHash('md5').update(intent.toLowerCase().trim()).digest('hex');
}

// Helper: Stream Event
function sendEvent(res, type, data) {
    res.write(JSON.stringify({ type, ...data }) + '\n');
}

// POST /registry/register
app.post('/registry/register', async (req, res) => {
    const { name, url, description, type, staticDocs } = req.body;
    if (!name || !url || !description) return res.status(400).json({ error: "Missing fields" });

    try {
        await Registry.updateOne(
            { url },
            { name, url, description, type, staticDocs, lastSeen: new Date() },
            { upsert: true }
        );
        console.log(`[Registry] Registered: ${name} (${url})`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/v1/registry/status
app.get('/api/v1/registry/status', async (req, res) => {
    const breaker = require('./services/CircuitBreaker');
    try {
        const agents = await Registry.find({});
        const statusData = agents.map(agent => {
            const state = breaker.stats.get(agent.url) || {
                status: 'CLOSED', // Default to Healthy/Closed if not tracked yet
                failures: 0,
                lastFailureTime: null
            };

            return {
                id: agent._id,
                name: agent.name || "Unknown Agent",
                url: agent.url,
                description: agent.description || "No description provided.",
                status: state.status, // OPEN, CLOSED, or HALF_OPEN
                failures: state.failures,
                lastFailure: state.lastFailureTime ? new Date(state.lastFailureTime).toLocaleTimeString() : 'N/A'
            };
        });
        res.json(statusData);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch registry status" });
    }
});

// POST /proxy/execute (Streaming Version)
app.post('/proxy/execute', async (req, res) => {
    let { targetUrl, userIntent, sessionId } = req.body;

    if (!userIntent) {
        return res.status(400).json({ error: "Missing userIntent" });
    }

    // Headers for Streaming
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        // --- SESSION MANAGEMENT ---
        let session;
        if (sessionId) {
            session = await Session.findOne({ sessionId });
            if (!session) session = new Session({ sessionId });
        } else {
            session = new Session({ sessionId: crypto.randomUUID() });
        }

        console.log(`\n[Proxy] Request: "${userIntent}" (Session: ${session.sessionId})`);
        sendEvent(res, "status", { message: "Analyzing Context & Intent..." });

        // Mode 1: Direct URL
        if (targetUrl) {
            sendEvent(res, "status", { message: `Target provided: ${targetUrl}. Executing...` });
            const result = await executeSingleRequest(targetUrl, userIntent, res);
            sendEvent(res, "result", {
                agent: "Direct Target",
                action: "Single Execution",
                summary: result.summary,
                reasoning: result.reasoning,
                result: result.target_response
            });
            sendEvent(res, "done", {});
            return res.end();
        }

        // Mode 2: Auto-Discovery & Orchestration
        sendEvent(res, "status", { message: "Orchestrating Agents..." });

        const agents = await Registry.find({});
        const agentList = agents.map(a => ({ name: a.name, description: a.description, url: a.url }));

        // Decompose with HISTORY
        const decomposition = await decomposeIntent(userIntent, agentList, session.history);
        const { missionName, tasks } = decomposition;

        if (!tasks || tasks.length === 0) {
            sendEvent(res, "error", { message: "No suitable agents found." });
            return res.end();
        }

        // Send "Mission Start" Artifact
        sendEvent(res, "mission_start", { missionName, tasks });

        // Execute Tasks in PARALLEL
        await Promise.all(tasks.map(async (task) => {
            const agent = agentList.find(a => a.name === task.agentName);
            if (!agent) {
                sendEvent(res, "error", { message: `Agent ${task.agentName} not found.`, agentName: task.agentName });
                return;
            }

            sendEvent(res, "status", { message: `Contacting ${task.agentName}...`, agentName: task.agentName });

            try {
                const stepResult = await executeSingleRequest(agent.url, task.subIntent, res);

                sendEvent(res, "result", {
                    agentName: task.agentName,
                    action: task.subIntent,
                    verification: task.verification,
                    reasoning: `[Task Logic]: ${task.reasoning}\n[Execution Logic]: ${stepResult.reasoning}`,
                    summary: stepResult.summary,
                    result: stepResult.target_response
                });

            } catch (err) {
                let errorMsg = err.message;
                if (err.response && err.response.data) {
                    errorMsg += ` | Details: ${JSON.stringify(err.response.data)}`;
                }
                sendEvent(res, "error", { message: `Failed to execute ${task.agentName}: ${errorMsg}`, agentName: task.agentName });
            }
        }));

        // --- UPDATE HISTORY ---
        // 1. User Input
        session.history.push({ role: 'user', parts: [{ text: userIntent }] });

        // 2. Model Summary (We act as if the orchestration plan/results are the model's response)
        // We'll summarize the tasks into a single history entry for context next time.
        // If tasks is undefined/empty, we skip.
        if (tasks && tasks.length > 0) {
            const summaryText = tasks.map(t => `${t.agentName} executed '${t.subIntent}'`).join('. ');
            session.history.push({ role: 'model', parts: [{ text: summaryText }] });
        }

        // 3. Trim & Save
        if (session.history.length > 20) session.history = session.history.slice(-20);
        await session.save();

        sendEvent(res, "done", {});
        res.end();

    } catch (error) {
        console.error("Proxy Error:", error);
        sendEvent(res, "error", { message: error.message });
        res.end();
    }
});

// Helper: Execute Single Request
async function executeSingleRequest(targetUrl, userIntent, res, isRetry = false) {
    const breaker = require('./services/CircuitBreaker');
    const logger = require('./services/logger');
    const intentHash = hashIntent(userIntent);

    // 1. CIRCUIT BREAKER CHECK
    if (!breaker.canRequest(targetUrl)) {
        logger.warn(`Skipping request to ${targetUrl} (Offline/Cooling down)`);
        throw new Error('Target server is currently offline. Resource allocation suspended.');
    }

    try {
        const cachedMapping = await Mapping.findOne({ targetUrl, intentHash });
        let payload, endpointPath, method, reasoning;
        let source = "CACHE";

        if (cachedMapping) {
            console.log(`[Proxy -> ${targetUrl}] Cache HIT.`);
            const cachedData = cachedMapping.generatedJsonStructure;
            payload = cachedData.body;
            endpointPath = cachedData.endpoint || ""; // Fix: Handle null in cache
            method = cachedData.method;
            reasoning = cachedData.reasoning || "Cached from previous execution.";
        } else {
            console.log(`[Proxy -> ${targetUrl}] Cache MISS. Introspecting...`);

            let docContent = "";
            let agentRegistry = await Registry.findOne({ url: targetUrl });
            console.log(`[Proxy] Registry Lookup for ${targetUrl}:`, agentRegistry ? `Found (${agentRegistry.name})` : "Not Found");

            if (agentRegistry && agentRegistry.staticDocs) {
                console.log(`[Proxy] Using Static Docs for ${agentRegistry.name}`);
                docContent = agentRegistry.staticDocs;
            } else {
                // Fallback to Auto-Discovery (Parallel Fetch Strategy)
                try {
                    console.log(`[Proxy] probing /docs and /capabilities for ${targetUrl}...`);
                    const docRes = await Promise.any([
                        axios.get(`${targetUrl}/docs`, { timeout: 3000 }),
                        axios.get(`${targetUrl}/capabilities`, { timeout: 3000 })
                    ]);
                    docContent = typeof docRes.data === 'string' ? docRes.data : JSON.stringify(docRes.data);
                } catch (aggregateError) {
                    throw new Error("Could not fetch documentation from target agent (probed /docs and /capabilities).");
                }
            }

            const geminiResult = await generatePayload(userIntent, docContent);
            payload = geminiResult.body;
            endpointPath = geminiResult.endpoint || "";
            if (endpointPath === "null" || endpointPath === "undefined") endpointPath = ""; // Sanitize AI output

            method = geminiResult.method || 'POST';
            reasoning = geminiResult.reasoning;
            source = geminiResult.provider || "AI";

            await Mapping.create({
                targetUrl,
                intentHash,
                generatedJsonStructure: geminiResult
            });
        }

        const executionUrl = targetUrl.replace(/\/$/, '') + (endpointPath.startsWith('/') ? endpointPath : '/' + endpointPath);
        console.log(`[Proxy -> ${targetUrl}] Executing ${method} to ${executionUrl}`);

        // Headers construction
        let headers = { 'Content-Type': 'application/json' };
        let agentRegistry = await Registry.findOne({ url: targetUrl });
        if (agentRegistry && agentRegistry.name === 'GitHub') {
            if (process.env.GITHUB_TOKEN) {
                headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
                headers['User-Agent'] = 'Nexus-Proxy';
                console.log("[Proxy] Injected GitHub Token");
            }
        }

        const agentRes = await axios({
            method: method,
            url: executionUrl,
            data: payload,
            headers: headers,
            timeout: 5000
        });

        // 2. CIRCUIT BREAKER SUCCESS
        breaker.recordSuccess(targetUrl);

        const summary = await summarizeResponse(userIntent, agentRes.data);

        return {
            source,
            reasoning,
            summary,
            target_response: agentRes.data
        };

    } catch (error) {
        // 3. CIRCUIT BREAKER FAILURE (Catches Introspection OR Execution errors)
        breaker.recordFailure(targetUrl);

        if (error.code === 'ECONNABORTED') {
            logger.error(`TIMEOUT: Agent at ${targetUrl} failed to respond.`);
        }
        logger.error(`[Proxy] Execution Failed: ${error.message}`);
        console.error(`[Proxy] Execution Failed: ${error.message}`);

        // Self-Healing Logic (Recursion)
        // Be careful not to infinite loop if breaker is open now
        if (isRetry) throw error;

        // Check if we should retry (only if it was a cache logic error, NOT a connection error)
        // actually, if it's a connection error, breaker handles it. 
        // We only retry if we suspect the *mapping* was wrong, but if the *server* is down, retry fails too.
        // Let's keep specific self-healing for 400/500 errors from valid servers, 
        // but for network errors (ECONNREFUSED), we just stop.

        if (error.response && error.response.status >= 400 && error.response.status < 500 && !isRetry) {
            // Maybe mapping was bad?
            const intentHash = hashIntent(userIntent);
            await Mapping.deleteOne({ targetUrl, intentHash });
            return executeSingleRequest(targetUrl, userIntent, res, true);
        }

        throw error;
    }
}

app.listen(PORT, () => {
    console.log(`Proxy Server running on port ${PORT}`);
});
