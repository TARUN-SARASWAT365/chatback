// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  reactions: [{ user: String, reaction: String }],
  seen: { type: Boolean, default: false },
});

module.exports = mongoose.model('Message', messageSchema);
