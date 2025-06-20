const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  content: String,
  fileUrl: String,
  fileType: String,
  timestamp: { type: Date, default: Date.now },
  seen: { type: Boolean, default: false }
});

module.exports = mongoose.model('Message', messageSchema);
