import { useEffect } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { BottomNav, Header } from './components/chrome';
import { EmptyState, LoadingState } from './components/states';
import { BracketScreen } from './features/bracket/BracketScreen';
import { CreateScreen } from './features/create/CreateScreen';
import { ManageScreen } from './features/create/ManageScreen';
import { GroupsScreen } from './features/groups/GroupsScreen';
import { LandingScreen } from './features/landing/LandingScreen';
import { PlayerDetailScreen } from './features/players/PlayerDetailScreen';
import { PlayersScreen } from './features/players/PlayersScreen';
import { ScheduleScreen } from './features/schedule/ScheduleScreen';
import { useMeta } from './lib/api';
import { saveSweep } from './lib/savedSweeps';
import { SweepstakeCodeProvider } from './lib/sweepstake';

/** Tenant chrome — validates the code (via /meta), remembers it, and renders the screens. */
function TenantShell() {
  const meta = useMeta();

  useEffect(() => {
    if (meta.data) saveSweep({ code: meta.data.code, name: meta.data.name });
  }, [meta.data]);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <Header />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-4 lg:max-w-6xl lg:px-8 lg:pb-12 lg:pt-8">
        {meta.isLoading ? (
          <LoadingState label="Loading sweepstake…" />
        ) : meta.isError ? (
          <EmptyState>
            That sweepstake code wasn't found.{' '}
            <Link to="/" className="text-brand-400 underline">
              Back to start
            </Link>
          </EmptyState>
        ) : (
          <Outlet />
        )}
      </main>
      <BottomNav />
    </div>
  );
}

function TenantLayout() {
  const { code = '' } = useParams();
  return (
    <SweepstakeCodeProvider value={code.toLowerCase()}>
      <TenantShell />
    </SweepstakeCodeProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingScreen />} />
      <Route path="/new" element={<CreateScreen />} />
      <Route path="/s/:code" element={<TenantLayout />}>
        <Route index element={<PlayersScreen />} />
        <Route path="players/:id" element={<PlayerDetailScreen />} />
        <Route path="groups" element={<GroupsScreen />} />
        <Route path="bracket" element={<BracketScreen />} />
        <Route path="schedule" element={<ScheduleScreen />} />
        <Route path="manage" element={<ManageScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
