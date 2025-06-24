require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const bcrypt = require('bcrypt');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = 'https://chat-qelj.vercel.app'; // aapke frontend ka URL

app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST', 'DELETE'],
  credentials: true,
}));

app.use(express.json());

// MongoDB connection
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('❌ MONGO_URI is not defined in environment variables!');
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  lastSeen: { type: Date, default: Date.now },
  profilePicUrl: String,
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
  reactions: [{ user: String, reaction: String }],
  status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
});
const Message = mongoose.model('Message', messageSchema);

// Routes same as before (register, login, get users, get messages, save messages, delete messages)...

app.post('/api/users/register', async (req, res) => {
  // same as before
});

app.post('/api/users/login', async (req, res) => {
  // same as before
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username lastSeen profilePicUrl');
    res.json(users);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/messages', async (req, res) => {
  // same as before
});

app.post('/api/messages', async (req, res) => {
  // same as before
});

app.delete('/api/messages/:id', async (req, res) => {
  // same as before
});

// SOCKET.IO SETUP
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

let onlineUsers = new Set();

io.on('connection', socket => {
  console.log('User connected:', socket.id);

  socket.on('user_connected', username => {
    socket.username = username;
    onlineUsers.add(username);
    io.emit('online_users', Array.from(onlineUsers));
  });

  socket.on('send_message', async (msg) => {
    const message = new Message({ ...msg, status: 'sent' });
    await message.save();

    io.emit('receive_message', message);
  });

  // Typing indicator
  socket.on('typing', ({ sender, receiver, isTyping }) => {
    socket.to(receiver).emit('typing', { sender, isTyping });
  });

  // Message delivered status
  socket.on('message_delivered', async ({ messageId }) => {
    try {
      const message = await Message.findById(messageId);
      if (message && message.status === 'sent') {
        message.status = 'delivered';
        await message.save();
        io.emit('message_status_updated', { messageId, status: 'delivered' });
      }
    } catch (err) {
      console.error('Error updating message delivered status:', err);
    }
  });

  // Message read status
  socket.on('message_read', async ({ messageId }) => {
    try {
      const message = await Message.findById(messageId);
      if (message && message.status !== 'read') {
        message.status = 'read';
        await message.save();
        io.emit('message_status_updated', { messageId, status: 'read' });
      }
    } catch (err) {
      console.error('Error updating message read status:', err);
    }
  });

  socket.on('toggle_reaction', async ({ messageId, user, reaction }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) return;

      const existingIndex = message.reactions.findIndex(
        r => r.user === user && r.reaction === reaction
      );

      if (existingIndex !== -1) {
        message.reactions.splice(existingIndex, 1);
      } else {
        message.reactions.push({ user, reaction });
      }

      await message.save();
      io.emit('reaction_updated', { messageId, reactions: message.reactions });
    } catch (err) {
      console.log('Error toggling reaction:', err);
    }
  });

  socket.on('disconnect', async () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      try {
        await User.findOneAndUpdate({ username: socket.username }, { lastSeen: new Date() });
      } catch (err) {
        console.error('Error updating lastSeen:', err);
      }
      io.emit('online_users', Array.from(onlineUsers));
    }
    console.log('User disconnected:', socket.id);
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
