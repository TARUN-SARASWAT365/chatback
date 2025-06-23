const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads folder if missing
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// File upload route
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  console.log('📁 File uploaded:', fileUrl);
  res.json({ url: fileUrl });
});

// MongoDB connect
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Online user tracking
const usersMap = {};
const emitOnlineUsers = () => {
  const onlineUsernames = Object.keys(usersMap);
  io.emit('online_users', onlineUsernames);
};

// Socket events
io.on('connection', socket => {
  console.log('🟢 Connected:', socket.id);

  // ✅ User comes online
  socket.on('user_connected', username => {
    usersMap[username] = socket.id;
    emitOnlineUsers();
  });

  // ✅ Send message
  socket.on('send_message', async data => {
    try {
      const isImage = typeof data.content === 'string' &&
        data.content.match(/\.(jpeg|jpg|png|gif|webp)$/i);

      const message = {
        ...data,
        type: isImage ? 'image' : 'text',
        timestamp: data.timestamp || new Date(),
        seen: false
      };

      const saved = await Message.create(message);

      const targetSocket = usersMap[data.receiver];
      if (targetSocket) io.to(targetSocket).emit('receive_message', saved);
      socket.emit('receive_message', saved);
    } catch (err) {
      console.error('❌ Send error:', err);
    }
  });

  // ✅ Typing indicator
  socket.on('typing', ({ sender, receiver }) => {
    const targetSocket = usersMap[receiver];
    if (targetSocket) {
      io.to(targetSocket).emit('typing', sender);
    }
  });

  // ✅ Update message
  socket.on('update_message', async msg => {
    const updated = await Message.findByIdAndUpdate(
      msg._id,
      { content: msg.content },
      { new: true }
    );
    io.emit('message_updated', updated);
  });

  // ✅ Delete message
  socket.on('delete_message', async id => {
    await Message.findByIdAndDelete(id);
    io.emit('message_deleted', id);
  });

  // ✅ Mark messages as seen
  socket.on('mark_seen', async ({ sender, receiver }) => {
    await Message.updateMany({ sender, receiver, seen: false }, { seen: true });
    const seenMessages = await Message.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender }
      ]
    }).sort({ timestamp: 1 });
    socket.emit('messages_seen', seenMessages);
  });

  // ✅ Disconnect
  socket.on('disconnect', () => {
    for (let username in usersMap) {
      if (usersMap[username] === socket.id) {
        delete usersMap[username];
        break;
      }
    }
    emitOnlineUsers();
  });
});

// Auth APIs
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'All fields are required' });

  const exists = await User.findOne({ username });
  if (exists) return res.status(400).json({ error: 'User already exists' });

  await User.create({ username, password });
  res.json({ message: 'Registered successfully' });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  res.json({ message: 'Login successful' });
});

app.get('/users', async (req, res) => {
  const users = await User.find({}, 'username -_id');
  res.json(users);
});

app.get('/messages', async (req, res) => {
  const { sender, receiver } = req.query;
  if (!sender || !receiver)
    return res.status(400).json({ error: 'Missing sender or receiver' });

  const messages = await Message.find({
    $or: [
      { sender, receiver },
      { sender: receiver, receiver: sender }
    ]
  }).sort({ timestamp: 1 });

  res.json(messages);
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
