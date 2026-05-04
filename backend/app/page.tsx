export default function Page() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Invoice Backend API</h1>
      <p>This is an API-only service. See <code>/api/health</code> for the health check.</p>
      <ul>
        <li>GET /api/health</li>
        <li>GET/POST /api/invoices</li>
        <li>GET/DELETE /api/invoices/:id</li>
        <li>POST /api/invoices/:id/approve</li>
        <li>POST /api/invoices/:id/reject</li>
        <li>PATCH /api/invoices/:id/resubmit</li>
        <li>GET /api/audit-logs</li>
      </ul>
    </main>
  );
}
