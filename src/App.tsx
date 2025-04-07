import React, { useState, useEffect } from 'react';
import './App.css';
import PubNub from 'pubnub';
import { PubNubProvider, usePubNub } from 'pubnub-react';

// PubNub configuration
const pubnubConfig = {
  publishKey: 'pub-c-c8dfab04-a91f-4e8e-b08b-fb391493bf50',
  subscribeKey: 'sub-c-3079c88e-3ea8-437d-bc32-b0585de943c4',
  userId: `user-${Math.floor(Math.random() * 1000000)}`
};

const pubnub = new PubNub(pubnubConfig);

// Game channel name
const GAME_CHANNEL = 'darts-game-channel';

// Define types for the app
interface Player {
  id: string;
  name: string;
}

// Login screen component
function LoginScreen({ onLogin, isGameFull }: { onLogin: (name: string) => void; isGameFull: boolean }) {
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

// Game component
function Game() {
  const INITIAL_SCORE = 501;
  const [playerScore, setPlayerScore] = useState<number>(INITIAL_SCORE);
  const [opponentScore, setOpponentScore] = useState<number>(INITIAL_SCORE);
  const [playerLegs, setPlayerLegs] = useState<number>(0);
  const [opponentLegs, setOpponentLegs] = useState<number>(0);
  const [inputs, setInputs] = useState<string[]>(['', '', '']);
  const [currentInputIndex, setCurrentInputIndex] = useState<number>(0);
  const [currentPlayer, setCurrentPlayer] = useState<'player' | 'opponent'>('player');
  const [selectedMode, setSelectedMode] = useState<'single' | 'double' | 'triple'>('single');
  
  // PubNub hook for realtime functionality
  const pubnub = usePubNub();
  const [playerName, setPlayerName] = useState('');
  const [opponentName, setOpponentName] = useState('');
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);

  // Subscribe to PubNub channel and listen for messages
  useEffect(() => {
    pubnub.subscribe({
      channels: [GAME_CHANNEL],
      withPresence: true
    });

    // Get current players in the game
    pubnub.hereNow({
      channels: [GAME_CHANNEL],
      includeUUIDs: true,
      includeState: true
    }).then((response) => {
      const currentOccupancy = response.totalOccupancy;
      console.log('Current occupancy:', currentOccupancy);
    });

    // Listen for messages
    const handleMessage = (event: { message: any }) => {
      const message = event.message;
      
      if (message.type === 'GAME_STATE_UPDATE') {
        // Update game state from other player
        if (message.playerId !== playerId) {
          setPlayerScore(message.opponentScore);
          setOpponentScore(message.playerScore);
          setPlayerLegs(message.opponentLegs);
          setOpponentLegs(message.playerLegs);
          setCurrentPlayer(message.currentPlayer === 'player' ? 'opponent' : 'player');
          setIsMyTurn(message.currentPlayer !== 'player');
        }
      } else if (message.type === 'PLAYER_JOINED') {
        if (message.playerId !== playerId) {
          setOpponentName(message.playerName);
          // Update players list
          setPlayers(prevPlayers => [...prevPlayers, { id: message.playerId, name: message.playerName }]);
        }
      }
    };

    pubnub.addListener({ message: handleMessage });

    // Cleanup subscription on unmount
    return () => {
      pubnub.unsubscribe({
        channels: [GAME_CHANNEL]
      });
      pubnub.removeListener({ message: handleMessage });
    };
  }, [pubnub, playerId]);

  // Publish game state to PubNub after each turn
  const publishGameState = () => {
    pubnub.publish({
      channel: GAME_CHANNEL,
      message: {
        type: 'GAME_STATE_UPDATE',
        playerId: playerId,
        playerScore: playerScore,
        opponentScore: opponentScore,
        playerLegs: playerLegs,
        opponentLegs: opponentLegs,
        currentPlayer: currentPlayer,
        playerName: playerName
      }
    });
  };

  // Initialize player
  useEffect(() => {
    if (playerName) {
      // Generate a unique ID for this player
      const id = `player-${Date.now()}`;
      setPlayerId(id);

      // Publish that this player has joined
      pubnub.publish({
        channel: GAME_CHANNEL,
        message: {
          type: 'PLAYER_JOINED',
          playerId: id,
          playerName: playerName
        }
      });

      // First player to join gets the first turn
      if (players.length === 0) {
        setIsMyTurn(true);
      }
    }
  }, [playerName, pubnub, players.length]);
  
  // Handle mode selection
  const handleModeSelect = (mode: 'single' | 'double' | 'triple') => {
    setSelectedMode(mode);
  };
  
  // Handle button clicks for dart values
  const handleButtonClick = (value: string | number) => {
    // Only allow interaction if it's this player's turn
    if (!isMyTurn) return;

    if (currentInputIndex < 3) {
      const newInputs = [...inputs];
      
      // Format the value based on the selected mode
      let formattedValue = value;
      if (value !== 'Bull' && value !== 'D-Bull' && value !== 'Miss') {
        if (selectedMode === 'double') {
          formattedValue = `D${value}`;
        } else if (selectedMode === 'triple') {
          formattedValue = `T${value}`;
        }
      } else {
        // Handle Bull based on mode
        if (selectedMode === 'double' && value === 'Bull') {
          formattedValue = 'D-Bull';
        }
      }
      
      newInputs[currentInputIndex] = String(formattedValue);
      setInputs(newInputs);
      
      // Reset mode to single after each click
      if (selectedMode !== 'single') {
        setSelectedMode('single');
      }
      
      // Calculate the current throw score so far
      const dartValue = calculateDartValue(String(formattedValue));
      const currentThrowTotal = calculateScore(newInputs.slice(0, currentInputIndex + 1));
      
      // Check if player has won with this dart
      if (currentPlayer === 'player') {
        const newScore = playerScore - currentThrowTotal;
        
        if (newScore === 0 && isValidCheckout(String(formattedValue))) {
          // Player won with this dart
          setPlayerLegs(playerLegs + 1);
          resetScores();
          // Publish updated game state
          setTimeout(publishGameState, 100);
          return; // Exit early, don't increment currentInputIndex
        } else if (newScore < 0 || newScore === 1 || (newScore === 0 && !isValidCheckout(String(formattedValue)))) {
          // Bust - reset inputs and keep current score
          setInputs(['', '', '']);
          setCurrentPlayer('opponent');
          setIsMyTurn(false);
          // Publish updated game state
          setTimeout(publishGameState, 100);
          return; // Exit early, don't increment currentInputIndex
        }
      } else {
        const newScore = opponentScore - currentThrowTotal;
        
        if (newScore === 0 && isValidCheckout(String(formattedValue))) {
          // Opponent won with this dart
          setOpponentLegs(opponentLegs + 1);
          resetScores();
          // Publish updated game state
          setTimeout(publishGameState, 100);
          return; // Exit early, don't increment currentInputIndex
        } else if (newScore < 0 || newScore === 1 || (newScore === 0 && !isValidCheckout(String(formattedValue)))) {
          // Bust - reset inputs and keep current score
          setInputs(['', '', '']);
          setCurrentPlayer('player');
          setIsMyTurn(true);
          // Publish updated game state
          setTimeout(publishGameState, 100);
          return; // Exit early, don't increment currentInputIndex
        }
      }
      
      // Move to next input if no bust or win
      setCurrentInputIndex(currentInputIndex + 1);
      
      // If this was the third dart, calculate final score and change player
      if (currentInputIndex === 2) {
        finalizeTurn(newInputs);
      }
    }
  };

  // Finalize the turn after 3 darts
  const finalizeTurn = (dartValues: string[]) => {
    const totalScore = calculateScore(dartValues);
    
    if (currentPlayer === 'player') {
      const newScore = playerScore - totalScore;
      setPlayerScore(newScore);
      setCurrentPlayer('opponent');
      setIsMyTurn(false);
    } else {
      const newScore = opponentScore - totalScore;
      setOpponentScore(newScore);
      setCurrentPlayer('player');
      setIsMyTurn(true);
    }
    
    // Clear inputs for next throw
    setInputs(['', '', '']);
    setCurrentInputIndex(0);
    
    // Publish updated game state
    setTimeout(publishGameState, 100);
  };

  // Handle backspace to clear last input
  const handleBackspace = () => {
    if (!isMyTurn) return;
    
    if (currentInputIndex > 0) {
      const newInputs = [...inputs];
      newInputs[currentInputIndex - 1] = '';
      setInputs(newInputs);
      setCurrentInputIndex(currentInputIndex - 1);
    }
  };

  // Check if a checkout is valid (must be a double)
  const isValidCheckout = (dartValue: string): boolean => {
    return dartValue.startsWith('D') || dartValue === 'D-Bull';
  };
  
  // Calculate value of a single dart
  const calculateDartValue = (value: string): number => {
    if (!value || value === 'Miss') return 0;
    if (value === 'Bull') return 25;
    if (value === 'D-Bull') return 50;
    
    if (value.startsWith('D')) {
      const num = parseInt(value.substring(1));
      return num * 2;
    }
    
    if (value.startsWith('T')) {
      const num = parseInt(value.substring(1));
      return num * 3;
    }
    
    return parseInt(value);
  };
  
  // Calculate score from dart values
  const calculateScore = (dartValues: string[]): number => {
    return dartValues.reduce((total, value) => {
      return total + calculateDartValue(value);
    }, 0);
  };
  
  // Reset scores to 501
  const resetScores = () => {
    setPlayerScore(INITIAL_SCORE);
    setOpponentScore(INITIAL_SCORE);
    setCurrentPlayer('player');
    setIsMyTurn(currentPlayer === 'opponent');
    setInputs(['', '', '']);
    setCurrentInputIndex(0);
  };

  // Generate number buttons (1-20)
  const renderNumberButtons = () => {
    const buttons = [];
    for (let i = 0; i < 4; i++) {
      buttons.push(
        <div className="buttons-row" key={`row-${i}`}>
          {[1, 2, 3, 4, 5].map(num => {
            const value = i * 5 + num;
            return (
              value <= 20 ? (
                <button 
                  key={value} 
                  className="score-button" 
                  onClick={() => handleButtonClick(value)}
                  disabled={!isMyTurn}
                >
                  {value}
                </button>
              ) : <div key={value} className="score-button empty"></div>
            );
          })}
        </div>
      );
    }
    return buttons;
  };

  return (
    <div className="darts-counter">
      <div className="game-header">
        <div className="legs-display">
          <div className="legs-text">Legs {playerLegs}:{opponentLegs}</div>
        </div>
        <div className="player-names">
          <span className="player-name">{playerName || 'You'}</span> vs <span className="player-name">{opponentName || 'Opponent'}</span>
        </div>
      </div>
      
      <div className="game-status">
        {players.length < 2 ? (
          <div className="waiting-message">Waiting for opponent to join...</div>
        ) : (
          <div className={`turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
            {isMyTurn ? "Your Turn" : `${opponentName}'s Turn`}
          </div>
        )}
      </div>
      
      <div className="score-display">
        <div className={`score-section ${currentPlayer === 'player' ? 'active-player' : ''}`}>
          <div className="score">{playerScore}</div>
          <div className="player">{playerName || 'You'}</div>
        </div>
        <div className="divider"></div>
        <div className={`score-section ${currentPlayer === 'opponent' ? 'active-player' : ''}`}>
          <div className="score">{opponentScore}</div>
          <div className="player">{opponentName || 'Opponent'}</div>
        </div>
      </div>
      
      <div className="input-container">
        <div className="input-display">
          <div className="input-fields">
            <div className={`input-field ${currentInputIndex === 0 ? 'active' : ''}`}>
              {inputs[0]}
            </div>
            <div className={`input-field ${currentInputIndex === 1 ? 'active' : ''}`}>
              {inputs[1]}
            </div>
            <div className={`input-field ${currentInputIndex === 2 ? 'active' : ''}`}>
              {inputs[2]}
            </div>
          </div>
        </div>
        <button 
          className="backspace-button" 
          onClick={handleBackspace}
          disabled={!isMyTurn}
        >⌫</button>
      </div>
      
      <div className="mode-selector">
        <button
          className={`mode-button ${selectedMode === 'single' ? 'mode-active' : ''}`}
          onClick={() => handleModeSelect('single')}
          disabled={!isMyTurn}
        >
          Single
        </button>
        <button
          className={`mode-button ${selectedMode === 'double' ? 'mode-active' : ''}`}
          onClick={() => handleModeSelect('double')}
          disabled={!isMyTurn}
        >
          Double
        </button>
        <button
          className={`mode-button ${selectedMode === 'triple' ? 'mode-active' : ''}`}
          onClick={() => handleModeSelect('triple')}
          disabled={!isMyTurn}
        >
          Triple
        </button>
      </div>
      
      <div className="buttons-grid">
        {renderNumberButtons()}
        
        <div className="buttons-row special-buttons">
          <button 
            className="score-button wider-button" 
            onClick={() => handleButtonClick('Bull')}
            disabled={!isMyTurn || selectedMode === 'triple'}
          >
            Bull
          </button>
          <button 
            className="score-button wider-button" 
            onClick={() => handleButtonClick('Miss')}
            disabled={!isMyTurn}
          >
            Miss
          </button>
        </div>
      </div>
    </div>
  );
}

// Main App component
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [isGameFull, setIsGameFull] = useState(false);
  const pubnub = usePubNub();

  // Check if game is full when app loads
  useEffect(() => {
    pubnub.hereNow({
      channels: [GAME_CHANNEL],
      includeUUIDs: true
    }).then((response) => {
      const occupancy = response.totalOccupancy;
      setIsGameFull(occupancy >= 2);
    });

    // Setup listener for presence changes
    const handlePresence = (event: any) => {
      if (event.action === 'join' || event.action === 'leave') {
        pubnub.hereNow({
          channels: [GAME_CHANNEL],
          includeUUIDs: true
        }).then((response) => {
          const occupancy = response.totalOccupancy;
          setIsGameFull(occupancy >= 2);
        });
      }
    };

    pubnub.addListener({ presence: handlePresence });

    return () => {
      pubnub.removeListener({ presence: handlePresence });
    };
  }, [pubnub]);

  const handleLogin = (name: string) => {
    setPlayerName(name);
    setIsLoggedIn(true);
    
    // Update PubNub state with player info
    pubnub.setState({
      state: { name: name },
      channels: [GAME_CHANNEL]
    });
  };

  return (
    <div className="app">
      {!isLoggedIn ? (
        <LoginScreen onLogin={handleLogin} isGameFull={isGameFull} />
      ) : (
        <Game />
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
