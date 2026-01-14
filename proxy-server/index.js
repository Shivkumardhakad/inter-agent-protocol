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
    const { name, url, description } = req.body;
    if (!name || !url || !description) return res.status(400).json({ error: "Missing fields" });

    try {
        await Registry.updateOne(
            { url },
            { name, url, description, lastSeen: new Date() },
            { upsert: true }
        );
        console.log(`[Registry] Registered: ${name} (${url})`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
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
            const result = await executeSingleRequest(targetUrl, userIntent);
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
        const tasks = await decomposeIntent(userIntent, agentList, session.history);

        if (!tasks || tasks.length === 0) {
            sendEvent(res, "error", { message: "No suitable agents found." });
            return res.end();
        }

        sendEvent(res, "plan", { tasks });

        // Execute Tasks
        for (const task of tasks) {
            const agent = agentList.find(a => a.name === task.agentName);
            if (!agent) {
                sendEvent(res, "error", { message: `Agent ${task.agentName} not found in registry.` });
                continue;
            }

            sendEvent(res, "status", { message: `Contacting ${task.agentName}...` });

            try {
                const stepResult = await executeSingleRequest(agent.url, task.subIntent, res);

                sendEvent(res, "result", {
                    agent: task.agentName,
                    action: task.subIntent,
                    reasoning: `[Task Logic]: ${task.reasoning}\n[Execution Logic]: ${stepResult.reasoning}`,
                    summary: stepResult.summary,
                    result: stepResult.target_response
                });

            } catch (err) {
                sendEvent(res, "error", { message: `Failed to execute ${task.agentName}: ${err.message}` });
            }
        }

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
    const intentHash = hashIntent(userIntent);
    const cachedMapping = await Mapping.findOne({ targetUrl, intentHash });

    let payload, endpointPath, method, reasoning;
    let source = "CACHE";

    if (cachedMapping) {
        console.log(`[Proxy -> ${targetUrl}] Cache HIT.`);
        const cachedData = cachedMapping.generatedJsonStructure;
        payload = cachedData.body;
        endpointPath = cachedData.endpoint;
        method = cachedData.method;
        reasoning = cachedData.reasoning || "Cached from previous execution.";
    } else {
        console.log(`[Proxy -> ${targetUrl}] Cache MISS. Introspecting...`);
        source = "GEMINI";

        let docContent = "";
        try {
            const docRes = await axios.get(`${targetUrl}/docs`);
            docContent = typeof docRes.data === 'string' ? docRes.data : JSON.stringify(docRes.data);
        } catch (e) {
            try {
                const capRes = await axios.get(`${targetUrl}/capabilities`);
                docContent = typeof capRes.data === 'string' ? capRes.data : JSON.stringify(capRes.data);
            } catch (e2) {
                throw new Error("Could not fetch documentation from target agent.");
            }
        }

        const geminiResult = await generatePayload(userIntent, docContent);

        payload = geminiResult.body;
        endpointPath = geminiResult.endpoint;
        method = geminiResult.method || 'POST';
        reasoning = geminiResult.reasoning;

        await Mapping.create({
            targetUrl,
            intentHash,
            generatedJsonStructure: geminiResult
        });
    }

    const executionUrl = targetUrl.replace(/\/$/, '') + endpointPath;
    console.log(`[Proxy -> ${targetUrl}] Executing ${method} to ${executionUrl}`);

    try {
        const agentRes = await axios({
            method: method,
            url: executionUrl,
            data: payload
        });

        const summary = await summarizeResponse(userIntent, agentRes.data);

        return {
            source,
            reasoning,
            summary,
            target_response: agentRes.data
        };
    } catch (error) {
        console.error(`[Proxy] Execution Failed: ${error.message}`);

        // Self-Healing Logic
        if (source === 'CACHE' && !isRetry) {
            const healingMsg = `[Self-Healing] Outdated mapping detected for ${targetUrl}. Deleting and re-trying...`;
            console.log(healingMsg);

            // Notify Frontend
            if (res) {
                res.write(JSON.stringify({ type: 'healing', message: '[RETRY] Cached mapping failed. Triggering AI Introspection...' }) + '\n');
            }

            await Mapping.deleteOne({ targetUrl, intentHash });
            // Recursively retry with forced introspection
            return executeSingleRequest(targetUrl, userIntent, res, true);
        }

        // If not a cache issue or already retried, throw the error
        throw error;
    }
}

app.listen(PORT, () => {
    console.log(`Proxy Server running on port ${PORT}`);
});
