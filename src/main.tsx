import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { setLogLevel } from 'firebase/firestore';
import App from './App.tsx';
import './index.css';

// Configure Firestore client log level to avoid benign BloomFilter fallback warnings
try {
  setLogLevel('error');
} catch {
  // ignore
}

// Intercept benign Firestore SDK BloomFilter warnings and Vite HMR websocket reconnection noise
if (typeof window !== 'undefined') {
  const isIgnoredNoise = (arg: any): boolean => {
    const str = typeof arg === 'string' ? arg : arg?.message || (typeof arg === 'object' ? JSON.stringify(arg) : '');
    return (
      str.includes('BloomFilter') ||
      str.includes('Invalid hash count') ||
      str.includes('failed to connect to websocket') ||
      str.includes('WebSocket closed without opened')
    );
  };

  const origWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (args.some(isIgnoredNoise)) return;
    origWarn.apply(console, args);
  };

  const origError = console.error;
  console.error = (...args: any[]) => {
    if (args.some(isIgnoredNoise)) return;
    origError.apply(console, args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (isIgnoredNoise(event.reason)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  window.addEventListener('error', (event) => {
    if (isIgnoredNoise(event.message) || isIgnoredNoise(event.error)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

