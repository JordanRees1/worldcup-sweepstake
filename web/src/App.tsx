import { Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav, Header } from './components/chrome';
import { BracketScreen } from './features/bracket/BracketScreen';
import { GroupsScreen } from './features/groups/GroupsScreen';
import { PlayerDetailScreen } from './features/players/PlayerDetailScreen';
import { PlayersScreen } from './features/players/PlayersScreen';
import { ScheduleScreen } from './features/schedule/ScheduleScreen';

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <Header />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-4 lg:max-w-6xl lg:px-8 lg:pb-12 lg:pt-8">
        <Routes>
          <Route path="/" element={<Navigate to="/players" replace />} />
          <Route path="/players" element={<PlayersScreen />} />
          <Route path="/players/:id" element={<PlayerDetailScreen />} />
          <Route path="/groups" element={<GroupsScreen />} />
          <Route path="/bracket" element={<BracketScreen />} />
          <Route path="/schedule" element={<ScheduleScreen />} />
          <Route path="*" element={<Navigate to="/players" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
