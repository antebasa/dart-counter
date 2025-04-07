import React, { useState, useEffect } from 'react';
import './App.css';
import PubNub from 'pubnub';
import { PubNubProvider, usePubNub } from 'pubnub-react';
import { GAME_CHANNEL } from './types'; // Import shared constant
import LoginScreen from './components/LoginScreen';
import Game from './components/Game';

// PubNub configuration
const pubnubConfig = {
  publishKey: 'pub-c-c8dfab04-a91f-4e8e-b08b-fb391493bf50',
  subscribeKey: 'sub-c-3079c88e-3ea8-437d-bc32-b0585de943c4',
  userId: `user-${Math.floor(Math.random() * 1000000)}`
};

const pubnub = new PubNub(pubnubConfig);

// Main App component
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [isGameFull, setIsGameFull] = useState(false);
  const pubnubInstance = usePubNub(); // Get instance from context

  // Check if game is full when app loads and listen for presence changes
  useEffect(() => {
    const checkOccupancy = () => {
      pubnubInstance.hereNow({
        channels: [GAME_CHANNEL],
        includeUUIDs: true
      }).then((response) => {
        const occupancy = response.totalOccupancy;
        console.log("Current occupancy:", occupancy);
        setIsGameFull(occupancy >= 2);
      }).catch(error => {
        console.error("Error fetching Here Now:", error);
      });
    };

    // Initial check
    checkOccupancy();

    // Listener for presence events
    const handlePresence = (event: any) => {
      console.log("Presence event:", event);
      // Re-check occupancy on join/leave/timeout
      if (['join', 'leave', 'timeout'].includes(event.action)) {
        checkOccupancy();
      }
    };

    pubnubInstance.addListener({ presence: handlePresence });

    // Cleanup listener
    return () => {
      pubnubInstance.removeListener({ presence: handlePresence });
    };
  }, [pubnubInstance]);

  // Handle login action
  const handleLogin = (name: string) => {
    if (isGameFull) {
      console.warn("Attempted to log in, but game is full.");
      // Optionally show a message to the user
      return;
    }
    setPlayerName(name);
    setIsLoggedIn(true);
    
    // Set PubNub state for the user (optional, good for presence details)
    pubnubInstance.setState({
      state: { name: name },
      channels: [GAME_CHANNEL]
    });
    console.log(`Player ${name} logged in.`);
  };

  return (
    <div className="app">
      {!isLoggedIn ? (
        <LoginScreen onLogin={handleLogin} isGameFull={isGameFull} />
      ) : (
        <Game playerName={playerName} />
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
