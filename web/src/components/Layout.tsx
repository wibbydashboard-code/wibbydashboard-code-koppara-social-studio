import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarDays, Home, Image, LayoutGrid, Leaf, Link2, ListChecks, Menu, PenLine, Shapes, Users, X,
} from 'lucide-react';
import { useSession } from '../lib/session.tsx';
import { ROLE_LABELS } from '../../../shared/workflow.ts';

const NAV = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/marcas', label: 'Marcas', icon: Leaf },
  { to: '/cuentas', label: 'Cuentas', icon: Link2 },
  { to: '/crear', label: 'Crear', icon: PenLine },
  { to: '/publicaciones', label: 'Publicaciones', icon: ListChecks },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays },
  { to: '/media', label: 'Media', icon: Image },
];
const NAV_MORE = [
  { to: '/estudio', label: 'Estudio', icon: Shapes },
  { to: '/equipo', label: 'Equipo y plan', icon: Users },
];

function Logo() {
  return (
    <span className="brandmark__logo" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M3 17c0-8 6-14 14-14-1 8-6 14-14 14z" fill="currentColor" />
        <path d="M4 16c3.5-4.5 6.5-7 10-9" stroke="#1f4d3a" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function UserSwitcher() {
  const s = useSession();
  return (
    <div className="field">
      <label className="field__label" htmlFor="acting-user">
        Actuando como
      </label>
      <select id="acting-user" aria-describedby="acting-user-hint" className="select" value={s.user.id} onChange={(e) => void s.switchUser(e.target.value)}>
        {s.users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} · {ROLE_LABELS[u.role]}
          </option>
        ))}
      </select>
      <span className="field__hint" id="acting-user-hint">
        Sesión de prueba: aún no hay inicio de sesión real.
      </span>
    </div>
  );
}

export function Layout() {
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setMore(false);
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);

  return (
    <div className="app">
      <a href="#main" className="sr-only">
        Saltar al contenido
      </a>
      <aside className="sidebar" aria-label="Navegación principal">
        <NavLink to="/" className="brandmark">
          <Logo />
          <span>
            <span className="brandmark__name">Social Studio</span>
            <span className="brandmark__sub" style={{ display: 'block' }}>
              Contenido de Koppara
            </span>
          </span>
        </NavLink>
        <NavLink to="/crear" className="btn btn--primary btn--block sidebar__cta">
          <PenLine aria-hidden /> Nueva publicación
        </NavLink>
        <nav className="nav">
          {NAV.filter((n) => n.to !== '/crear').map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon aria-hidden /> {label}
            </NavLink>
          ))}
          <div className="nav__label">Herramientas</div>
          {NAV_MORE.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__foot">
          <UserSwitcher />
        </div>
      </aside>

      <header className="topbar">
        <NavLink to="/" className="brandmark">
          <Logo />
          <span className="brandmark__name">Social Studio</span>
        </NavLink>
        <button className="btn btn--ghost btn--icon" aria-label="Abrir menú" onClick={() => setMore(true)}>
          <Menu aria-hidden />
        </button>
      </header>

      <main className="main" id="main">
        <div className="container">
          <Outlet />
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Navegación móvil">
        <NavLink to="/" end>
          <Home aria-hidden />
          Inicio
        </NavLink>
        <NavLink to="/publicaciones">
          <ListChecks aria-hidden />
          Publicaciones
        </NavLink>
        <NavLink to="/crear" className="bottom-nav__create" aria-label="Crear publicación">
          <span className="icon">
            <PenLine aria-hidden />
          </span>
        </NavLink>
        <NavLink to="/calendario">
          <CalendarDays aria-hidden />
          Calendario
        </NavLink>
        <button onClick={() => setMore(true)} aria-haspopup="dialog">
          <LayoutGrid aria-hidden />
          Más
        </button>
      </nav>

      {more && (
        <>
          <div className="sheet-backdrop" onClick={() => setMore(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Menú">
            <div className="sheet__grip" />
            <div className="row-between" style={{ marginBottom: 8 }}>
              <strong>Menú</strong>
              <button className="btn btn--ghost btn--icon btn--sm" aria-label="Cerrar menú" onClick={() => setMore(false)}>
                <X aria-hidden />
              </button>
            </div>
            <nav className="nav">
              {[...NAV, ...NAV_MORE].map(({ to, label, icon: Icon, ...r }) => (
                <NavLink key={to} to={to} end={'end' in r}>
                  <Icon aria-hidden /> {label}
                </NavLink>
              ))}
            </nav>
            <div style={{ marginTop: 16 }}>
              <UserSwitcher />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
