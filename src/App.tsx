import React, { useState, useEffect } from 'react';
import './App.css';
import PubNub from 'pubnub';
import { PubNubProvider, usePubNub } from 'pubnub-react';
import { GAME_CHANNEL } from './types'; // Import shared constant
import LoginScreen from './components/LoginScreen';
import Game from './components/Game';
import GameTest from './components/GameTest';
// import { Test } from './components/Test';

// PubNub configuration
const pubnubConfig = {
  publishKey: 'pub-c-c8dfab04-a91f-4e8e-b08b-fb391493bf50',
  subscribeKey: 'sub-c-3079c88e-3ea8-437d-bc32-b0585de943c4',
  userId: `user-${Math.floor(Math.random() * 1000000)}`
};

const pubnub = new PubNub(pubnubConfig)

// Main App component
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [isGameFull, setIsGameFull] = useState(false);
  // Handle login action
  const handleLogin = (name: string) => {
    setPlayerName(name);
    setIsLoggedIn(true);
  };

  return (
    <div className="app">
      {!isLoggedIn ? (
        <LoginScreen onLogin={handleLogin} isGameFull={isGameFull} />
      ) : (
          <GameTest playerName={playerName} />
      )}
    </div>
  );
}

// Wrap App with PubNub Provider
function AppWrapper() {
  return (
    <PubNubProvider client={pubnub}>
      <App />
    </PubNubProvider>
  );
}

export default AppWrapper;
