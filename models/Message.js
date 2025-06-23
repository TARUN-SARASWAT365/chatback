const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  user: String,
  reaction: String,
});

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
  seen: { type: Boolean, default: false },
  reactions: [reactionSchema], // New field
});

module.exports = mongoose.model('Message', messageSchema);
