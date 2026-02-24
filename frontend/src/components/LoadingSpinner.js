// frontend/src/components/LoadingSpinner.js
import React from 'react';

export function Spinner({ size = 'medium', className = '' }) {
  const sizeClass = size === 'small' ? 'spinner-small' : size === 'large' ? 'spinner-large' : '';
  return <div className={`spinner ${sizeClass} ${className}`} />;
}

export function SpinnerContainer({ text, fullscreen = false }) {
  return (
    <div className={`spinner-container ${fullscreen ? 'fullscreen' : ''}`}>
      <Spinner />
      {text && <span className="spinner-text">{text}</span>}
    </div>
  );
}

export default Spinner;
