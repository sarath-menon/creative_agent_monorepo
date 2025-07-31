import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initPostHog } from './lib/posthog';

// Initialize PostHog
initPostHog();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
