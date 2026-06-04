import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { queryClient } from './lib/api';
import './index.css';

// In dev, serve the app against MSW mocks so the UI runs without the backend.
// Set VITE_MOCKS=off to hit the real API instead (e.g. `VITE_MOCKS=off npm run dev`).
async function enableMocking(): Promise<void> {
  if (!import.meta.env.DEV || import.meta.env.VITE_MOCKS === 'off') return;
  const { worker } = await import('./mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass' });
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

void enableMocking().then(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
});
