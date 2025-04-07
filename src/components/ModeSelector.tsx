import React from 'react';
import { ScoreMode } from '../types';

interface ModeSelectorProps {
  selectedMode: ScoreMode;
  onModeSelect: (mode: ScoreMode) => void;
  isMyTurn: boolean;
  gameStarted: boolean;
}

function ModeSelector({
  selectedMode,
  onModeSelect,
  isMyTurn,
  gameStarted
}: ModeSelectorProps) {
  return (
    <div className="mode-selector">
      <button
        className={`mode-button ${selectedMode === 'single' ? 'mode-active' : ''}`}
        onClick={() => onModeSelect('single')}
        disabled={!isMyTurn || !gameStarted}
      >
        Single
      </button>
      <button
        className={`mode-button ${selectedMode === 'double' ? 'mode-active' : ''}`}
        onClick={() => onModeSelect('double')}
        disabled={!isMyTurn || !gameStarted}
      >
        Double
      </button>
      <button
        className={`mode-button ${selectedMode === 'triple' ? 'mode-active' : ''}`}
        onClick={() => onModeSelect('triple')}
        disabled={!isMyTurn || !gameStarted}
      >
        Triple
      </button>
    </div>
  );
}

export default ModeSelector; 