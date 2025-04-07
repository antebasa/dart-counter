import React, { useState, useEffect } from 'react';
import { usePubNub } from 'pubnub-react';
import {
  GAME_CHANNEL,
  INITIAL_SCORE,
  GameRole,
  CurrentPlayer,
  ScoreMode,
  GameMessage,
  HelloMessage,
  WelcomeMessage,
  GameStateMessage,
  DartThrownMessage,
  GameOverMessage
} from '../types';

import GameHeader from './GameHeader';
import GameStatus from './GameStatus';
import ScoreDisplay from './ScoreDisplay';
import InputDisplay from './InputDisplay';
import ModeSelector from './ModeSelector';
import NumberPad from './NumberPad';
import SpecialButtons from './SpecialButtons';

interface GameProps {
  playerName: string;
}

function Game({ playerName }: GameProps) {
  // Game state
  const [playerScore, setPlayerScore] = useState<number>(INITIAL_SCORE);
  const [opponentScore, setOpponentScore] = useState<number>(INITIAL_SCORE);
  const [playerLegs, setPlayerLegs] = useState<number>(0);
  const [opponentLegs, setOpponentLegs] = useState<number>(0);
  const [inputs, setInputs] = useState<string[]>(['', '', '']);
  const [currentInputIndex, setCurrentInputIndex] = useState<number>(0);
  const [selectedMode, setSelectedMode] = useState<ScoreMode>('single');

  // Connection state
  const pubnub = usePubNub();
  const [opponentName, setOpponentName] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string>('');

  // Game control state
  const [gameRole, setGameRole] = useState<GameRole>(''); // player1 = first player, player2 = second player
  const [currentPlayer, setCurrentPlayer] = useState<CurrentPlayer>('player1'); // Who's currently playing
  const [isMyTurn, setIsMyTurn] = useState<boolean>(false);
  const [gameStarted, setGameStarted] = useState<boolean>(false);

  // Debug counter
  const [debugMsgCount, setDebugMsgCount] = useState<number>(0);

  // Handle mode selection
  const handleModeSelect = (mode: ScoreMode) => {
    setSelectedMode(mode);
  };

  // Connect to PubNub and initialize player
  useEffect(() => {
    if (!playerName) return;

    const newPlayerId = playerName//`player-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    setPlayerId(newPlayerId);
    console.log("Generated player ID:", newPlayerId);

    try {
      pubnub.subscribe({
        channels: [GAME_CHANNEL],
        withPresence: true
      });
      setIsConnected(true);

      pubnub.hereNow({
        channels: [GAME_CHANNEL],
        includeUUIDs: true
      }).then((response) => {
        console.log("Here Now response:", response);
        const occupancy = response.totalOccupancy;

        const helloMessage: HelloMessage = {
          type: 'HELLO',
          playerId: newPlayerId,
          playerName: playerName,
          timestamp: Date.now()
        };

        pubnub.publish({ channel: GAME_CHANNEL, message: helloMessage })
          .then(() => {
            console.log("Published HELLO message");
            if (occupancy <= 1) {
              setGameRole('player1');
              setCurrentPlayer('player1');
              setIsMyTurn(true);
              console.log("I am player1 (first player)");
            } else {
              console.log("Someone else is here, waiting for game setup");
            }
          });
      });
    } catch (error) {
      console.error("PubNub connection error:", error);
      setConnectionError("Failed to connect. Please refresh the page.");
    }

    return () => {
      console.log("Cleaning up PubNub subscription");
      pubnub.unsubscribe({ channels: [GAME_CHANNEL] });
      setIsConnected(false);
    };
  }, [playerName, pubnub]);

  // Handle incoming messages
  useEffect(() => {
    if (!isConnected || !playerId) return;

    const handleMessage = (event: { message: GameMessage }) => {
      const message = event.message;
      setDebugMsgCount(prev => prev + 1);
      console.log(`[${debugMsgCount}] Received message:`, message);

      if (message.playerId === playerId) {
        console.log("Ignoring own message");
        return;
      }

      switch (message.type) {
        case 'HELLO':
          handleHelloMessage(message);
          break;
        case 'WELCOME':
          handleWelcomeMessage(message);
          break;
        case 'GAME_STATE':
          handleGameStateMessage(message);
          break;
        case 'DART_THROWN':
          handleDartThrownMessage(message);
          break;
        case 'GAME_OVER':
          handleGameOverMessage(message);
          break;
      }
    };

    pubnub.addListener({ message: handleMessage });
    return () => {
      pubnub.removeListener({ message: handleMessage });
    };
  }, [isConnected, playerId, pubnub, gameRole, playerScore, opponentScore, playerLegs, opponentLegs, currentPlayer, debugMsgCount]);

  // Specific message handlers
  const handleHelloMessage = (message: HelloMessage) => {
    if (message.playerId === playerId) {
        console.log("[handleHelloMessage] Ignoring HELLO message from self.");
        return;
    }

    console.log(`[handleHelloMessage] Received HELLO from ${message.playerName} (${message.playerId}). My role: ${gameRole}. Setting opponent name.`);

    setOpponentName(message.playerName);

    if (gameRole === 'player1') {
      console.log("[handleHelloMessage] As player1, sending WELCOME back.");

      const welcomeMessage: WelcomeMessage = {
        type: 'WELCOME',
        playerId: playerId,
        playerName: playerName,
        newPlayerRole: 'player2',
        timestamp: Date.now()
      };
      pubnub.publish({ channel: GAME_CHANNEL, message: welcomeMessage })
        .then(() => {
          // Send initial game state immediately after welcome
          publishGameState();
        });
    } else {
       console.log(`[handleHelloMessage] My role is ${gameRole || 'not set yet'}, not sending WELCOME.`);
    }
  };

  const handleWelcomeMessage = (message: WelcomeMessage) => {
    console.log("Received WELCOME from player1");
    if (message.newPlayerRole === 'player2') {
      setGameRole('player2');
      setIsMyTurn(false);
      setGameStarted(true); // Player 2 confirms game start upon receiving WELCOME
    }
  };

  const handleGameStateMessage = (message: GameStateMessage) => {
    console.log("Received GAME_STATE");

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

    setCurrentPlayer(message.currentPlayer);
    setIsMyTurn(message.currentPlayer === gameRole);
    setGameStarted(true); // Receiving game state implies the game has started
  };

  const handleDartThrownMessage = (message: DartThrownMessage) => {
      console.log("Opponent threw a dart:", message.dartValue);
      // The actual state update happens via the subsequent GAME_STATE message
  };

  const handleGameOverMessage = (message: GameOverMessage) => {
      console.log("Game over:", message.winner);
      // TODO: Implement game over logic (e.g., display winner, offer rematch)
  };

  // Publish current game state
  const publishGameState = () => {
    if (!isConnected || !playerId || !gameRole) {
      console.warn("Can't publish game state - connection/role incomplete");
      return;
    }

    console.log("Publishing game state");

    const gameStateMessage: GameStateMessage = {
      type: 'GAME_STATE',
      playerId: playerId,
      player1Score: gameRole === 'player1' ? playerScore : opponentScore,
      player2Score: gameRole === 'player2' ? playerScore : opponentScore,
      player1Legs: gameRole === 'player1' ? playerLegs : opponentLegs,
      player2Legs: gameRole === 'player2' ? playerLegs : opponentLegs,
      currentPlayer: currentPlayer,
      timestamp: Date.now()
    };

    pubnub.publish({ channel: GAME_CHANNEL, message: gameStateMessage })
      .then(() => console.log("Game state published"))
      .catch(error => console.error("Failed to publish game state:", error));
  };

  // Game logic helpers
  const calculateDartValue = (value: string): number => {
    if (!value || value === 'Miss') return 0;
    if (value === 'Bull') return 25;
    if (value === 'D-Bull') return 50;
    if (value.startsWith('D')) return parseInt(value.substring(1)) * 2;
    if (value.startsWith('T')) return parseInt(value.substring(1)) * 3;
    return parseInt(value);
  };

  const calculateScore = (dartValues: string[]): number => {
    return dartValues.reduce((total, value) => total + calculateDartValue(value), 0);
  };

  const isValidCheckout = (dartValue: string): boolean => {
    return dartValue.startsWith('D') || dartValue === 'D-Bull';
  };

  // Input handlers
  const handleButtonClick = (value: string | number) => {
    if (!isMyTurn || !gameStarted || currentInputIndex >= 3) return;

    let formattedValue = String(value);
    if (typeof value === 'number') { // Number button clicked
        if (selectedMode === 'double') formattedValue = `D${value}`;
        else if (selectedMode === 'triple') formattedValue = `T${value}`;
    } else { // Special button (Bull, Miss)
        if (selectedMode === 'double' && value === 'Bull') formattedValue = 'D-Bull';
    }

    const newInputs = [...inputs];
    newInputs[currentInputIndex] = formattedValue;
    setInputs(newInputs);
    if (selectedMode !== 'single') setSelectedMode('single');

    const currentThrowScore = calculateDartValue(formattedValue);
    const potentialScore = playerScore - currentThrowScore;

    // Publish dart thrown immediately
    const dartThrownMessage: DartThrownMessage = {
        type: 'DART_THROWN',
        playerId: playerId,
        dartValue: formattedValue,
        timestamp: Date.now()
    };
    pubnub.publish({ channel: GAME_CHANNEL, message: dartThrownMessage });

    // Update local score immediately for responsiveness
    setPlayerScore(potentialScore);

    // Check win/bust/continue after a short delay to ensure score state updates
    setTimeout(() => {
        if (potentialScore === 0 && isValidCheckout(formattedValue)) {
            // Win
            console.log("Win!");
            setPlayerLegs(prev => prev + 1);
            resetScores();
            publishGameState();
        } else if (potentialScore < 0 || potentialScore === 1 || (potentialScore === 0 && !isValidCheckout(formattedValue))) {
            // Bust - Restore score before switching turn
            console.log("Bust!");
            setPlayerScore(prev => prev + currentThrowScore); // Revert score update
            setInputs(['', '', '']);
            setCurrentInputIndex(0);
            switchTurn();
            publishGameState();
        } else {
            // Continue turn or switch
            const nextInputIndex = currentInputIndex + 1;
            if (nextInputIndex < 3) {
                // Continue turn
                setCurrentInputIndex(nextInputIndex);
                publishGameState(); // Publish interim state
            } else {
                // End of turn (3 darts)
                setInputs(['', '', '']);
                setCurrentInputIndex(0);
                switchTurn();
                publishGameState();
            }
        }
    }, 50); // Delay ensures state updates before logic check
  };

  const handleBackspace = () => {
    if (!isMyTurn || !gameStarted || currentInputIndex === 0) return;

    const newInputs = [...inputs];
    const valueToRemove = newInputs[currentInputIndex - 1];
    const scoreToRestore = calculateDartValue(valueToRemove);

    newInputs[currentInputIndex - 1] = '';
    setInputs(newInputs);
    setCurrentInputIndex(prev => prev - 1);
    setPlayerScore(prev => prev + scoreToRestore);

    // Publish state after backspace
    setTimeout(publishGameState, 50);
  };

  // Game flow functions
  const switchTurn = () => {
    const nextPlayer = gameRole === 'player1' ? 'player2' : 'player1';
    setCurrentPlayer(nextPlayer);
    setIsMyTurn(false);
  };

  const resetScores = () => {
    console.log("Resetting scores for new leg");
    setPlayerScore(INITIAL_SCORE);
    setOpponentScore(INITIAL_SCORE);
    setInputs(['', '', '']);
    setCurrentInputIndex(0);
    setCurrentPlayer('player1'); // Player 1 always starts a new leg
    setIsMyTurn(gameRole === 'player1');
  };

  // Render
  if (connectionError) {
    return <div className="error-message">{connectionError}</div>;
  }

  // Log state right before rendering
  console.log(`[Render] Player: ${playerName}, Opponent: ${opponentName}, Role: ${gameRole}, Started: ${gameStarted}`);

  return (
    <div className="darts-counter">
      <GameHeader
        playerName={playerName}
        opponentName={opponentName}
        playerLegs={playerLegs}
        opponentLegs={opponentLegs}
        gameRole={gameRole}
        debugMsgCount={debugMsgCount}
      />
      <GameStatus
        gameStarted={gameStarted}
        isMyTurn={isMyTurn}
        opponentName={opponentName}
      />
      <ScoreDisplay
        playerName={playerName}
        opponentName={opponentName}
        playerScore={playerScore}
        opponentScore={opponentScore}
        isMyTurn={isMyTurn}
        gameStarted={gameStarted}
      />
      <InputDisplay
        inputs={inputs}
        currentInputIndex={currentInputIndex}
        onBackspace={handleBackspace}
        isMyTurn={isMyTurn}
        gameStarted={gameStarted}
      />
      <ModeSelector
        selectedMode={selectedMode}
        onModeSelect={handleModeSelect}
        isMyTurn={isMyTurn}
        gameStarted={gameStarted}
      />
      <NumberPad
        onButtonClick={(v) => handleButtonClick(v)}
        isMyTurn={isMyTurn}
        gameStarted={gameStarted}
      />
      <SpecialButtons
        onButtonClick={(v) => handleButtonClick(v)}
        isMyTurn={isMyTurn}
        gameStarted={gameStarted}
        selectedMode={selectedMode}
      />
    </div>
  );
}

export default Game;
