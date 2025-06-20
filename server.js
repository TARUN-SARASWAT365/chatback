const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

// Ensure uploads directory exists
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ✅ Updated Upload Endpoint with Full URL
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fileUrl = `http://${req.hostname}:5000/uploads/${req.file.filename}`;
  console.log('📁 File uploaded:', fileUrl);

  res.json({ url: fileUrl });
});

// Connect to MongoDB
mongoose
  .connect('mongodb://localhost:27017/socket_admin', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Active users
const usersMap = {};

const emitOnlineUsers = () => {
  const onlineUsernames = Object.keys(usersMap);
  io.emit('online_users', onlineUsernames);
};

io.on('connection', socket => {
  console.log('🟢 Connected:', socket.id);

  socket.on('user_connected', username => {
    usersMap[username] = socket.id;
    emitOnlineUsers();
  });

  socket.on('send_message', async data => {
    try {
      const message = {
        ...data,
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

  socket.on('update_message', async msg => {
    const updated = await Message.findByIdAndUpdate(
      msg._id,
      { content: msg.content },
      { new: true }
    );
    io.emit('message_updated', updated);
  });

  socket.on('delete_message', async id => {
    await Message.findByIdAndDelete(id);
    io.emit('message_deleted', id);
  });

  socket.on('mark_seen', async ({ sender, receiver }) => {
    await Message.updateMany({ sender, receiver, seen: false }, { seen: true });
    const seenMessages = await Message.find({ sender, receiver });
    socket.emit('messages_seen', seenMessages);
  });

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

// API routes
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

// 🔥 Listen on all interfaces so other devices can access via IP
const PORT = 5000;
server.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running at http://192.168.1.19:${PORT}`)
);
