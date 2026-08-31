import { Route, Routes } from 'react-router-dom'

function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          BringIt
        </h1>
        <p className="mt-2 text-slate-600">
          Campus peer-to-peer delivery for CUET students
        </p>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  )
}