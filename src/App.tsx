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
function Game({ playerName }: { playerName: string }) {
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
  const [opponentName, setOpponentName] = useState('');
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize player and PubNub
  useEffect(() => {
    console.log("Initializing player with name:", playerName);
    if (playerName) {
      // Generate a unique ID for this player
      const id = `player-${Date.now()}`;
      setPlayerId(id);
      console.log("Generated player ID:", id);

      // First subscribe to the channel
      pubnub.subscribe({
        channels: [GAME_CHANNEL],
        withPresence: true
      });
      
      // Wait a bit for subscription to complete
      setTimeout(() => {
        // Publish that this player has joined
        pubnub.publish({
          channel: GAME_CHANNEL,
          message: {
            type: 'PLAYER_JOINED',
            playerId: id,
            playerName: playerName
          }
        }).then(() => {
          console.log("Published PLAYER_JOINED message");
          setIsConnected(true);
        }).catch(err => {
          console.error("Failed to publish join message:", err);
        });
      }, 1000);
    }
  }, [playerName, pubnub]);

  // Listen for messages and presence events
  useEffect(() => {
    if (!isConnected) return;

    console.log("Setting up message listeners");
    
    // Get current players in the game
    pubnub.hereNow({
      channels: [GAME_CHANNEL],
      includeUUIDs: true,
      includeState: true
    }).then((response) => {
      const currentOccupancy = response.totalOccupancy;
      console.log('Current occupancy:', currentOccupancy, response);
    }).catch(err => {
      console.error("hereNow error:", err);
    });

    // Listen for messages
    const handleMessage = (event: { message: any }) => {
      const message = event.message;
      console.log("Received message:", message);
      
      if (message.type === 'GAME_STATE_UPDATE') {
        // Update game state from other player
        if (message.playerId !== playerId) {
          console.log("Updating game state from opponent:", message);
          
          // Handle score updates - reverse the scores as they come from the opponent's perspective
          setPlayerScore(message.opponentScore);
          setOpponentScore(message.playerScore);
          
          // Handle leg updates
          setPlayerLegs(message.opponentLegs);
          setOpponentLegs(message.playerLegs);
          
          // Handle turn updates
          const newCurrentPlayer = message.currentPlayer === 'player' ? 'opponent' : 'player';
          setCurrentPlayer(newCurrentPlayer);
          
          // Update turn status
          const newIsMyTurn = newCurrentPlayer === 'player';
          setIsMyTurn(newIsMyTurn);
          
          console.log("Updated state:", {
            playerScore: message.opponentScore,
            opponentScore: message.playerScore,
            playerLegs: message.opponentLegs,
            opponentLegs: message.playerLegs,
            isMyTurn: newIsMyTurn
          });
        }
      } else if (message.type === 'PLAYER_JOINED') {
        console.log("Player joined:", message.playerName, "My ID:", playerId, "Their ID:", message.playerId);
        if (message.playerId !== playerId) {
          console.log("Setting opponent name:", message.playerName);
          setOpponentName(message.playerName);
          
          // Determine turn order - whoever joined first gets the first turn
          if (!opponentName) {
            // If we haven't set an opponent name yet, this is the first time we're seeing this opponent
            const myTimestamp = parseInt(playerId.split('-')[1]);
            const theirTimestamp = parseInt(message.playerId.split('-')[1]);
            const amIFirstPlayer = myTimestamp < theirTimestamp;
            
            console.log("Turn order determination:", {
              myTimestamp,
              theirTimestamp,
              amIFirstPlayer
            });
            
            setIsMyTurn(amIFirstPlayer);
            setCurrentPlayer(amIFirstPlayer ? 'player' : 'opponent');
            
            // Welcome the new player by sending our details and current game state
            pubnub.publish({
              channel: GAME_CHANNEL,
              message: {
                type: 'PLAYER_JOINED',
                playerId: playerId,
                playerName: playerName
              }
            }).then(() => {
              // Also send the current game state
              publishGameState();
            });
          }
          
          // Update players list
          setPlayers(prevPlayers => {
            // Check if player already exists
            if (!prevPlayers.some(p => p.id === message.playerId)) {
              return [...prevPlayers, { id: message.playerId, name: message.playerName }];
            }
            return prevPlayers;
          });
        }
      }
    };

    // Listen for presence events
    const handlePresence = (event: any) => {
      console.log("Presence event:", event);
      
      // If a player left, check if it was the opponent
      if (event.action === 'leave' || event.action === 'timeout') {
        // Get the current players in the channel
        pubnub.hereNow({
          channels: [GAME_CHANNEL],
          includeUUIDs: true
        }).then((response) => {
          console.log("hereNow after leave:", response);
          // If only one person is left (just us), reset opponent
          if (response.totalOccupancy <= 1) {
            setOpponentName('');
            setPlayers(prevPlayers => prevPlayers.filter(p => p.id === playerId));
          }
        });
      }
    };

    pubnub.addListener({ 
      message: handleMessage,
      presence: handlePresence
    });

    // Cleanup subscription on unmount
    return () => {
      pubnub.removeListener({ 
        message: handleMessage,
        presence: handlePresence
      });
      
      // Unsubscribe from the channel
      pubnub.unsubscribe({
        channels: [GAME_CHANNEL]
      });
    };
  }, [isConnected, playerId, playerName, pubnub, opponentName]);

  // Publish game state to PubNub after each turn
  const publishGameState = () => {
    console.log("Publishing game state:", {
      playerId,
      playerScore,
      opponentScore,
      playerLegs,
      opponentLegs,
      currentPlayer
    });
    
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
        playerName: playerName,
        timestamp: Date.now() // Add timestamp to ensure ordered updates
      }
    }).then(() => {
      console.log("Game state published successfully");
    }).catch(error => {
      console.error("Error publishing game state:", error);
    });
  };

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
          setPlayerLegs(prevLegs => {
            const newLegs = prevLegs + 1;
            // Use callback to ensure we have the latest value
            setTimeout(() => {
              publishGameState();
            }, 100);
            return newLegs;
          });
          resetScores();
          return; // Exit early, don't increment currentInputIndex
        } else if (newScore < 0 || newScore === 1 || (newScore === 0 && !isValidCheckout(String(formattedValue)))) {
          // Bust - reset inputs and keep current score
          setInputs(['', '', '']);
          setCurrentPlayer('opponent');
          setIsMyTurn(false);
          // Publish updated game state
          publishGameState();
          return; // Exit early, don't increment currentInputIndex
        }
        
        // Update score after each dart
        setPlayerScore(newScore);
        // Publish interim score update
        setTimeout(() => {
          publishGameState();
        }, 100);
      } else {
        const newScore = opponentScore - currentThrowTotal;
        
        if (newScore === 0 && isValidCheckout(String(formattedValue))) {
          // Opponent won with this dart
          setOpponentLegs(prevLegs => {
            const newLegs = prevLegs + 1;
            setTimeout(() => {
              publishGameState();
            }, 100);
            return newLegs;
          });
          resetScores();
          return; // Exit early, don't increment currentInputIndex
        } else if (newScore < 0 || newScore === 1 || (newScore === 0 && !isValidCheckout(String(formattedValue)))) {
          // Bust - reset inputs and keep current score
          setInputs(['', '', '']);
          setCurrentPlayer('player');
          setIsMyTurn(true);
          // Publish updated game state
          publishGameState();
          return; // Exit early, don't increment currentInputIndex
        }
        
        // Update score after each dart
        setOpponentScore(newScore);
        // Publish interim score update
        setTimeout(() => {
          publishGameState();
        }, 100);
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
    
    // Publish updated game state immediately after state updates
    // Use setTimeout to ensure state has been updated
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
    console.log("Resetting scores");
    setPlayerScore(INITIAL_SCORE);
    setOpponentScore(INITIAL_SCORE);
    setCurrentPlayer('player');
    setIsMyTurn(currentPlayer === 'opponent');
    setInputs(['', '', '']);
    setCurrentInputIndex(0);
  };

  // Watch for players array changes to detect when both players are ready
  useEffect(() => {
    // When we have two players, ensure the game is properly initialized
    if (players.length === 2 && opponentName) {
      console.log("Both players joined, initializing game");
      // The first player to join (with earlier timestamp) goes first
      const playerIds = players.map(p => p.id);
      playerIds.sort((a, b) => {
        const aTime = parseInt(a.split('-')[1]);
        const bTime = parseInt(b.split('-')[1]);
        return aTime - bTime;
      });
      
      const amIFirstPlayer = playerIds[0] === playerId;
      console.log("First player determination:", {
        playerIds,
        myId: playerId,
        amIFirstPlayer
      });
      
      // Reset to initial score
      setPlayerScore(INITIAL_SCORE);
      setOpponentScore(INITIAL_SCORE);
      
      // Set turn based on join order
      setCurrentPlayer(amIFirstPlayer ? 'player' : 'opponent');
      setIsMyTurn(amIFirstPlayer);
      
      // If I'm the first player, publish initial game state
      if (amIFirstPlayer) {
        setTimeout(publishGameState, 300);
      }
    }
  }, [players.length, opponentName, playerId]);

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
