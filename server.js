const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
require('dotenv').config();

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

// Message schema (optional here, for chat messages)
const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
  reactions: [{ user: String, reaction: String }],
  seen: { type: Boolean, default: false },
});
const Message = mongoose.model('Message', messageSchema);

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1/chat', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// --------- REGISTER ---------
app.post('/api/users/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const existingUser = await User.findOne({ username });
  if (existingUser) return res.status(400).json({ error: 'Username already taken' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);  // hash password
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Error registering user' });
  }
});

// --------- LOGIN ---------
app.post('/api/users/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

  // Login success - send back username (you can later send JWT token here)
  res.json({ username: user.username });
});

// --- Other routes like get users, messages etc remain same ---

// SOCKET.IO setup (same as before)

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
