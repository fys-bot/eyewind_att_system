
import React from 'react';
import ReactDOM from 'react-dom/client';
// Fix: Add .tsx extension to the import path.
import App from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("找不到root元素");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
