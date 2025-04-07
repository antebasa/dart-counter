import React from 'react';

interface GameStatusProps {
  gameStarted: boolean;
  isMyTurn: boolean;
  opponentName: string;
}

function GameStatus({ gameStarted, isMyTurn, opponentName }: GameStatusProps) {
  return (
    <div className="game-status">
      {!gameStarted ? (
        <div className="waiting-message">Waiting for opponent to join...</div>
      ) : (
        <div className={`turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
          {isMyTurn ? "Your Turn" : `${opponentName || 'Opponent'}'s Turn`}
        </div>
      )}
    </div>
  );
}

export default GameStatus; 