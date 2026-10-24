import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import { LibraryProvider } from './context/LibraryContext'
import { RoleProvider } from './context/RoleContext'
import { AuthModal } from './components/AuthModal'
import { ToastProvider } from './components/ui/Toast'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* AuthProvider must wrap the UI so every consumer (sidebar, header,
          pages) sees the same Supabase session state + shared auth modal. */}
      <AuthProvider>
        <LanguageProvider>
          <LibraryProvider>
            <RoleProvider>
              <ToastProvider>
                <App />
                {/* Single shared sign-in / sign-up modal instance (opened via
                    useAuth().openAuthModal() from anywhere). */}
                <AuthModal />
              </ToastProvider>
            </RoleProvider>
          </LibraryProvider>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
