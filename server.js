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

// User schema for login
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
});

const User = mongoose.model('User', userSchema);

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

// --- LOGIN API ---
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }
    if (user.password !== password) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    res.json({ user: { username: user.username } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Optionally: register user API to add new users easily
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });

  try {
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ message: 'User already exists' });

    const newUser = new User({ username, password });
    await newUser.save();
    res.json({ message: 'User registered' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Socket.io connection
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
    await Message.updateMany(
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
