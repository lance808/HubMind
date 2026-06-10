import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import 'tailwindcss/index.css'
import './styles/tailwind-gen.css'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
