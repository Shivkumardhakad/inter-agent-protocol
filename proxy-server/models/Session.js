const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true
    },
    // Gemini History Format: [{ role: 'user'|'model', parts: [{ text: '...' }] }]
    history: {
        type: Array,
        default: []
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
        expires: 3600 // TTL: 1 Hour
    }
});

module.exports = mongoose.model('Session', sessionSchema);
