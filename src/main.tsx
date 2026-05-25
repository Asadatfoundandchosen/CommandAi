import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ThemeProvider } from '@/components/layout';
import { NotificationProvider } from '@/components/notifications';
import { Toaster } from '@/components/ui/sonner';
import { SocketProvider } from '@/providers/SocketProvider';
import { ReduxProvider } from '@/store/Provider';
import './index.css';
import { reportWebVitals } from '@/utils/performance';

reportWebVitals();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <ReduxProvider>
      <ThemeProvider>
        <SocketProvider>
          <BrowserRouter>
            <NotificationProvider>
              <App />
            </NotificationProvider>
          </BrowserRouter>
        </SocketProvider>
        <Toaster richColors closeButton position="top-right" />
      </ThemeProvider>
    </ReduxProvider>
  </StrictMode>,
);
