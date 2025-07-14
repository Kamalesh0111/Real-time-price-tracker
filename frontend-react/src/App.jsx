import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Auth from './components/Auth';
import Dashboard from './pages/Dashboard';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        navigate('/');
      } else {
        navigate('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return <div className="bg-gray-900 min-h-screen"></div>; // Or a proper loading screen
  }

  return (
    <div className="bg-gray-900 text-white min-h-screen">
      {session && (
        <header className="bg-gray-800 p-4 shadow-md sticky top-0 z-10">
          <div className="container mx-auto flex justify-between items-center">
            <h1 className="text-xl font-bold">Price Tracker</h1>
            <div className="flex items-center gap-4">
              <span className="text-gray-300 hidden sm:block">{session.user.email}</span>
              <button onClick={() => supabase.auth.signOut()} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">
                Logout
              </button>
            </div>
          </div>
        </header>
      )}
      <main className="container mx-auto p-4 md:p-6">
        <Routes>
          <Route path="/login" element={<Auth />} />
          <Route path="/" element={session ? <Dashboard session={session} /> : <Auth />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;