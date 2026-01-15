const axios = require('axios');

async function testFoodBot() {
    try {
        console.log("Testing FoodBot direct access...");
        const res = await axios.post('http://localhost:3004/order/create', {
            item: "Pizza",
            quantity: 2,
            address: "123 Test St"
        });
        console.log("Success!", res.data);
    } catch (e) {
        console.error("Failed:", e.message);
        if (e.response) console.error("Data:", e.response.data);
    }
}

testFoodBot();
