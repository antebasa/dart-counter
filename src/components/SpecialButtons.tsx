import React from 'react';
import { ScoreMode } from '../types';

interface SpecialButtonsProps {
  onButtonClick: (value: string) => void;
  isMyTurn: boolean;
  gameStarted: boolean;
  selectedMode: ScoreMode;
}

function SpecialButtons({
  onButtonClick,
  isMyTurn,
  gameStarted,
  selectedMode
}: SpecialButtonsProps) {
  return (
    <div className="buttons-row special-buttons">
      <button 
        className="score-button wider-button" 
        onClick={() => onButtonClick('Bull')}
        disabled={!isMyTurn || !gameStarted || selectedMode === 'triple'}
      >
        Bull
      </button>
      <button 
        className="score-button wider-button" 
        onClick={() => onButtonClick('Miss')}
        disabled={!isMyTurn || !gameStarted}
      >
        Miss
      </button>
    </div>
  );
}

export default SpecialButtons; 