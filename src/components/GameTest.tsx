import React, {useEffect, useRef, useState} from 'react';
import {usePubNub} from 'pubnub-react';
import {
    CurrentPlayer,
    DartThrownMessage,
    GameRole,
    GameStateMessage,
    HelloMessage,
    INITIAL_SCORE,
    ScoreMode,
    WelcomeMessage
} from '../types';

import GameHeader from './GameHeader';
import GameStatus from './GameStatus';
import ScoreDisplay from './ScoreDisplay';
import InputDisplay from './InputDisplay';
import ModeSelector from './ModeSelector';
import NumberPad from './NumberPad';
import SpecialButtons from './SpecialButtons';

const LOBBY_CHANNEL = "game-lobby";

interface GameProps {
    playerName: string;
}

function Game({playerName}: GameProps) {
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
    const [gameChannel, setGameChannel] = useState<string>('');

    // Game control state
    const [gameRole, setGameRole] = useState<GameRole>(''); // player1 = first player, player2 = second player
    const [activePlayer, setActivePlayer] = useState<CurrentPlayer>('player1'); // Who's currently playing
    const [isMyTurn, setIsMyTurn] = useState<boolean>(false);
    const [gameStarted, setGameStarted] = useState<boolean>(false);
    const [legStartPlayer, setLegStartPlayer] = useState<CurrentPlayer>('player1'); // Track who starts the current leg

    // Debug counter
    const [debugMsgCount, setDebugMsgCount] = useState<number>(0);
    const [debugInfo, setDebugInfo] = useState<string>('');

    // Refs to track latest state values for async operations
    const playerScoreRef = useRef(playerScore);
    const gameRoleRef = useRef(gameRole);
    const activePlayerRef = useRef(activePlayer);
    const gameChannelRef = useRef(gameChannel);
    const playerLegsRef = useRef(playerLegs);
    const opponentLegsRef = useRef(opponentLegs);

    // Keep refs in sync with state
    useEffect(() => {
        playerScoreRef.current = playerScore;
        gameRoleRef.current = gameRole;
        activePlayerRef.current = activePlayer;
        gameChannelRef.current = gameChannel;
        playerLegsRef.current = playerLegs;
        opponentLegsRef.current = opponentLegs;
    }, [playerScore, gameRole, activePlayer, gameChannel, playerLegs, opponentLegs]);

    // Handle mode selection
    const handleModeSelect = (mode: ScoreMode) => {
        setSelectedMode(mode);
    };

    // Update turn based on role and active player
    const updateTurnStatus = (role: GameRole, currentActivePlayer: CurrentPlayer) => {
        const myTurn = (role === 'player1' && currentActivePlayer === 'player1') ||
            (role === 'player2' && currentActivePlayer === 'player2');

        const logMsg = `TURN UPDATE: My role is ${role}, active player is ${currentActivePlayer}, so it's ${myTurn ? 'MY' : 'NOT MY'} turn`;
        console.log(logMsg);
        setDebugInfo(logMsg);
        setIsMyTurn(myTurn);
        return myTurn;
    };

    useEffect(() => {
        // Set player ID on component mount
        setPlayerId(playerName);

        // Configure PubNub with the player's name as UUID
        pubnub.setUUID(playerName);

        // Subscribe to the lobby channel
        pubnub.subscribe({
            channels: [LOBBY_CHANNEL],
            withPresence: true
        });

        console.log("Subscribed to", LOBBY_CHANNEL, "as", playerName);

        // Announce presence in the lobby
        const announcePresence = async () => {
            try {
                const helloMessage: HelloMessage = {
                    type: 'HELLO',
                    playerId: playerName,
                    playerName: playerName,
                    timestamp: Date.now()
                };

                await pubnub.publish({
                    channel: LOBBY_CHANNEL,
                    message: helloMessage
                });

                console.log("Published hello message to lobby", helloMessage);
            } catch (error) {
                console.error("Error publishing hello message:", error);
                setConnectionError("Failed to announce presence in lobby");
            }
        };

        announcePresence();

        // Check who is already in the lobby
        pubnub.hereNow(
            {
                channels: [LOBBY_CHANNEL],
                includeUUIDs: true,
                includeState: true
            },
            (status, response) => {
                if (status.error) {
                    console.error("PubNub hereNow error:", status);
                    setConnectionError("Failed to check lobby presence");
                    return;
                }

                console.log("Current lobby occupants:", response);

                if (response.channels[LOBBY_CHANNEL]) {
                    const occupants = response.channels[LOBBY_CHANNEL].occupants;
                    console.log("Found", occupants.length, "players in lobby");

                    // Find other players (not myself)
                    const otherPlayers = occupants.filter(p => p.uuid !== playerName);
                    console.log("Other players:", otherPlayers);

                    if (otherPlayers.length > 0) {
                        // Take the first other player as opponent
                        const opponent = otherPlayers[0];
                        console.log("Found opponent:", opponent.uuid);

                        // I'm player1 (first to exist in the lobby)
                        const myRole: GameRole = 'player1';
                        setGameRole(myRole);
                        gameRoleRef.current = myRole;

                        // First player (player1) starts the game
                        setActivePlayer('player1');
                        activePlayerRef.current = 'player1';
                        updateTurnStatus(myRole, 'player1');

                        // Set opponent info
                        setOpponentName(opponent.uuid);
                        setIsConnected(true);
                        setGameStarted(true);

                        // Send welcome message to the other player
                        sendWelcomeMessage(opponent.uuid);

                        // Pair with opponent
                        pairWithOpponent(opponent.uuid);
                    } else {
                        // No other players, I'm the first one
                        console.log("No other players in lobby yet. Waiting for opponent...");
                    }
                }
            }
        );

        // Listen for messages and presence events
        const listener = {
            message: (event: any) => {
                console.log("Message received:", event);
                setDebugMsgCount(prev => prev + 1);

                // Handle hello messages from other players
                if (event.message.type === 'HELLO' && event.message.playerId !== playerName) {
                    console.log("Hello message from:", event.message.playerName);

                    // I'm player1 (first to receive a hello)
                    const myRole: GameRole = 'player1';
                    setGameRole(myRole);
                    gameRoleRef.current = myRole;

                    // Player1 starts the game
                    setActivePlayer('player1');
                    activePlayerRef.current = 'player1';
                    updateTurnStatus(myRole, 'player1');

                    // Set opponent info
                    setOpponentName(event.message.playerName);
                    setIsConnected(true);
                    setGameStarted(true);

                    // Send welcome message back to the player who just joined
                    sendWelcomeMessage(event.message.playerId);

                    // Pair with opponent
                    pairWithOpponent(event.message.playerId);
                }

                // Handle welcome messages
                if (event.message.type === 'WELCOME' && event.message.playerId !== playerName) {
                    console.log("Welcome message from:", event.message.playerName);

                    // I'm player2 (I received a welcome message)
                    const myRole: GameRole = 'player2';
                    setGameRole(myRole);
                    gameRoleRef.current = myRole;

                    // First player (player1) starts the game
                    setActivePlayer('player1');
                    activePlayerRef.current = 'player1';
                    updateTurnStatus(myRole, 'player1');

                    // Set opponent info
                    setOpponentName(event.message.playerName);
                    setIsConnected(true);
                    setGameStarted(true);

                    // Pair with opponent (if not already paired)
                    if (!gameChannel) {
                        pairWithOpponent(event.message.playerId);
                    }
                }

                // Handle game start messages
                if (event.message.type === 'start' && event.publisher !== playerName) {
                    console.log("Game start message from:", event.publisher);
                    setGameStarted(true);
                }

                // Handle dart thrown messages
                if (event.message.type === 'DART_THROWN' && event.message.playerId !== playerName) {
                    console.log("Dart thrown by opponent:", event.message.dartValue);
                    // No need to update anything locally for individual darts - score will be updated via GAME_STATE
                }

                // Handle game state update messages
                if (event.message.type === 'GAME_STATE' && event.message.playerId !== playerName) {
                    const currentRole = gameRoleRef.current;
                    console.log(`Game state update from opponent. I am ${currentRole}. Message:`, event.message);

                    // Check for leg changes before updating scores
                    let legChanged = false;
                    
                    if (currentRole === 'player1') {
                        // Check if either player's legs changed
                        if (playerLegsRef.current !== event.message.player1Legs || 
                            opponentLegsRef.current !== event.message.player2Legs) {
                            legChanged = true;
                            console.log("Leg score changed, resetting scores to initial value");
                        }
                        
                        // Update legs
                        setPlayerLegs(event.message.player1Legs);
                        playerLegsRef.current = event.message.player1Legs;
                        setOpponentLegs(event.message.player2Legs);
                        opponentLegsRef.current = event.message.player2Legs;
                    } else {
                        // Check if either player's legs changed
                        if (playerLegsRef.current !== event.message.player2Legs || 
                            opponentLegsRef.current !== event.message.player1Legs) {
                            legChanged = true;
                            console.log("Leg score changed, resetting scores to initial value");
                        }
                        
                        // Update legs
                        setPlayerLegs(event.message.player2Legs);
                        playerLegsRef.current = event.message.player2Legs;
                        setOpponentLegs(event.message.player1Legs);
                        opponentLegsRef.current = event.message.player1Legs;
                    }
                    
                    // If leg changed, reset scores to initial
                    if (legChanged) {
                        setPlayerScore(INITIAL_SCORE);
                        playerScoreRef.current = INITIAL_SCORE;
                        setOpponentScore(INITIAL_SCORE);
                    } else {
                        // Only update scores if leg hasn't changed
                        // Update scores based on game role
                        if (currentRole === 'player1') {
                            // I'm player1, so update player2's score and my score
                            console.log(`Updating scores: my score=${event.message.player1Score}, opponent score=${event.message.player2Score} (I'm player1)`);
                            setPlayerScore(event.message.player1Score);
                            playerScoreRef.current = event.message.player1Score;
                            setOpponentScore(event.message.player2Score);
                        } else {
                            // I'm player2, so update player1's score and my score
                            console.log(`Updating scores: my score=${event.message.player2Score}, opponent score=${event.message.player1Score} (I'm player2)`);
                            setPlayerScore(event.message.player2Score);
                            playerScoreRef.current = event.message.player2Score;
                            setOpponentScore(event.message.player1Score);
                        }
                    }

                    // Update active player
                    const newActivePlayer = event.message.currentPlayer;
                    console.log(`Received active player update: ${newActivePlayer}`);
                    setActivePlayer(newActivePlayer);
                    activePlayerRef.current = newActivePlayer;

                    // Update turn status based on the new active player
                    updateTurnStatus(currentRole, newActivePlayer);
                }
            },
            presence: (event: any) => {
                console.log("Presence event:", event);

                // If a new player joins and we don't have an opponent yet
                if (event.action === "join" && event.uuid !== playerName && !opponentName) {
                    console.log("New player joined:", event.uuid);

                    // I'm player1 (I was here first)
                    const myRole: GameRole = 'player1';
                    setGameRole(myRole);
                    gameRoleRef.current = myRole;

                    // First player (player1) starts the game
                    setActivePlayer('player1');
                    activePlayerRef.current = 'player1';
                    updateTurnStatus(myRole, 'player1');

                    // Set opponent info
                    setOpponentName(event.uuid);
                    setIsConnected(true);
                    setGameStarted(true);

                    // Send welcome message to the new player
                    sendWelcomeMessage(event.uuid);

                    // Pair with opponent
                    pairWithOpponent(event.uuid);
                }
            },
        };

        pubnub.addListener(listener);

        return () => {
            pubnub.removeListener(listener);
            pubnub.unsubscribeAll();
        };
    }, []);

    // Send welcome message to a newly joined player
    const sendWelcomeMessage = (targetPlayerId: string) => {
        try {
            const welcomeMessage: WelcomeMessage = {
                type: 'WELCOME',
                playerId: playerName,
                playerName: playerName,
                newPlayerRole: 'player2',
                timestamp: Date.now()
            };

            pubnub.publish({
                channel: LOBBY_CHANNEL,
                message: welcomeMessage
            });

            console.log("Sent welcome message to", targetPlayerId, welcomeMessage);
        } catch (error) {
            console.error("Error sending welcome message:", error);
        }
    };

    const pairWithOpponent = (opponentId: string) => {
        const channelName = generateGameChannel(playerName, opponentId);
        console.log("Pairing with opponent:", opponentId, "in channel:", channelName);

        // Store game channel
        setGameChannel(channelName);
        gameChannelRef.current = channelName;

        // Subscribe to the game channel
        pubnub.subscribe({channels: [channelName]});

        // Send initial game state with a delay to ensure state variables are set
        setTimeout(() => {
            // Notify start
            pubnub.publish({
                channel: channelName,
                message: {
                    type: "start",
                    playerName: playerName,
                    timestamp: Date.now()
                }
            });

            // Send initial game state
            sendGameState();
        }, 800);
    };

    const generateGameChannel = (u1: string, u2: string) => {
        return `game-${[u1, u2].sort().join("-")}`;
    };

    // Send game state to other player
    const sendGameState = () => {
        const currentGameChannel = gameChannelRef.current;
        const currentRole = gameRoleRef.current;
        const currentActivePlayer = activePlayerRef.current;
        const currentPlayerScore = playerScoreRef.current;
        const currentPlayerLegs = playerLegsRef.current;
        const currentOpponentLegs = opponentLegsRef.current;

        if (!currentGameChannel) {
            console.error("Cannot send game state: no game channel");
            return;
        }

        try {
            // Get current states for logging
            const p1Score = currentRole === 'player1' ? currentPlayerScore : opponentScore;
            const p2Score = currentRole === 'player2' ? currentPlayerScore : opponentScore;
            const p1Legs = currentRole === 'player1' ? currentPlayerLegs : currentOpponentLegs;
            const p2Legs = currentRole === 'player2' ? currentPlayerLegs : currentOpponentLegs;

            // Create message
            const gameStateMessage: GameStateMessage = {
                type: 'GAME_STATE',
                playerId: playerName,
                player1Score: currentRole === 'player1' ? currentPlayerScore : opponentScore,
                player2Score: currentRole === 'player2' ? currentPlayerScore : opponentScore,
                player1Legs: currentRole === 'player1' ? currentPlayerLegs : currentOpponentLegs,
                player2Legs: currentRole === 'player2' ? currentPlayerLegs : currentOpponentLegs,
                currentPlayer: currentActivePlayer,
                timestamp: Date.now()
            };

            console.log(`Sending game state: I am ${currentRole}, scores: P1=${p1Score}/${p1Legs}, P2=${p2Score}/${p2Legs}, activePlayer=${currentActivePlayer}`);

            pubnub.publish({
                channel: currentGameChannel,
                message: gameStateMessage
            });
        } catch (error) {
            console.error("Error sending game state:", error);
        }
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
        // Extra validation to ensure only active player can throw
        if (!isMyTurn || !gameStarted || currentInputIndex >= 3) {
            console.log("Button click rejected: isMyTurn=", isMyTurn, "gameStarted=", gameStarted, "index=", currentInputIndex);
            return;
        }

        console.log(`Processing dart throw as ${gameRole}, dart ${currentInputIndex + 1}`);

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

        if (gameChannel) {
            pubnub.publish({
                channel: gameChannel,
                message: dartThrownMessage
            });
        }

        // Update local score immediately for responsiveness
        setPlayerScore(potentialScore);
        playerScoreRef.current = potentialScore;
        console.log(`My score updated from ${playerScore} to ${potentialScore}`);

        // Check win/bust/continue after a short delay to ensure score state updates
        setTimeout(() => {
            if (potentialScore === 0 && isValidCheckout(formattedValue)) {
                // Win
                console.log("Win!");
                setPlayerLegs(prev => prev + 1);
                setPlayerScore(INITIAL_SCORE)
                setOpponentScore(INITIAL_SCORE)
                resetScores();

                // Send updated game state to opponent
                setTimeout(sendGameState, 200);
            } else if (potentialScore < 0 || potentialScore === 1 || (potentialScore === 0 && !isValidCheckout(formattedValue))) {
                // Bust - Restore score before switching turn
                console.log("Bust!");
                const restoredScore = playerScore;
                setPlayerScore(restoredScore); // Revert score update
                playerScoreRef.current = restoredScore;
                console.log(`Bust! Score restored to ${restoredScore}`);
                setInputs(['', '', '']);
                setCurrentInputIndex(0);

                // Switch turn
                switchTurn();

                // Send updated game state to opponent
                setTimeout(sendGameState, 200);
            } else {
                // Continue turn or switch
                const nextInputIndex = currentInputIndex + 1;
                if (nextInputIndex < 3) {
                    // Continue turn
                    setCurrentInputIndex(nextInputIndex);
                    console.log(`Continue turn, dart ${nextInputIndex + 1}`);
                } else {
                    // End of turn (3 darts)
                    console.log(`End of turn, all 3 darts thrown. Final score: ${potentialScore}`);
                    setInputs(['', '', '']);
                    setCurrentInputIndex(0);

                    // Switch turn
                    switchTurn();

                    // Send updated game state to opponent
                    setTimeout(sendGameState, 200);
                }
            }
        }, 100); // Delay ensures state updates before logic check
    };

    const handleBackspace = () => {
        if (!isMyTurn || !gameStarted || currentInputIndex === 0) return;

        const newInputs = [...inputs];
        const valueToRemove = newInputs[currentInputIndex - 1];
        const scoreToRestore = calculateDartValue(valueToRemove);

        newInputs[currentInputIndex - 1] = '';
        setInputs(newInputs);
        setCurrentInputIndex(prev => prev - 1);
        const newScore = playerScore + scoreToRestore;
        setPlayerScore(newScore);
        playerScoreRef.current = newScore;
    };

    // Game flow functions
    const switchTurn = () => {
        // Switch from player1 to player2 or vice versa
        const currentActivePlayer = activePlayerRef.current;
        const newActivePlayer = currentActivePlayer === 'player1' ? 'player2' : 'player1';
        console.log(`Switching turn from ${currentActivePlayer} to ${newActivePlayer}`);

        setActivePlayer(newActivePlayer);
        activePlayerRef.current = newActivePlayer;

        // Update isMyTurn based on my role and new active player
        updateTurnStatus(gameRoleRef.current, newActivePlayer);
    };

    const resetScores = () => {
        console.log("Resetting scores for new leg");
        setPlayerScore(INITIAL_SCORE);
        playerScoreRef.current = INITIAL_SCORE;
        setOpponentScore(INITIAL_SCORE);
        setInputs(['', '', '']);
        setCurrentInputIndex(0);
        
        // Alternate starting player for the new leg
        const newStartingPlayer: CurrentPlayer = legStartPlayer === 'player1' ? 'player2' : 'player1';
        console.log(`New leg: Changing starting player from ${legStartPlayer} to ${newStartingPlayer}`);
        
        setLegStartPlayer(newStartingPlayer);
        setActivePlayer(newStartingPlayer);
        activePlayerRef.current = newStartingPlayer;
        updateTurnStatus(gameRoleRef.current, newStartingPlayer);
    };

    // Render
    if (connectionError) {
        return <div className="error-message">{connectionError}</div>;
    }

    // Improved debug info
    console.log(`RENDER: I am ${gameRole}, active player is ${activePlayer}, isMyTurn=${isMyTurn}, myScore=${playerScore}, opponentScore=${opponentScore}`);

    // // For troubleshooting - force a game state sync every 5 seconds
    // useEffect(() => {
    //     const syncInterval = setInterval(() => {
    //         if (gameStarted && gameChannel) {
    //             console.log("Periodic sync - ensuring game state is in sync");
    //             sendGameState();
    //         }
    //     }, 5000);
    //
    //     return () => clearInterval(syncInterval);
    // }, [gameStarted, gameChannel]);

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
                gameStarted={gameStarted && opponentName !== ''}
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

            {/* Debug display */}
            <div style={{
                marginTop: '1rem',
                fontSize: '0.8rem',
                color: '#666',
                background: '#f5f5f5',
                padding: '0.5rem'
            }}>
                <div>Role: {gameRole} | Active: {activePlayer} | My Turn: {isMyTurn ? 'YES' : 'NO'}</div>
                <div>My Score: {playerScore} | Opponent: {opponentScore} | Dart #{currentInputIndex + 1}</div>
                <div>{debugInfo}</div>
                <button
                    onClick={sendGameState}
                    style={{marginTop: '0.5rem', fontSize: '0.7rem', padding: '0.2rem 0.5rem'}}
                >
                    Force Sync Now
                </button>
            </div>
        </div>
    );
}

export default Game;
