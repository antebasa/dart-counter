export const GAME_CHANNEL = 'darts-game-channel';
export const INITIAL_SCORE = 101;

export interface Player {
    id: string;
    name: string;
}

export type GameRole = 'player1' | 'player2' | '';
export type CurrentPlayer = 'player1' | 'player2';
export type ScoreMode = 'single' | 'double' | 'triple';

// Type for game state messages
export interface GameStateMessage {
    type: 'GAME_STATE';
    playerId: string;
    player1Score: number;
    player2Score: number;
    player1Legs: number;
    player2Legs: number;
    currentPlayer: CurrentPlayer;
    timestamp: number;
}

// Type for Hello messages
export interface HelloMessage {
    type: 'HELLO';
    playerId: string;
    playerName: string;
    timestamp: number;
}

// Type for Welcome messages
export interface WelcomeMessage {
    type: 'WELCOME';
    playerId: string;
    playerName: string;
    newPlayerRole: 'player2';
    timestamp: number;
}

// Type for Dart Thrown messages
export interface DartThrownMessage {
    type: 'DART_THROWN';
    playerId: string;
    dartValue: string | number;
    timestamp: number;
}

// Type for Game Over messages
export interface GameOverMessage {
    type: 'GAME_OVER';
    playerId: string;
    winner: string;
    // Add other relevant details if needed
}

// Union type for all possible messages
export type GameMessage =
    | GameStateMessage
    | HelloMessage
    | WelcomeMessage
    | DartThrownMessage
    | GameOverMessage;
