const axios = require('axios');

const PROXY_URL = 'http://localhost:3000/proxy/execute';
const INTENT = "order 1 burger"; // Targets FoodBot
const ITERATIONS = 6;
const DELAY_MS = 1000; // 1 second between requests

async function runTest() {
    console.log("🧪 Starting Circuit Breaker Test...");
    console.log(`Target: FoodBot (${INTENT})`);
    console.log(`Plan: Send ${ITERATIONS} requests to trigger failures.\n`);

    for (let i = 1; i <= ITERATIONS; i++) {
        console.log(`--- Request ${i}/${ITERATIONS} ---`);
        const startTime = Date.now();

        try {
            const res = await axios.post(PROXY_URL, {
                userIntent: INTENT,
                sessionId: "circuit-test-session"
            });
            const duration = Date.now() - startTime;

            // The proxy returns a stream of JSON objects (NDJSON)
            // We need to check if any line contains an error
            const data = typeof res.data === 'object' ? JSON.stringify(res.data) : res.data;

            if (data.includes('"type":"error"')) {
                console.log(`❌ Failed (Logic Error) (${duration}ms)`);
                console.log(`   --> Response Dump: ${data}`);
                if (data.includes("offline") || data.includes("Circuit")) {
                    console.log(`   --> 🛡️ CIRCUIT BREAKER TRIPPED! (Expected)`);
                }
            } else {
                console.log(`✅ Success (${duration}ms)`);
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            if (error.response) {
                console.log(`❌ Failed (${duration}ms). Status: ${error.response.status}`);
                // If we get a 500/503 quickly, it means the circuit is functioning
                if (error.response.data && error.response.data.error) {
                    console.log(`   Message: ${error.response.data.error}`);
                }
            } else {
                console.log(`❌ Network Error (${duration}ms): ${error.message}`);
            }
        }

        // Wait a bit
        await new Promise(r => setTimeout(r, DELAY_MS));
    }
}

runTest();
