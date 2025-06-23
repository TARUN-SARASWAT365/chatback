import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { ArrowLeft } from 'lucide-react';
import './Chat.css';

const socket = io('https://chatback-7.onrender.com');

const reactionsList = ['👍', '❤️', '😂', '😮', '😢', '👏'];

const Chat = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    socket.emit('user_connected', currentUser);

    socket.on('online_users', setOnlineUsers);
    socket.on('receive_message', msg => {
      setMessages(prev => [...prev, msg]);
    });
    socket.on('message_deleted', id => {
      setMessages(prev => prev.filter(m => m._id !== id));
    });
    socket.on('message_updated', updated => {
      setMessages(prev => prev.map(m => (m._id === updated._id ? updated : m)));
    });

    // New: listen for reaction updates
    socket.on('reaction_updated', ({ messageId, reactions }) => {
      setMessages(prev =>
        prev.map(m => (m._id === messageId ? { ...m, reactions } : m))
      );
    });

    return () => socket.disconnect();
  }, [currentUser]);

  useEffect(() => {
    axios.get('https://chatback-7.onrender.com/users').then(res => setUsers(res.data));
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    axios
      .get(`https://chatback-7.onrender.com/messages?sender=${currentUser}&receiver=${selectedUser}`)
      .then(res => setMessages(res.data));
  }, [selectedUser, currentUser]);

  const sendMessage = async () => {
    if (!newMessage && !file) return;
    let content = newMessage;

    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post('https://chatback-7.onrender.com/upload', formData);
      content = res.data.url;
      setFile(null);
    }

    const msg = {
      sender: currentUser,
      receiver: selectedUser,
      content,
      timestamp: new Date(),
    };
    socket.emit('send_message', msg);
    setNewMessage('');
  };

  const handleFileChange = e => setFile(e.target.files[0]);

  const toggleReaction = (messageId, reaction) => {
    socket.emit('toggle_reaction', { messageId, user: currentUser, reaction });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={`chat-container ${darkMode ? 'dark' : ''}`}>
      <div className={`sidebar ${selectedUser ? 'hide-on-mobile' : ''}`}>
        <h4>Users</h4>
        {users.map(u => (
          <div
            key={u.username}
            className={`user-item ${
              selectedUser === u.username ? 'active' : ''
            } ${onlineUsers.includes(u.username) ? 'online' : ''}`}
            onClick={() => setSelectedUser(u.username)}
          >
            <span
              className={`status-dot ${onlineUsers.includes(u.username) ? 'online' : ''}`}
            ></span>
            {u.username}
          </div>
        ))}
        <button onClick={() => setDarkMode(!darkMode)}>Toggle Dark Mode</button>
      </div>

      {selectedUser && (
        <div className="chat-window">
          <div className="chat-header">
            <button className="back-btn" onClick={() => setSelectedUser(null)}>
              <ArrowLeft size={20} />
            </button>
            {`Chat with ${selectedUser}`}
          </div>

          <div className="messages">
            {messages.map(m => (
              <div
                key={m._id}
                className={`message ${m.sender === currentUser ? 'sent' : 'received'}`}
              >
                {m.content.match(/\.(jpeg|jpg|png|gif)$/i) ? (
                  <div className="file-preview">
                    <img src={m.content} alt="sent file" />
                  </div>
                ) : (
                  <div className="msg-content">{m.content}</div>
                )}

                {/* Reactions display */}
                <div className="reactions">
                  {m.reactions &&
                    m.reactions.map((r, i) => (
                      <span key={i} title={r.user}>
                        {r.reaction}
                      </span>
                    ))}

                  {/* Reaction buttons */}
                  {reactionsList.map(reaction => (
                    <button
                      key={reaction}
                      className="reaction-btn"
                      onClick={() => toggleReaction(m._id, reaction)}
                    >
                      {reaction}
                    </button>
                  ))}
                </div>

                <div className="msg-time">{new Date(m.timestamp).toLocaleTimeString()}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            <input type="file" onChange={handleFileChange} />
            <input
              type="text"
              placeholder="Type a message..."
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
