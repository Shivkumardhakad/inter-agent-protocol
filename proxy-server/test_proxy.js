const axios = require('axios');

async function testProxyFlow() {
    try {
        console.log("Sending request to Proxy...");
        const response = await axios({
            method: 'post',
            url: 'http://localhost:3000/proxy/execute',
            data: {
                userIntent: "Order 2 Burgers to 555 Main Street",
                sessionId: "debug-session-1"
            },
            responseType: 'stream'
        });

        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    console.log("Received:", line);
                }
            });
        });

        response.data.on('end', () => {
            console.log("Stream ended.");
        });

    } catch (e) {
        console.error("Proxy Request Failed:", e.message);
        if (e.response) {
            console.log("Status:", e.response.status);
            e.response.data.on('data', d => console.log(d.toString()));
        }
    }
}

testProxyFlow();
