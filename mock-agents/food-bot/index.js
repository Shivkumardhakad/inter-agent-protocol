const express = require('express');
const app = express();
const PORT = 3004;

app.use(express.json());

// Documentation Endpoint
// Documentation Endpoint
app.get('/docs', (req, res) => {
    res.json({
        agent: "FoodBot",
        description: "Handles burger and pizza orders",
        endpoints: {
            "/order/create": {
                method: "POST",
                params: ["item", "quantity", "address"],
                description: "Place a food order"
            }
        }
    });
});

// Order Endpoint
app.post('/order/create', (req, res) => {
    const { item, quantity, address } = req.body;

    // Default quantity to 1 if missing
    const finalQuantity = quantity || 1;

    if (!item || !address) {
        return res.status(400).json({
            error: "Missing required fields: item, address"
        });
    }

    const orderId = "ORD-" + Math.floor(Math.random() * 100000);
    const eta = Math.floor(Math.random() * (60 - 20 + 1)) + 20; // 20 to 60 mins

    console.log(`[FoodBot] Order Received: ${finalQuantity}x ${item} to ${address}`);

    res.json({
        success: true,
        order_id: orderId,
        status: "PREPARING",
        message: `Your order for ${finalQuantity}x ${item} is confirmed.`,
        estimated_delivery: `${eta} minutes`,
        total_price: `$${(Math.random() * 50 + 10).toFixed(2)}`
    });
});

app.listen(PORT, async () => {
    console.log(`FoodBot listening on port ${PORT}`);

    // Auto-Register
    try {
        const axios = require('axios');
        await axios.post('http://localhost:3000/registry/register', {
            name: "FoodBot",
            url: `http://localhost:${PORT}`,
            description: "Food delivery service. can order meals like Pizza, Burgers, Sushi etc."
        });
        console.log("[FoodBot] Registered with Proxy successfully.");
    } catch (e) {
        console.log("[FoodBot] Registration failed (Proxy might be down):", e.message);
    }
});
