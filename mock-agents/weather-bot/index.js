const express = require('express');
const app = express();
const PORT = 3003;

app.use(express.json());

// Documentation Endpoint
app.get('/docs', (req, res) => {
    res.send(`
        API Documentation for WeatherBot:
        -------------------------------
        Goal: Provide weather forecasts.
        
        Endpoint: POST /weather
        Description: Get current weather for a city.
        Required JSON Body:
        - "city": String (e.g., "London", "New York", "Tokyo")
        
        Example Payload:
        { "city": "London" }
    `);
});

// Weather Endpoint
app.post('/weather', (req, res) => {
    const { city } = req.body;

    if (!city) {
        return res.status(400).json({
            error: "Missing required field: city"
        });
    }

    // Simulate weather data
    const conditions = ["Sunny", "Rainy", "Cloudy", "Windy", "Snowy"];
    const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];
    const randomTemp = Math.floor(Math.random() * (30 - 10 + 1)) + 10; // 10 to 30

    console.log(`[WeatherBot] Weather request for: ${city}`);

    res.json({
        city: city,
        temperature: `${randomTemp}°C`,
        condition: randomCondition,
        humidity: `${Math.floor(Math.random() * 100)}%`,
        wind_speed: `${Math.floor(Math.random() * 20)} km/h`
    });
});

app.listen(PORT, async () => {
    console.log(`WeatherBot listening on port ${PORT}`);

    // Auto-Register
    try {
        const axios = require('axios');
        await axios.post('http://localhost:3000/registry/register', {
            name: "WeatherBot",
            url: `http://localhost:${PORT}`,
            description: "Provides weather forecasts. Can check weather for any city."
        });
        console.log("[WeatherBot] Registered with Proxy successfully.");
    } catch (e) {
        console.log("[WeatherBot] Registration failed (Proxy might be down):", e.message);
    }
});
