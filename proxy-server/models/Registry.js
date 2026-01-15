const mongoose = require('mongoose');

const registrySchema = new mongoose.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    type: { type: String, enum: ['MOCK', 'EXTERNAL'], default: 'MOCK' },
    staticDocs: { type: String }, // For external APIs that don't have a /docs endpoint
    lastSeen: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Registry', registrySchema);
