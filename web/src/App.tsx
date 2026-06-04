import { Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav, Header } from './components/chrome';
import { BracketScreen } from './features/bracket/BracketScreen';
import { PlayersScreen } from './features/players/PlayersScreen';
import { ScheduleScreen } from './features/schedule/ScheduleScreen';

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <Header />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-4">
        <Routes>
          <Route path="/" element={<Navigate to="/players" replace />} />
          <Route path="/players" element={<PlayersScreen />} />
          <Route path="/bracket" element={<BracketScreen />} />
          <Route path="/schedule" element={<ScheduleScreen />} />
          <Route path="*" element={<Navigate to="/players" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
