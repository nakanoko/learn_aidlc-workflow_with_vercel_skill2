import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { InvoiceCreatePage } from './pages/InvoiceCreatePage';
import { InvoiceDetailPage } from './pages/InvoiceDetailPage';
import { InvoiceListPage } from './pages/InvoiceListPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App(): JSX.Element {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<InvoiceListPage />} />
        <Route path="/invoices/new" element={<InvoiceCreatePage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}

export default App;
