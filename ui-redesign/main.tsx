import '@fontsource-variable/geist';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/jetbrains-mono';
import 'material-symbols/outlined.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ConsoleProvider } from './context/ConsoleProvider';
import './styles/app.css';

const params = new URLSearchParams(window.location.search);
const legacyRequested = params.get('ui') === 'legacy' || import.meta.env.VITE_UI === 'legacy';

if (legacyRequested) {
  window.location.replace('/');
} else {
  const container = document.getElementById('root');
  if (container) {
    createRoot(container).render(
      <StrictMode>
        <ConsoleProvider>
          <App />
        </ConsoleProvider>
      </StrictMode>
    );
  }
}
