import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Speed up Recharts chart animations globally (default is 1500ms — too slow)
import * as Recharts from 'recharts';
['Bar', 'Line', 'Area', 'Pie', 'Scatter', 'Radar'].forEach(name => {
  if (Recharts[name]?.defaultProps) {
    Recharts[name].defaultProps.animationDuration = 500;
    Recharts[name].defaultProps.animationEasing   = 'ease-out';
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
