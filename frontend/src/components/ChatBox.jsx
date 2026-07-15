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
    <div className="chat-box-container chat-wrapper">
      <div className="card-title-container">
        <svg className="card-icon icon-chat" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <h3 className="card-title">Citizen Assistant Chat</h3>
      </div>

      {/* Scope helper note */}
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
        Ask about air quality, health precautions, or outdoor activity in <strong style={{ color: 'var(--text-primary)' }}>{activeCity}</strong>
      </div>

      {/* Messages window */}
      <div className="chat-messages-window">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            No messages yet. Send a question to start.
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';

            return (
              <div key={msg.id} className={`chat-bubble-container ${isUser ? 'user' : 'assistant'} fade-in`}>
                <div className={`chat-bubble ${isUser ? 'user' : ''} ${!isUser && msg.isThinking ? 'thinking' : ''} ${!isUser && msg.isError ? 'error' : ''} ${!isUser && !msg.isThinking && !msg.isError ? 'assistant' : ''}`}>
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Inputs Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Ask a question..."
          className="chat-input"
        />
        <button
          type="submit"
          className="btn chat-send-btn"
          disabled={!inputValue.trim()}
          style={{ minWidth: '80px' }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
