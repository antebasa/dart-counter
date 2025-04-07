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

// Game component - simplify props to just take playerName
function Game({ playerName }: { playerName: string }) {
  // Game state
  const INITIAL_SCORE = 501;
  const [playerScore, setPlayerScore] = useState<number>(INITIAL_SCORE);
  const [opponentScore, setOpponentScore] = useState<number>(INITIAL_SCORE);
  const [playerLegs, setPlayerLegs] = useState<number>(0);
  const [opponentLegs, setOpponentLegs] = useState<number>(0);
  const [inputs, setInputs] = useState<string[]>(['', '', '']);
  const [currentInputIndex, setCurrentInputIndex] = useState<number>(0);
  const [selectedMode, setSelectedMode] = useState<'single' | 'double' | 'triple'>('single');
  
  // Connection state
  const pubnub = usePubNub();
  const [opponentName, setOpponentName] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string>('');
  
  // Game control state
  const [gameRole, setGameRole] = useState<'player1' | 'player2' | ''>(''); // player1 = first player, player2 = second player
  const [currentPlayer, setCurrentPlayer] = useState<'player1' | 'player2'>('player1'); // Who's currently playing
  const [isMyTurn, setIsMyTurn] = useState<boolean>(false);
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  
  // Debug counter to track message exchange
  const [debugMsgCount, setDebugMsgCount] = useState<number>(0);
  
  // Handle mode selection
  const handleModeSelect = (mode: 'single' | 'double' | 'triple') => {
    setSelectedMode(mode);
  };

  // Connect to PubNub and initialize player
  useEffect(() => {
    if (!playerName) return;
    
    // Generate unique player ID with timestamp
    const newPlayerId = `player-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    setPlayerId(newPlayerId);
    console.log("Generated player ID:", newPlayerId);

    try {
      // Subscribe to game channel
      pubnub.subscribe({
        channels: [GAME_CHANNEL],
        withPresence: true
      });
      
      // Mark as connected
      setIsConnected(true);
      
      // Check who's already in the channel
      pubnub.hereNow({
        channels: [GAME_CHANNEL],
        includeUUIDs: true
      }).then((response) => {
        console.log("Here Now response:", response);
        const occupancy = response.totalOccupancy;
        
        // Announce ourselves to the channel
        pubnub.publish({
          channel: GAME_CHANNEL,
          message: {
            type: 'HELLO',
            playerId: newPlayerId,
            playerName: playerName,
            timestamp: Date.now()
          }
        }).then(() => {
          console.log("Published HELLO message");
          
          // If nobody else in channel, we're player1
          if (occupancy <= 1) {
            setGameRole('player1');
            setCurrentPlayer('player1');
            setIsMyTurn(true);
            console.log("I am player1 (first player)");
          } else {
            // Otherwise wait for confirmation via message exchange
            console.log("Someone else is here, waiting for game setup");
          }
        });
      });
    } catch (error) {
      console.error("PubNub connection error:", error);
      setConnectionError("Failed to connect. Please refresh the page.");
    }
    
    // Cleanup on unmount
    return () => {
      console.log("Cleaning up PubNub subscription");
      pubnub.unsubscribe({
        channels: [GAME_CHANNEL]
      });
      setIsConnected(false);
    };
  }, [playerName, pubnub]);

  // Handle messages
  useEffect(() => {
    if (!isConnected || !playerId) return;
    
    const handleMessage = (event: { message: any }) => {
      const message = event.message;
      setDebugMsgCount(prev => prev + 1); // Debug: count messages
      console.log(`[${debugMsgCount}] Received message:`, message);
      
      // Don't process our own messages
      if (message.playerId === playerId) {
        console.log("Ignoring own message");
        return;
      }
      
      switch (message.type) {
        case 'HELLO':
          // Someone else joined the channel
          console.log(`Player joined: ${message.playerName}`);
          
          // Update opponent info
          setOpponentName(message.playerName);
          
          // If I'm player1, I should sync game state for the new player2
          if (gameRole === 'player1') {
            console.log("I'm player1, sending WELCOME and game state to new player2");
            
            // First send welcome message to confirm their join
            pubnub.publish({
              channel: GAME_CHANNEL,
              message: {
                type: 'WELCOME',
                playerId: playerId,
                playerName: playerName,
                newPlayerRole: 'player2',
                timestamp: Date.now()
              }
            }).then(() => {
              // Then send current game state
              pubnub.publish({
                channel: GAME_CHANNEL,
                message: {
                  type: 'GAME_STATE',
                  playerId: playerId,
                  player1Score: playerScore,
                  player2Score: opponentScore,
                  player1Legs: playerLegs,
                  player2Legs: opponentLegs,
                  currentPlayer: currentPlayer,
                  timestamp: Date.now()
                }
              });
            });
          }
          break;
          
        case 'WELCOME':
          // Received confirmation from player1
          console.log("Received WELCOME from player1");
          
          // Set my role as player2
          if (message.newPlayerRole === 'player2') {
            setGameRole('player2');
            setIsMyTurn(false); // player1 starts by default
            setGameStarted(true);
          }
          break;
          
        case 'GAME_STATE':
          // Game state update from the other player
          console.log("Received GAME_STATE");
          
          // Apply state based on my role
          if (gameRole === 'player1') {
            setPlayerScore(message.player1Score);
            setOpponentScore(message.player2Score);
            setPlayerLegs(message.player1Legs);
            setOpponentLegs(message.player2Legs);
          } else if (gameRole === 'player2') {
            setPlayerScore(message.player2Score);
            setOpponentScore(message.player1Score);
            setPlayerLegs(message.player2Legs);
            setOpponentLegs(message.player1Legs);
          }
          
          // Update turn based on currentPlayer value
          setCurrentPlayer(message.currentPlayer);
          setIsMyTurn(message.currentPlayer === gameRole);
          
          // Game has definitely started if we're receiving game state
          setGameStarted(true);
          break;
          
        case 'DART_THROWN':
          // Another player threw a dart
          console.log("Opponent threw a dart:", message.dartValue);
          // We'll handle this with the GAME_STATE message that follows
          break;
          
        case 'GAME_OVER':
          // Game ended
          console.log("Game over:", message.winner);
          // Handle game over state
          break;
      }
    };
    
    // Add message listener
    pubnub.addListener({ message: handleMessage });
    
    // Remove listener on cleanup
    return () => {
      pubnub.removeListener({ message: handleMessage });
    };
  }, [isConnected, playerId, pubnub, gameRole, playerScore, opponentScore, playerLegs, opponentLegs, currentPlayer, debugMsgCount]);

  // Send current game state to other player
  const publishGameState = () => {
    if (!isConnected || !playerId || !gameRole) {
      console.warn("Can't publish game state - not fully connected");
      return;
    }
    
    console.log("Publishing game state");
    
    pubnub.publish({
      channel: GAME_CHANNEL,
      message: {
        type: 'GAME_STATE',
        playerId: playerId,
        player1Score: gameRole === 'player1' ? playerScore : opponentScore,
        player2Score: gameRole === 'player2' ? playerScore : opponentScore,
        player1Legs: gameRole === 'player1' ? playerLegs : opponentLegs,
        player2Legs: gameRole === 'player2' ? playerLegs : opponentLegs,
        currentPlayer: currentPlayer,
        timestamp: Date.now()
      }
    }).then(() => {
      console.log("Game state published");
    }).catch(error => {
      console.error("Failed to publish game state:", error);
    });
  };

  // Handle button click
  const handleButtonClick = (value: string | number) => {
    // Only allow if it's my turn and game has started
    if (!isMyTurn || !gameStarted) return;
    
    if (currentInputIndex < 3) {
      // Format dart value based on selected mode
      let formattedValue = value;
      if (value !== 'Bull' && value !== 'D-Bull' && value !== 'Miss') {
        if (selectedMode === 'double') {
          formattedValue = `D${value}`;
        } else if (selectedMode === 'triple') {
          formattedValue = `T${value}`;
        }
      } else if (selectedMode === 'double' && value === 'Bull') {
        formattedValue = 'D-Bull';
      }
      
      // Update inputs
      const newInputs = [...inputs];
      newInputs[currentInputIndex] = String(formattedValue);
      setInputs(newInputs);
      
      // Reset mode to single after each click
      if (selectedMode !== 'single') {
        setSelectedMode('single');
      }
      
      // Calculate score
      const dartValue = calculateDartValue(String(formattedValue));
      const currentThrowTotal = calculateScore(newInputs.slice(0, currentInputIndex + 1));
      
      // Update score based on current dart
      const potentialScore = playerScore - currentThrowTotal;
      
      // Announce dart thrown to other player
      pubnub.publish({
        channel: GAME_CHANNEL,
        message: {
          type: 'DART_THROWN',
          playerId: playerId,
          dartValue: formattedValue,
          timestamp: Date.now()
        }
      });
      
      // Check for win/bust/continue
      if (potentialScore === 0 && isValidCheckout(String(formattedValue))) {
        // Win
        console.log("Win!");
        setPlayerLegs(prev => prev + 1);
        resetScores();
        
        // Publish updated state
        setTimeout(publishGameState, 50);
      } else if (potentialScore < 0 || potentialScore === 1 || (potentialScore === 0 && !isValidCheckout(String(formattedValue)))) {
        // Bust
        console.log("Bust!");
        setInputs(['', '', '']);
        setCurrentInputIndex(0);
        
        // Switch player
        const nextPlayer = gameRole === 'player1' ? 'player2' : 'player1';
        setCurrentPlayer(nextPlayer);
        setIsMyTurn(false);
        
        // Publish updated state
        setTimeout(publishGameState, 50);
      } else {
        // Update score
        setPlayerScore(potentialScore);
        
        // Move to next input
        const nextInputIndex = currentInputIndex + 1;
        if (nextInputIndex < 3) {
          // Continue turn
          setCurrentInputIndex(nextInputIndex);
          // Publish interim state
          setTimeout(publishGameState, 50);
        } else {
          // End of turn (3 darts)
          // Switch player
          const nextPlayer = gameRole === 'player1' ? 'player2' : 'player1';
          setCurrentPlayer(nextPlayer);
          setIsMyTurn(false);
          setInputs(['', '', '']);
          setCurrentInputIndex(0);
          
          // Publish updated state
          setTimeout(publishGameState, 50);
        }
      }
    }
  };

  // Reset scores
  const resetScores = () => {
    console.log("Resetting scores");
    setPlayerScore(INITIAL_SCORE);
    setOpponentScore(INITIAL_SCORE);
    setInputs(['', '', '']);
    setCurrentInputIndex(0);
    
    // First player starts after reset
    setCurrentPlayer('player1');
    setIsMyTurn(gameRole === 'player1');
  };

  // Handle backspace
  const handleBackspace = () => {
    if (!isMyTurn || !gameStarted || currentInputIndex === 0) return;
    
    const newInputs = [...inputs];
    const dartValue = calculateDartValue(newInputs[currentInputIndex - 1]);
    
    // Remove dart and restore score
    newInputs[currentInputIndex - 1] = '';
    setInputs(newInputs);
    setCurrentInputIndex(currentInputIndex - 1);
    setPlayerScore(prev => prev + dartValue);
    
    // Publish updated state
    setTimeout(publishGameState, 50);
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

  // Render number buttons (1-20)
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
                  disabled={!isMyTurn || !gameStarted}
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

  // Show error if connection failed
  if (connectionError) {
    return <div className="error-message">{connectionError}</div>;
  }

  return (
    <div className="darts-counter">
      <div className="game-header">
        <div className="legs-display">
          <div className="legs-text">Legs {playerLegs}:{opponentLegs}</div>
        </div>
        <div className="player-names">
          <span className="player-name">{playerName || 'You'}</span> vs <span className="player-name">{opponentName || 'Opponent'}</span>
        </div>
        
        {/* Debug info */}
        <div className="debug-info">
          Role: {gameRole || 'Unassigned'} | Messages: {debugMsgCount}
        </div>
      </div>
      
      <div className="game-status">
        {!gameStarted ? (
          <div className="waiting-message">Waiting for opponent to join...</div>
        ) : (
          <div className={`turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
            {isMyTurn ? "Your Turn" : `${opponentName || 'Opponent'}'s Turn`}
          </div>
        )}
      </div>
      
      <div className="score-display">
        <div className={`score-section ${isMyTurn ? 'active-player' : ''}`}>
          <div className="score">{playerScore}</div>
          <div className="player">{playerName || 'You'}</div>
        </div>
        <div className="divider"></div>
        <div className={`score-section ${!isMyTurn && gameStarted ? 'active-player' : ''}`}>
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
          disabled={!isMyTurn || !gameStarted || currentInputIndex === 0}
        >⌫</button>
      </div>
      
      <div className="mode-selector">
        <button
          className={`mode-button ${selectedMode === 'single' ? 'mode-active' : ''}`}
          onClick={() => handleModeSelect('single')}
          disabled={!isMyTurn || !gameStarted}
        >
          Single
        </button>
        <button
          className={`mode-button ${selectedMode === 'double' ? 'mode-active' : ''}`}
          onClick={() => handleModeSelect('double')}
          disabled={!isMyTurn || !gameStarted}
        >
          Double
        </button>
        <button
          className={`mode-button ${selectedMode === 'triple' ? 'mode-active' : ''}`}
          onClick={() => handleModeSelect('triple')}
          disabled={!isMyTurn || !gameStarted}
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
            disabled={!isMyTurn || !gameStarted || selectedMode === 'triple'}
          >
            Bull
          </button>
          <button 
            className="score-button wider-button" 
            onClick={() => handleButtonClick('Miss')}
            disabled={!isMyTurn || !gameStarted}
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
