import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui.tsx';

export function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState title="Esta página no existe" action={<Link to="/" className="btn btn--primary">Volver al inicio</Link>}>
        Revisa la dirección o vuelve al inicio.
      </EmptyState>
    </div>
  );
}
