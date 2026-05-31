import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Dashboard from './pages/Dashboard'
import Project from './pages/Project'
import './index.css'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: '#1a1230', color: '#a78bfa', border: '1px solid #3d2f6e', fontFamily: 'DM Sans' },
          success: { style: { background: '#0d2e19', color: '#4ade80', border: '1px solid #1f4027' } },
          error: { style: { background: '#1a0808', color: '#f87171', border: '1px solid #3f1515' } },
        }}
      />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/project/:id" element={<Project />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
