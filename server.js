const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // Change this to your frontend URL in production
  }
});

app.use(cors());
app.use(express.json());

// In-memory storage for demo (replace with DB in production)
let users = [
  { username: 'alice' },
  { username: 'bob' },
  { username: 'charlie' },
];
let messages = []; // { _id, sender, receiver, content, timestamp, reactions: [{ user, reaction }] }

// Online users tracking
let onlineUsers = new Set();

// API: Get all users
app.get('/api/users', (req, res) => {
  res.json(users);
});

// API: Get messages between two users
app.get('/api/messages', (req, res) => {
  const { sender, receiver } = req.query;
  if (!sender || !receiver) {
    return res.status(400).json({ error: 'sender and receiver are required' });
  }
  const chatMessages = messages.filter(
    m =>
      (m.sender === sender && m.receiver === receiver) ||
      (m.sender === receiver && m.receiver === sender)
  );
  res.json(chatMessages);
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('New client connected', socket.id);

  // When a user connects and sends username
  socket.on('user_connected', (username) => {
    socket.username = username;
    onlineUsers.add(username);

    io.emit('online_users', Array.from(onlineUsers));
  });

  // When a user disconnects
  socket.on('disconnect', () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      io.emit('online_users', Array.from(onlineUsers));
    }
    console.log('Client disconnected', socket.id);
  });

  // Handle sending message
  socket.on('send_message', (msg) => {
    // Assign unique ID to message if not provided
    if (!msg._id) {
      msg._id = uuidv4();
    }
    if (!msg.reactions) {
      msg.reactions = [];
    }
    messages.push(msg);
    io.emit('receive_message', msg);
  });

  // Handle toggle reaction
  socket.on('toggle_reaction', ({ messageId, user, reaction }) => {
    const message = messages.find(m => m._id === messageId);
    if (!message) return;

    // Check if user already reacted with this reaction
    const existingIndex = message.reactions.findIndex(r => r.user === user && r.reaction === reaction);
    if (existingIndex !== -1) {
      // Remove reaction
      message.reactions.splice(existingIndex, 1);
    } else {
      // Add reaction
      message.reactions.push({ user, reaction });
    }

    io.emit('reaction_updated', { messageId, reactions: message.reactions });
  });

  // Typing indicator event
  socket.on('typing', ({ sender, receiver, isTyping }) => {
    // Notify only sender and receiver about typing status
    // Send to all clients for demo simplicity
    io.emit('typing', { sender, isTyping });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
