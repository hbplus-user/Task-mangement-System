import React from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './store.jsx';
import App from './App.jsx';
import './styles.css';

// Adobe Fonts (Typekit) kit for The Seasons / Gilroy, if you use one: VITE_ADOBE_FONTS_KIT=abc1234
const kit = import.meta.env.VITE_ADOBE_FONTS_KIT;
if (kit) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://use.typekit.net/${kit}.css`;
  document.head.appendChild(l);
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>
);
