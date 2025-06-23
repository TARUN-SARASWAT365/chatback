const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  content: String,
  timestamp: Date,
  reactions: [{ user: String, reaction: String }],
  seen: { type: Boolean, default: false },
});

module.exports = mongoose.model('Message', messageSchema);
