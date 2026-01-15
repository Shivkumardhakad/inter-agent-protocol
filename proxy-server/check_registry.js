const mongoose = require('mongoose');
const Registry = require('./models/Registry');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-agent-proxy')
    .then(async () => {
        console.log("Connected to DB. Fetching Registry...");
        const agents = await Registry.find({});
        console.log("--- Registered Agents ---");
        agents.forEach(a => console.log(`- ${a.name} (${a.url}) [Last Seen: ${a.lastSeen}]`));
        console.log("-------------------------");
        process.exit();
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
