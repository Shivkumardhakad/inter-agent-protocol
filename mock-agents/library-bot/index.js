const express = require('express');
const app = express();
const PORT = 3002;

app.use(express.json());

// Capabilities Endpoint
app.get('/capabilities', (req, res) => {
    res.json({
        service_name: "LibraryBot",
        description: "Manages book loans for the city library.",
        endpoints: [
            {
                method: "POST",
                path: "/loan/borrow",
                description: "Borrow a book by ISBN.",
                parameters: {
                    isbn_id: "String (International Standard Book Number, e.g. 978-3-16-148410-0)",
                    duration_days: "Integer (Number of days to borrow, max 14)"
                }
            }
        ]
    });
});

// Loan Endpoint
app.post('/loan/borrow', (req, res) => {
    const { isbn_id, duration_days } = req.body;

    if (!isbn_id || !duration_days) {
        return res.status(400).json({
            error: "Missing required fields: isbn_id, duration_days"
        });
    }

    if (duration_days > 14) {
        return res.status(400).json({ error: "Max duration is 14 days." });
    }

    console.log(`[LibraryBot] Loan processed: ISBN ${isbn_id} for ${duration_days} days`);
    res.json({
        success: true,
        loan_id: "LIB-" + Date.now(),
        due_date: new Date(Date.now() + duration_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
});

app.listen(PORT, async () => {
    console.log(`LibraryBot listening on port ${PORT}`);

    // Auto-Register
    try {
        const axios = require('axios');
        await axios.post('https://inter-agent-protocol.onrender.com/registry/register', {
            name: "LibraryBot",
            url: `https://inter-agent-protocol-2.onrender.com`,
            description: "Manages book loans. Can borrow books given an ISBN and duration."
        });
        console.log("[LibraryBot] Registered with Proxy successfully.");
    } catch (e) {
        console.log("[LibraryBot] Registration failed (Proxy might be down):", e.message);
    }
});
