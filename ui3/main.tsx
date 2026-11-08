import '@fontsource-variable/jetbrains-mono';
import 'material-symbols/rounded.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element for UI3');

createRoot(container).render(<App />);
