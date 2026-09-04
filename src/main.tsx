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

// Intercept benign Firestore SDK BloomFilter warnings from polluting platform logs
if (typeof window !== 'undefined') {
  const isBloomFilterNoise = (args: any[]): boolean => {
    return args.some((arg) => {
      const str = typeof arg === 'string' ? arg : arg?.message || (typeof arg === 'object' ? JSON.stringify(arg) : '');
      return str.includes('BloomFilter') || str.includes('Invalid hash count');
    });
  };

  const origWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (isBloomFilterNoise(args)) return;
    origWarn.apply(console, args);
  };

  const origError = console.error;
  console.error = (...args: any[]) => {
    if (isBloomFilterNoise(args)) return;
    origError.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

