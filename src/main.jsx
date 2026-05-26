import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
// 1. Import the provider and your supabase client
import { SessionContextProvider } from '@supabase/auth-helpers-react'
import { supabase } from './supabaseClient' 

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* 2. Wrap App with the provider and pass the client */}
    <SessionContextProvider supabaseClient={supabase}>
      <App />
    </SessionContextProvider>
  </StrictMode>,
)