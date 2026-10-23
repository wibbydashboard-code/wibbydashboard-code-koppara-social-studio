import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './styles/tokens.css';
import './styles/app.css';
import { SessionProvider } from './lib/session.tsx';
import { ToastProvider } from './lib/toast.tsx';
import { Layout } from './components/Layout.tsx';
import { Loading } from './components/ui.tsx';
import { HomePage } from './pages/Home.tsx';
import { BrandsPage } from './pages/Brands.tsx';
import { BrandEditorPage } from './pages/BrandEditor.tsx';
import { AccountsPage } from './pages/Accounts.tsx';
import { PostEditorPage } from './pages/PostEditor.tsx';
import { PostsPage } from './pages/Posts.tsx';
import { PostDetailPage } from './pages/PostDetail.tsx';
import { CalendarPage } from './pages/Calendar.tsx';
import { MediaPage } from './pages/Media.tsx';
import { StudioPage } from './pages/Studio.tsx';
import { TeamPage } from './pages/Team.tsx';
import { NotFoundPage } from './pages/NotFound.tsx';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/marcas', element: <BrandsPage /> },
      { path: '/marcas/nueva', element: <BrandEditorPage /> },
      { path: '/marcas/:id', element: <BrandEditorPage /> },
      { path: '/cuentas', element: <AccountsPage /> },
      { path: '/crear', element: <PostEditorPage /> },
      { path: '/publicaciones', element: <PostsPage /> },
      { path: '/publicaciones/:id', element: <PostDetailPage /> },
      { path: '/publicaciones/:id/editar', element: <PostEditorPage /> },
      { path: '/calendario', element: <CalendarPage /> },
      { path: '/media', element: <MediaPage /> },
      { path: '/estudio', element: <StudioPage /> },
      { path: '/equipo', element: <TeamPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <SessionProvider fallback={<Loading label="Abriendo el estudio…" />}>
        <RouterProvider router={router} />
      </SessionProvider>
    </ToastProvider>
  </StrictMode>,
);
