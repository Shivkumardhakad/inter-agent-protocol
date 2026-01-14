const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require('groq-sdk');

// --- 1. CONFIGURATION ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const GEMINI_MODEL = "gemini-1.5-flash";
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
        return response;

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
            return completion.choices[0].message.content;
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
        const cleaned = res.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
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
    return await callAI(systemPrompt, prompt, history);
}

async function decomposeIntent(userIntent, availableAgents, history = []) {
    const systemPrompt = `Act as a Strategic Orchestrator.
    Available Agents: ${JSON.stringify(availableAgents)}
    Task: Break down the intent into sub-tasks for specific agents.
    Output Format (JSON Array):
    [ { "agentName": "Name", "subIntent": "Instruction", "reasoning": "Why?" } ]
    Context: Use history to resolve references (e.g. "borrow *that* book").`;

    const res = await callAI(systemPrompt, userIntent, history);
    try {
        const cleaned = res.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : (parsed.tasks || [parsed]);
    } catch (e) {
        console.error("Decomposition Parse Error", e);
        return [];
    }
}

module.exports = { generatePayload, summarizeResponse, decomposeIntent };
