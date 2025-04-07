import React from 'react';

interface InputDisplayProps {
  inputs: string[];
  currentInputIndex: number;
  onBackspace: () => void;
  isMyTurn: boolean;
  gameStarted: boolean;
}

function InputDisplay({
  inputs,
  currentInputIndex,
  onBackspace,
  isMyTurn,
  gameStarted
}: InputDisplayProps) {
  return (
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
        onClick={onBackspace}
        disabled={!isMyTurn || !gameStarted || currentInputIndex === 0}
      >⌫</button>
    </div>
  );
}

export default InputDisplay; 