import { Link, NavLink, Outlet } from 'react-router';
import { useAuth, useCurrentUser } from '../lib/auth';
import { Avatar } from './ui/Avatar';
import { ThemeToggle } from './ui/ThemeToggle';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/15 ${
    isActive ? 'bg-white/20' : ''
  }`;

export function AppLayout() {
  const { logout } = useAuth();
  const { data: user } = useCurrentUser();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 bg-sky-800 px-4 shadow dark:bg-slate-900 dark:shadow-black/40">
        <Link to="/boards" className="mr-4 text-lg font-bold tracking-tight text-white">
          Flowboard
        </Link>
        <NavLink to="/boards" end className={navClass}>
          Boards
        </NavLink>
        <NavLink to="/settings" className={navClass}>
          Configurações
        </NavLink>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {user && (
            <span className="hidden items-center gap-2 text-sm text-white/90 sm:flex">
              <Avatar user={user} /> {user.name}
            </span>
          )}
          <button
            type="button"
            onClick={logout}
            className="rounded-md px-3 py-1.5 text-sm text-white/90 transition hover:bg-white/15"
          >
            Sair
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
