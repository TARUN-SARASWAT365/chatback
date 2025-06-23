require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// User schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// Message schema
const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
  reactions: [{ user: String, reaction: String }],
  seen: { type: Boolean, default: false },
});
const Message = mongoose.model('Message', messageSchema);

// Connect MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected (Atlas)'))
  .catch(err => console.log('MongoDB connection error:', err));

// REGISTER
app.post('/api/users/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const existingUser = await User.findOne({ username });
  if (existingUser) return res.status(400).json({ error: 'Username already taken' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.json({ message: 'User registered successfully' });
  } catch {
    res.status(500).json({ error: 'Error registering user' });
  }
});

// LOGIN
app.post('/api/users/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

  res.json({ username: user.username });
});

// GET ALL USERS
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username');
    res.json(users);
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET MESSAGES BETWEEN USERS
app.get('/api/messages', async (req, res) => {
  const { sender, receiver } = req.query;
  if (!sender || !receiver)
    return res.status(400).json({ error: 'Sender and receiver required' });

  try {
    const messages = await Message.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender }
      ]
    }).sort({ timestamp: 1 });

    res.json(messages);
  } catch {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// SAVE NEW MESSAGE
app.post('/api/messages', async (req, res) => {
  const { sender, receiver, content } = req.body;
  if (!sender || !receiver || !content)
    return res.status(400).json({ error: 'Missing fields' });

  try {
    const message = new Message({ sender, receiver, content });
    await message.save();
    res.json(message);
  } catch {
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// DELETE MESSAGE
app.delete('/api/messages/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await Message.findByIdAndDelete(id);
    res.json({ message: 'Message deleted successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// SOCKET.IO SETUP
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

  socket.on('toggle_reaction', async ({ messageId, user, reaction }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) return;

      const existingIndex = message.reactions.findIndex(
        r => r.user === user && r.reaction === reaction
      );

      if (existingIndex !== -1) {
        // Remove reaction
        message.reactions.splice(existingIndex, 1);
      } else {
        // Add reaction
        message.reactions.push({ user, reaction });
      }

      await message.save();
      io.emit('reaction_updated', { messageId, reactions: message.reactions });
    } catch (err) {
      console.log('Error toggling reaction:', err);
    }
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
