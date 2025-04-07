import React from 'react';
import { GameRole } from '../types';

interface GameHeaderProps {
  playerName: string;
  opponentName: string;
  playerLegs: number;
  opponentLegs: number;
  gameRole: GameRole;
  debugMsgCount: number;
}

function GameHeader({
  playerName,
  opponentName,
  playerLegs,
  opponentLegs,
  gameRole,
  debugMsgCount
}: GameHeaderProps) {
  return (
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
  );
}

export default GameHeader; 