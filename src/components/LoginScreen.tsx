import React, { useState } from 'react';

interface LoginScreenProps {
  onLogin: (name: string) => void;
  isGameFull: boolean;
}

function LoginScreen({ onLogin, isGameFull }: LoginScreenProps) {
  const [playerName, setPlayerName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim()) {
      onLogin(playerName);
    }
  };

  return (
    <div className="login-screen">
      <h1>Darts Counter</h1>
      {isGameFull ? (
        <div className="game-full-message">
          <p>Game is currently full. Please try again later.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            required
          />
          <button type="submit">Join Game</button>
        </form>
      )}
    </div>
  );
}

export default LoginScreen; 