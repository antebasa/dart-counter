import React from 'react';

interface ScoreDisplayProps {
  playerName: string;
  opponentName: string;
  playerScore: number;
  opponentScore: number;
  isMyTurn: boolean;
  gameStarted: boolean;
}

function ScoreDisplay({
  playerName,
  opponentName,
  playerScore,
  opponentScore,
  isMyTurn,
  gameStarted
}: ScoreDisplayProps) {
  return (
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
  );
}

export default ScoreDisplay; 