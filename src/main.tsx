import React from 'react'
import ReactDOM from 'react-dom/client'
import { loadGameData } from './data/dataSource'
import './index.css'

// The game data (builds, items) must be chosen before anything reads it: bundled, cached or downloaded
// (src/data/dataSource.ts). The application is only imported afterwards.
loadGameData().finally(async () => {
  const { default: App } = await import('./App.tsx')
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
