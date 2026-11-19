import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/atkinson-hyperlegible/latin-ext-400.css';
import '@fontsource/atkinson-hyperlegible/latin-ext-700.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { init } from './lib/store.svelte';
import { initPWA, requestPersistence } from './lib/pwa.svelte';

void requestPersistence();
initPWA();
void init();

export default mount(App, { target: document.getElementById('app')! });
