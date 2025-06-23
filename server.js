const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Mongoose schemas (User & Message)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  content: String,
  timestamp: Date,
  reactions: [{ user: String, reaction: String }],
  seen: { type: Boolean, default: false },
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1/chat', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.log('MongoDB connection error:', err));

// ========== USER ROUTES ==========

// Register new user
app.post('/api/users/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const userExists = await User.findOne({ username });
  if (userExists) return res.status(400).json({ error: 'Username already taken' });

  const user = new User({ username, password });
  await user.save();
  res.json({ message: 'User registered successfully' });
});

// Login user
app.post('/api/users/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = await User.findOne({ username });
  if (!user || user.password !== password) return res.status(400).json({ error: 'Invalid credentials' });

  res.json({ username: user.username });
});

// Get all users
app.get('/api/users', async (req, res) => {
  const users = await User.find({}, 'username');
  res.json(users);
});

// ========== MESSAGE ROUTES ==========

// Get messages between two users
app.get('/api/messages', async (req, res) => {
  const { sender, receiver } = req.query;
  if (!sender || !receiver) return res.status(400).json({ error: 'Sender and receiver required' });

  const messages = await Message.find({
    $or: [
      { sender, receiver },
      { sender: receiver, receiver: sender }
    ]
  }).sort({ timestamp: 1 });

  res.json(messages);
});

// Save new message
app.post('/api/messages', async (req, res) => {
  const { sender, receiver, content } = req.body;
  if (!sender || !receiver || !content) return res.status(400).json({ error: 'Missing fields' });

  const message = new Message({
    sender,
    receiver,
    content,
    timestamp: new Date(),
    reactions: [],
    seen: false,
  });

  await message.save();
  res.json(message);
});

// ======= SOCKET.IO =======

let onlineUsers = new Set();

io.on('connection', socket => {
  console.log('User connected:', socket.id);

  socket.on('user_connected', username => {
    socket.username = username;
    onlineUsers.add(username);
    io.emit('online_users', Array.from(onlineUsers));
  });

  socket.on('send_message', msg => {
    io.emit('receive_message', msg);
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      io.emit('online_users', Array.from(onlineUsers));
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
