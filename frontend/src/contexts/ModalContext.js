// frontend/src/contexts/ModalContext.js
import React, { createContext, useContext, useState } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';

const ModalContext = createContext();

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

export const ModalProvider = ({ children }) => {
  const [alertState, setAlertState] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info', // 'info', 'success', 'error', 'warning'
    onClose: null
  });

  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
    confirmText: 'Confirm',
    cancelText: 'Cancel'
  });

  const showAlert = (message, title = 'Notice', type = 'info') => {
    return new Promise((resolve) => {
      setAlertState({
        isOpen: true,
        title,
        message,
        type,
        onClose: () => {
          setAlertState(prev => ({ ...prev, isOpen: false }));
          // Small delay to allow modal to close before resolving
          setTimeout(() => resolve(), 100);
        }
      });
    });
  };

  const showConfirm = (message, title = 'Confirm', confirmText = 'Confirm', cancelText = 'Cancel') => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        title,
        message,
        confirmText,
        cancelText,
        onConfirm: () => {
          setConfirmState(prev => ({ ...prev, isOpen: false }));
          // Small delay to allow modal to close before resolving
          setTimeout(() => resolve(true), 100);
        },
        onCancel: () => {
          setConfirmState(prev => ({ ...prev, isOpen: false }));
          // Small delay to allow modal to close before resolving
          setTimeout(() => resolve(false), 100);
        }
      });
    });
  };

  const getAlertIcon = () => {
    switch (alertState.type) {
      case 'success':
        return <CheckCircle size={24} className="modal-icon success" />;
      case 'error':
        return <AlertCircle size={24} className="modal-icon error" />;
      case 'warning':
        return <AlertCircle size={24} className="modal-icon warning" />;
      default:
        return <AlertCircle size={24} className="modal-icon info" />;
    }
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}

      {/* Alert Modal */}
      {alertState.isOpen && (
        <div className="modal-overlay" onClick={alertState.onClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {getAlertIcon()}
                <h3>{alertState.title}</h3>
              </div>
              <button className="modal-close" onClick={alertState.onClose}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ whiteSpace: 'pre-line' }}>{alertState.message}</p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-primary"
                onClick={alertState.onClose}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    alertState.onClose();
                  }
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmState.isOpen && (
        <div className="modal-overlay" onClick={confirmState.onCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{confirmState.title}</h3>
              <button className="modal-close" onClick={confirmState.onCancel}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ whiteSpace: 'pre-line' }}>{confirmState.message}</p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={confirmState.onCancel}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    confirmState.onCancel();
                  }
                }}
              >
                {confirmState.cancelText}
              </button>
              <button
                className="btn-primary"
                onClick={confirmState.onConfirm}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    confirmState.onConfirm();
                  }
                }}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};
