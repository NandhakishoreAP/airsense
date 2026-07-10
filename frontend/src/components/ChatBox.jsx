import React, { useState, useEffect, useRef } from 'react';
import { postChat } from '../api';

export default function ChatBox({ city, selectedCity }) {
  const activeCity = city || selectedCity;
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const query = inputValue.trim();
    if (!query) return;

    // 1. Immediately add the user's message
    const userMsg = {
      id: Date.now() + '-user',
      sender: 'user',
      text: query
    };

    // 2. Show thinking indicator as a temporary assistant message
    const thinkingMsgId = Date.now() + '-thinking';
    const thinkingMsg = {
      id: thinkingMsgId,
      sender: 'assistant',
      text: 'thinking...',
      isThinking: true
    };

    setMessages((prev) => [...prev, userMsg, thinkingMsg]);
    setInputValue('');

    // 3. Call the API client
    postChat(query, activeCity)
      .then((res) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === thinkingMsgId) {
              if (res && res.error) {
                return {
                  ...m,
                  text: '⚠️ Live response generation is temporarily unavailable.',
                  isThinking: false,
                  isError: true
                };
              }
              return {
                ...m,
                text: res.answer || 'No answer returned.',
                isThinking: false
              };
            }
            return m;
          })
        );
      })
      .catch((err) => {
        console.error(err);
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === thinkingMsgId) {
              return {
                ...m,
                text: '⚠️ Unable to get a response right now.',
                isThinking: false,
                isError: true
              };
            }
            return m;
          })
        );
      });
  };

  return (
    <div className="chat-box-container" style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', background: '#fff', boxSizing: 'border-box', minHeight: '380px', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ margin: '0 0 4px 0' }}>Citizen Assistant Chat</h3>
      
      {/* Scope helper note */}
      <div style={{ fontSize: '0.8rem', color: '#7f8c8d', marginBottom: '10px' }}>
        Ask about air quality, health precautions, or outdoor activity in <strong style={{ color: '#2c3e50' }}>{activeCity}</strong>
      </div>

      {/* Messages window */}
      <div style={{
        flex: 1,
        minHeight: '260px',
        maxHeight: '300px',
        overflowY: 'auto',
        border: '1px solid #e8e8e8',
        borderRadius: '6px',
        padding: '10px',
        background: '#fafafa',
        marginBottom: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#888', fontStyle: 'italic', fontSize: '0.9rem' }}>
            No messages yet. Send a question to start.
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            
            const alignContainerStyle = {
              display: 'flex',
              justifyContent: isUser ? 'flex-end' : 'flex-start'
            };

            const bubbleStyle = {
              padding: '8px 12px',
              borderRadius: isUser ? '12px 12px 0 12px' : '12px 12px 12px 0',
              background: isUser ? '#007bff' : msg.isError ? '#fff1f0' : msg.isThinking ? '#f5f5f5' : '#e9ecef',
              color: isUser ? '#fff' : msg.isError ? '#cf1322' : '#333',
              border: msg.isError ? '1px solid #ffa39e' : 'none',
              fontStyle: msg.isThinking ? 'italic' : 'normal',
              maxWidth: '85%',
              wordBreak: 'break-word',
              fontSize: '0.9rem',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            };

            return (
              <div key={msg.id} style={alignContainerStyle}>
                <div style={bubbleStyle}>
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Inputs Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Ask a question..."
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.9rem',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            background: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
            opacity: inputValue.trim() ? 1 : 0.6
          }}
          disabled={!inputValue.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
