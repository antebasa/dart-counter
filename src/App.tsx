import React, { useState } from 'react';
import './App.css';

function App() {
  const INITIAL_SCORE = 501;
  const [playerScore, setPlayerScore] = useState<number>(INITIAL_SCORE);
  const [opponentScore, setOpponentScore] = useState<number>(INITIAL_SCORE);
  const [playerLegs, setPlayerLegs] = useState<number>(0);
  const [opponentLegs, setOpponentLegs] = useState<number>(0);
  const [inputs, setInputs] = useState<string[]>(['', '', '']);
  const [currentInputIndex, setCurrentInputIndex] = useState<number>(0);
  const [currentPlayer, setCurrentPlayer] = useState<'player' | 'opponent'>('player');
  const [selectedMode, setSelectedMode] = useState<'single' | 'double' | 'triple'>('single');
  
  // Handle mode selection
  const handleModeSelect = (mode: 'single' | 'double' | 'triple') => {
    setSelectedMode(mode);
  };
  
  // Handle button clicks for dart values
  const handleButtonClick = (value: string | number) => {
    if (currentInputIndex < 3) {
      const newInputs = [...inputs];
      
      // Format the value based on the selected mode
      let formattedValue = value;
      if (value !== 'Bull' && value !== 'D-Bull' && value !== 'Miss') {
        if (selectedMode === 'double') {
          formattedValue = `D${value}`;
        } else if (selectedMode === 'triple') {
          formattedValue = `T${value}`;
        }
      } else {
        // Handle Bull based on mode
        if (selectedMode === 'double' && value === 'Bull') {
          formattedValue = 'D-Bull';
        }
      }
      
      newInputs[currentInputIndex] = String(formattedValue);
      setInputs(newInputs);
      
      // Calculate the current throw score so far
      const dartValue = calculateDartValue(String(formattedValue));
      const currentThrowTotal = calculateScore(newInputs.slice(0, currentInputIndex + 1));
      
      // Check if player has won with this dart
      if (currentPlayer === 'player') {
        const newScore = playerScore - currentThrowTotal;
        
        if (newScore === 0 && isValidCheckout(String(formattedValue))) {
          // Player won with this dart
          setPlayerLegs(playerLegs + 1);
          resetScores();
          return; // Exit early, don't increment currentInputIndex
        } else if (newScore < 0 || newScore === 1 || (newScore === 0 && !isValidCheckout(String(formattedValue)))) {
          // Bust - reset inputs and keep current score
          setInputs(['', '', '']);
          return; // Exit early, don't increment currentInputIndex
        }
      } else {
        const newScore = opponentScore - currentThrowTotal;
        
        if (newScore === 0 && isValidCheckout(String(formattedValue))) {
          // Opponent won with this dart
          setOpponentLegs(opponentLegs + 1);
          resetScores();
          return; // Exit early, don't increment currentInputIndex
        } else if (newScore < 0 || newScore === 1 || (newScore === 0 && !isValidCheckout(String(formattedValue)))) {
          // Bust - reset inputs and keep current score
          setInputs(['', '', '']);
          return; // Exit early, don't increment currentInputIndex
        }
      }
      
      // Move to next input if no bust or win
      setCurrentInputIndex(currentInputIndex + 1);
      
      // If this was the third dart, calculate final score and change player
      if (currentInputIndex === 2) {
        finalizeTurn(newInputs);
      }
    }
  };

  // Finalize the turn after 3 darts
  const finalizeTurn = (dartValues: string[]) => {
    const totalScore = calculateScore(dartValues);
    
    if (currentPlayer === 'player') {
      const newScore = playerScore - totalScore;
      setPlayerScore(newScore);
      setCurrentPlayer('opponent');
    } else {
      const newScore = opponentScore - totalScore;
      setOpponentScore(newScore);
      setCurrentPlayer('player');
    }
    
    // Clear inputs for next throw
    setInputs(['', '', '']);
    setCurrentInputIndex(0);
  };

  // Handle backspace to clear last input
  const handleBackspace = () => {
    if (currentInputIndex > 0) {
      const newInputs = [...inputs];
      newInputs[currentInputIndex - 1] = '';
      setInputs(newInputs);
      setCurrentInputIndex(currentInputIndex - 1);
    }
  };

  // Check if a checkout is valid (must be a double)
  const isValidCheckout = (dartValue: string): boolean => {
    return dartValue.startsWith('D') || dartValue === 'D-Bull';
  };
  
  // Calculate value of a single dart
  const calculateDartValue = (value: string): number => {
    if (!value || value === 'Miss') return 0;
    if (value === 'Bull') return 25;
    if (value === 'D-Bull') return 50;
    
    if (value.startsWith('D')) {
      const num = parseInt(value.substring(1));
      return num * 2;
    }
    
    if (value.startsWith('T')) {
      const num = parseInt(value.substring(1));
      return num * 3;
    }
    
    return parseInt(value);
  };
  
  // Calculate score from dart values
  const calculateScore = (dartValues: string[]): number => {
    return dartValues.reduce((total, value) => {
      return total + calculateDartValue(value);
    }, 0);
  };
  
  // Reset scores to 501
  const resetScores = () => {
    setPlayerScore(INITIAL_SCORE);
    setOpponentScore(INITIAL_SCORE);
    setCurrentPlayer('player');
    setInputs(['', '', '']);
    setCurrentInputIndex(0);
  };

  // Generate number buttons (1-20)
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
                  onClick={() => handleButtonClick(value)}
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
    <div className="darts-counter">
      <div className="legs-display">
        <div className="legs-text">Legs {playerLegs}:{opponentLegs}</div>
      </div>
      
      <div className="score-display">
        <div className={`score-section ${currentPlayer === 'player' ? 'active-player' : ''}`}>
          <div className="score">{playerScore}</div>
          <div className="player">You</div>
        </div>
        <div className="divider"></div>
        <div className={`score-section ${currentPlayer === 'opponent' ? 'active-player' : ''}`}>
          <div className="score">{opponentScore}</div>
          <div className="player">Opponent</div>
        </div>
      </div>
      
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
        <button className="backspace-button" onClick={handleBackspace}>⌫</button>
      </div>
      
      <div className="mode-selector">
        <button
          className={`mode-button ${selectedMode === 'single' ? 'mode-active' : ''}`}
          onClick={() => handleModeSelect('single')}
        >
          Single
        </button>
        <button
          className={`mode-button ${selectedMode === 'double' ? 'mode-active' : ''}`}
          onClick={() => handleModeSelect('double')}
        >
          Double
        </button>
        <button
          className={`mode-button ${selectedMode === 'triple' ? 'mode-active' : ''}`}
          onClick={() => handleModeSelect('triple')}
        >
          Triple
        </button>
      </div>
      
      <div className="buttons-grid">
        {renderNumberButtons()}
        
        <div className="buttons-row special-buttons">
          <button 
            className="score-button wider-button" 
            onClick={() => handleButtonClick('Bull')}
            disabled={selectedMode === 'triple'}
          >
            Bull
          </button>
          <button 
            className="score-button wider-button" 
            onClick={() => handleButtonClick('Miss')}
          >
            Miss
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
