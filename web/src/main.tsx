import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ThemeProvider } from './state/theme';
import './index.css';

/*
 * Safari on iOS only dispatches :active if the element or one of its ancestors
 * carries a touch listener. One no-op listener buys press feedback for the
 * whole app; without it every .press control is dead on iPhone.
 */
document.addEventListener('touchstart', () => {}, { passive: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      {/* every motion.* component drops transforms and keeps opacity when the
          user asks for reduced motion, without each one re-checking */}
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </MotionConfig>
    </StrictMode>,
  );
}
