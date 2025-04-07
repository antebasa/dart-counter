import React from 'react';

interface NumberPadProps {
  onButtonClick: (value: number) => void;
  isMyTurn: boolean;
  gameStarted: boolean;
}

function NumberPad({ onButtonClick, isMyTurn, gameStarted }: NumberPadProps) {
  const renderNumberButtons = () => {
    const buttons = [];
    for (let i = 0; i < 4; i++) {
      buttons.push(
        <div className="buttons-row" key={`row-${i}`}>
          {[1, 2, 3, 4, 5].map(num => {
            const value = i * 5 + num;
            return (
              value <= 20 ? (
                <button 
                  key={value} 
                  className="score-button" 
                  onClick={() => onButtonClick(value)}
                  disabled={!isMyTurn || !gameStarted}
                >
                  {value}
                </button>
              ) : <div key={value} className="score-button empty"></div>
            );
          })}
        </div>
      );
    }
    return buttons;
  };

  return (
    <div className="buttons-grid">
      {renderNumberButtons()}
    </div>
  );
}

export default NumberPad; 