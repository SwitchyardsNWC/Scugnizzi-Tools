import { render } from 'preact';
import { App } from './App.tsx';
import './app.css';
import { startTheme } from './theme.ts';

startTheme();

const root = document.getElementById('app');
if (root) render(<App />, root);
