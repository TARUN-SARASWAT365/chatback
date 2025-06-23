const express = require('express');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1/chat', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  content: String,
  timestamp: Date,
  reactions: [{ user: String, reaction: String }],
  seen: { type: Boolean, default: false },
});

const Message = mongoose.model('Message', messageSchema);

let onlineUsers = [];

io.on('connection', socket => {
  socket.on('user_connected', username => {
    socket.username = username;
    if (!onlineUsers.includes(username)) onlineUsers.push(username);
    io.emit('online_users', onlineUsers);
  });

  socket.on('send_message', async data => {
    const msg = await Message.create(data);
    io.emit('receive_message', msg);
  });

  socket.on('toggle_reaction', async ({ messageId, user, reaction }) => {
    const msg = await Message.findById(messageId);
    if (!msg) return;

    const index = msg.reactions.findIndex(r => r.user === user && r.reaction === reaction);
    if (index >= 0) {
      msg.reactions.splice(index, 1);
    } else {
      msg.reactions.push({ user, reaction });
    }
    await msg.save();
    io.emit('reaction_updated', { messageId, reactions: msg.reactions });
  });

  socket.on('mark_seen', async ({ sender, receiver }) => {
    const unseen = await Message.updateMany(
      { sender, receiver, seen: false },
      { $set: { seen: true } }
    );
    const updatedMessages = await Message.find({ sender, receiver });
    io.emit('messages_seen', { sender, receiver, updatedMessages });
  });

  socket.on('disconnect', () => {
    onlineUsers = onlineUsers.filter(u => u !== socket.username);
    io.emit('online_users', onlineUsers);
  });
});

app.get('/users', async (req, res) => {
  const messages = await Message.find();
  const usernames = Array.from(new Set([...messages.map(m => m.sender), ...messages.map(m => m.receiver)]));
  res.json(usernames.map(username => ({ username })));
});

app.get('/messages', async (req, res) => {
  const { sender, receiver } = req.query;
  const messages = await Message.find({
    $or: [
      { sender, receiver },
      { sender: receiver, receiver: sender }
    ]
  }).sort({ timestamp: 1 });
  res.json(messages);
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
  const url = `https://via.placeholder.com/300?text=${encodeURIComponent(req.file.originalname)}`;
  res.json({ url });
});

server.listen(process.env.PORT || 5000, () => console.log('Server running'));
