import React, {useEffect, useState} from 'react';
import {usePubNub} from 'pubnub-react';
import {CurrentPlayer, DartThrownMessage, GameRole, INITIAL_SCORE, ScoreMode, HelloMessage, WelcomeMessage} from '../types';

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
                        
                        // Set opponent info
                        setOpponentName(opponent.uuid);
                        setIsConnected(true);
                        setGameRole('player1'); // First player joined is player1
                        
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
                    
                    // Set opponent info
                    setOpponentName(event.message.playerName);
                    setIsConnected(true);
                    setGameRole('player1'); // I was here first, so I'm player1
                    
                    // Send welcome message back to the player who just joined
                    sendWelcomeMessage(event.message.playerId);
                    
                    // Pair with opponent
                    pairWithOpponent(event.message.playerId);
                }
                
                // Handle welcome messages
                if (event.message.type === 'WELCOME' && event.message.playerId !== playerName) {
                    console.log("Welcome message from:", event.message.playerName);
                    
                    // Set opponent info
                    setOpponentName(event.message.playerName);
                    setIsConnected(true);
                    setGameRole('player2'); // I received welcome, so I'm player2
                    
                    console.log("I am player2, opponent is player1:", event.message.playerName);
                    
                    // Notify the UI that the game can start
                    setGameStarted(true);
                    setIsMyTurn(false); // Player1 goes first
                }
                
                // Handle game start messages
                if (event.message.type === 'start' && event.publisher !== playerName) {
                    console.log("Game start message from:", event.publisher);
                    setGameStarted(true);
                    
                    // Set turns based on role
                    if (gameRole === 'player1') {
                        setIsMyTurn(true);
                    } else {
                        setIsMyTurn(false);
                    }
                }
            },
            presence: (event: any) => {
                console.log("Presence event:", event);
                
                // If a new player joins and we don't have an opponent yet
                if (event.action === "join" && event.uuid !== playerName && !opponentName) {
                    console.log("New player joined:", event.uuid);
                    
                    // Set opponent info
                    setOpponentName(event.uuid);
                    setIsConnected(true);
                    setGameRole('player1'); // I was here first, so I'm player1
                    
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

        // Subscribe to the game channel
        pubnub.subscribe({channels: [channelName]});
        
        // Notify start
        pubnub.publish({
            channel: channelName, 
            message: {
                type: "start",
                playerName: playerName,
                timestamp: Date.now()
            }
        });
        
        // If I'm player1, I start
        if (gameRole === 'player1') {
            setIsMyTurn(true);
            setGameStarted(true);
        }
    };

    const generateGameChannel = (u1: string, u2: string) => {
        return `game-${[u1, u2].sort().join("-")}`;
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

        // Update local score immediately for responsiveness
        setPlayerScore(potentialScore);

        // Check win/bust/continue after a short delay to ensure score state updates
        setTimeout(() => {
            if (potentialScore === 0 && isValidCheckout(formattedValue)) {
                // Win
                console.log("Win!");
                setPlayerLegs(prev => prev + 1);
                resetScores();
            } else if (potentialScore < 0 || potentialScore === 1 || (potentialScore === 0 && !isValidCheckout(formattedValue))) {
                // Bust - Restore score before switching turn
                console.log("Bust!");
                setPlayerScore(prev => prev + currentThrowScore); // Revert score update
                setInputs(['', '', '']);
                setCurrentInputIndex(0);
                switchTurn();
            } else {
                // Continue turn or switch
                const nextInputIndex = currentInputIndex + 1;
                if (nextInputIndex < 3) {
                    // Continue turn
                    setCurrentInputIndex(nextInputIndex);
                } else {
                    // End of turn (3 darts)
                    setInputs(['', '', '']);
                    setCurrentInputIndex(0);
                    switchTurn();
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
