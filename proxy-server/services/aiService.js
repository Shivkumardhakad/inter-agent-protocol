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

            // 4. Ultimate Fallback: Rule-Based Logic (For Demo Stability)
            console.warn("[AI Service] ⚠️ Switching to Rule-Based Fallback System");
            const fallbackResponse = ruleBasedFallback(userPrompt, systemPrompt);
            if (fallbackResponse) {
                return { content: fallbackResponse, provider: 'RULE_BASED' };
            }

            throw new Error("All AI services failed (Gemini, Groq, and Fallback).");
        }
    }
}

// --- RULE BASED FALLBACK (DETERMINISTIC) ---
function ruleBasedFallback(userPrompt, systemPrompt) {
    const input = userPrompt.toLowerCase();
    console.log(`[Fallback Debug] Checking Input: "${input}"`);
    console.log(`[Fallback Debug] System Prompt Snippet: "${systemPrompt.substring(0, 50)}..."`);

    // 1. Task Decomposition Fallback

    // 1. Task Decomposition Fallback
    if (systemPrompt.includes("Mission Control Orchestrator")) {
        // Food
        if (input.includes("order") || input.includes("food") || input.includes("pizza") || input.includes("burger")) {
            return JSON.stringify({
                missionName: "Operation Food Delivery",
                tasks: [{
                    agentName: "FoodBot",
                    subIntent: userPrompt,
                    verification: "Order placed successfully.",
                    reasoning: "User wants to order food, directing to FoodBot."
                }]
            });
        }
        // Weather
        if (input.includes("weather")) {
            return JSON.stringify({
                missionName: "Operation Weather Check",
                tasks: [{
                    agentName: "WeatherBot",
                    subIntent: userPrompt,
                    verification: "Weather report received.",
                    reasoning: "User asked for weather."
                }]
            });
        }
        // Salon
        if (input.includes("hair") || input.includes("cut") || input.includes("salon")) {
            return JSON.stringify({
                missionName: "Operation Grooming",
                tasks: [{
                    agentName: "SalonBot",
                    subIntent: userPrompt,
                    verification: "Appointment booked.",
                    reasoning: "User wants a haircut."
                }]
            });
        }
        // Library
        if (input.includes("book") || input.includes("borrow") || input.includes("library") || input.includes("isbn")) {
            return JSON.stringify({
                missionName: "Operation Knowledge",
                tasks: [{
                    agentName: "LibraryBot",
                    subIntent: userPrompt,
                    verification: "Book borrowed.",
                    reasoning: "User wants to borrow a book."
                }]
            });
        }
    }

    // 2. Payload Generation Fallback
    if (systemPrompt.includes("API integration expert")) {
        // FoodBot Payload
        // FoodBot Payload
        // Broader check: If it mentions food items OR "order" + "food" context
        const isFoodRequest = /pizza|burger|paneer|tikki|sushi|sandwich/i.test(input) || (input.includes("order") && input.includes("food"));

        if (isFoodRequest) {
            let item = "Food Item";
            if (input.includes("pizza")) item = "Pizza";
            else if (input.includes("burger")) item = "Burger";
            else if (input.includes("paneer")) item = "Paneer Tikki";
            else if (input.includes("sushi")) item = "Sushi";

            // Extract number or default to 1
            const qtyMatch = input.match(/(\d+)/);
            const quantity = qtyMatch ? parseInt(qtyMatch[0]) : 1;

            return JSON.stringify({
                reasoning: "Rule-based extraction for FoodBot (Robust Match)",
                endpoint: "/order/create",
                method: "POST",
                body: { item: item, quantity: quantity, address: "Detected Address or Default" }
            });
        }
        // WeatherBot Payload
        if (input.includes("weather")) {
            return JSON.stringify({
                reasoning: "Rule-based extraction for WeatherBot",
                endpoint: "/weather",
                method: "POST",
                body: { city: "London" } // Defaulting for demo
            });
        }
        // Salon Payload
        if (input.includes("hair")) {
            return JSON.stringify({
                reasoning: "Rule-based extraction for SalonBot",
                endpoint: "/bookings/create",
                method: "POST",
                body: { service_code: "HCUT", slot_time_24h: "14:00" }
            });
        }
        // Library Payload
        if (input.includes("borrow")) {
            return JSON.stringify({
                reasoning: "Rule-based extraction for LibraryBot",
                endpoint: "/loan/borrow",
                method: "POST",
                body: { isbn_id: "978-3-16-148410-0", duration_days: 7 }
            });
        }
    }

    // 3. Summarization Fallback
    if (systemPrompt.includes("summarize the result")) {
        return "Success! The operation was completed via rule-based fallback execution.";
    }

    return null;
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

    try {
        const res = await callAI(systemPrompt, userIntent, history);
        try {
            // Cleanup markdown code blocks if any
            const cleaned = res.content.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            parsed.provider = res.provider;
            return parsed;
        } catch (e) {
            throw new Error("Failed to parse AI JSON response");
        }
    } catch (error) {
        // Fallback/Throw so the main loop handles it (e.g. tries caching or self-healing)
        throw error;
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

    CRITICAL RULE for 'agentName':
    - YOU MUST use the EXACT \`name\` string from the "Available Agents" list.
    - DO NOT make up names like "GitHub Agent" if the list says "GitHub".
    - DO NOT create multiple tasks for the same action.

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

    try {
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

            return { missionName, tasks };
        } catch (e) {
            console.error("Decomposition Parse Error", e);
            return { missionName: "Failed Mission", tasks: [] };
        }
    } catch (aiError) {
        console.error("AI Service Error in decomposeIntent:", aiError.message);
        return { missionName: "AI Error", tasks: [] };
    }
}

module.exports = { generatePayload, summarizeResponse, decomposeIntent };
