const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require('groq-sdk');

// --- 1. CONFIGURATION ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GROQ_SMART = "llama-3.3-70b-versatile";
const GROQ_FAST = "llama-3.1-8b-instant";

// --- 2. UNIFIED AI CALLER (THE FALLBACK LOGIC) ---
async function callAI(systemPrompt, userPrompt, history = []) {
    // 1. Helper to format history for Gemini (native format)
    // History in DB: [{ role: 'user', parts: [{ text: '...' }] }]
    // Gemini expects exactly this.

    // 2. Try Gemini
    try {
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        let chat;
        if (history.length > 0) {
            chat = model.startChat({ history: history });
        } else {
            chat = model.startChat();
        }

        const fullPrompt = `${systemPrompt}\n\nUser Input: ${userPrompt}`;
        const result = await chat.sendMessage(fullPrompt);
        const response = result.response.text();
        return { content: response, provider: 'GEMINI' };

    } catch (geminiError) {
        console.warn(`[AI Service] ⚠️ Gemini Failed (${geminiError.message}). Switching to Groq...`);

        // 3. Fallback to Groq
        // Convert history to Groq format: [{ role: 'user', content: '...' }]
        const groqMessages = [
            { role: "system", content: systemPrompt },
            ...history.map(h => ({
                role: h.role === 'model' ? 'assistant' : 'user',
                content: h.parts[0].text
            })),
            { role: "user", content: userPrompt }
        ];

        try {
            const completion = await groq.chat.completions.create({
                messages: groqMessages,
                model: GROQ_SMART,
                temperature: 0.1
            });
            return { content: completion.choices[0].message.content, provider: 'GROQ' };
        } catch (groqError) {
            console.error(`[AI Service] ❌ Groq Also Failed: ${groqError.message}`);
            throw new Error("All AI services failed.");
        }
    }
}

// --- 3. EXPORTED FUNCTIONS ---

async function generatePayload(userIntent, apiDocs, history = []) {
    const systemPrompt = `Act as an API integration expert.
    API Documentation: ${apiDocs}
    Task: Convert the User Intent into a VALID JSON Payload.
    Output Format (JSON Only):
    {
        "reasoning": "Explain WHY you chose this endpoint/payload. Use **bold**.",
        "endpoint": "/path/to/resource",
        "method": "POST",
        "body": { ... }
    }`;

    const res = await callAI(systemPrompt, userIntent, history);
    try {
        // Cleanup markdown code blocks if any
        const cleaned = res.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        // Inject provider info into the result object if it's an object, or return as separate prop if needed.
        // For Mapping schema compatibility, we might want to keep the structure clean or add it.
        // The calling code expects 'body', 'endpoint', etc.
        // We can attach 'provider' to the returned object.
        parsed.provider = res.provider;
        return parsed;
    } catch (e) {
        throw new Error("Failed to parse AI JSON response");
    }
}

async function summarizeResponse(userIntent, apiResponse, history = []) {
    const systemPrompt = `Act as a helpful AI assistant.
    Task: Write a friendly, natural language summary of the result.
    Rules:
    - Use **bold** for key details.
    - list items if multiple.
    - Concise (2-3 sentences).
    - Use Context from history if needed.`;

    const prompt = `User Intent: "${userIntent}"\nSystem Response: ${JSON.stringify(apiResponse)}`;
    const res = await callAI(systemPrompt, prompt, history);
    return res.content; // Summarize just returns the text string usually
}

async function decomposeIntent(userIntent, availableAgents, history = []) {
    const systemPrompt = `Act as a Mission Control Orchestrator.
    Available Agents: ${JSON.stringify(availableAgents)}
    Task: Break down the intent into a "Mission" with specific tasks for agents.
    
    CRITICAL RULE for 'subIntent':
    - INVALID: "Book haircut" (Too vague, lost the time)
    - VALID: "Book haircut for 5pm" (Preserves parameters)
    * YOU MUST COPY ALL details (dates, times, names, IDs, quantities) from the User Intent into the subIntent.

    Output Format (JSON Only):
    {
        "missionName": "Short, cool name for this operation (e.g. 'Operation Bookworm')",
        "tasks": [
            { 
                "agentName": "Name", 
                "subIntent": "Specific instruction including ALL parameters (time, date, etc)",
                "verification": "One sentence describing what success looks like for this specific step.",
                "reasoning": "Why?" 
            }
        ]
    }
    Context: Use history to resolve references.`;

    const res = await callAI(systemPrompt, userIntent, history);
    try {
        const cleaned = res.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        // Check if it's the new object format or fallback to array
        let tasks = [];
        let missionName = "Mission";

        if (Array.isArray(parsed)) {
            tasks = parsed;
        } else if (parsed.tasks) {
            tasks = parsed.tasks;
            missionName = parsed.missionName || missionName;
        }

        // Return object with tasks and name, or just tasks array if legacy
        // To be safe for now, let's attach missionName to the tasks array or return the object?
        // The proxy expects an array of tasks currently. We need to refactor proxy to handle object, 
        // OR we map it back to array but include metadata.
        // Let's return the full object and update proxy to handle it.
        return { missionName, tasks };
    } catch (e) {
        console.error("Decomposition Parse Error", e);
        return [];
    }
}

module.exports = { generatePayload, summarizeResponse, decomposeIntent };
