import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 rounded-2xl bg-red-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-8">
          Z
        </div>
        <h1 className="text-6xl font-extrabold text-gray-900 mb-4">404</h1>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Seite nicht gefunden</h2>
        <p className="text-gray-500 mb-8">
          Die aufgerufene Seite existiert nicht oder wurde verschoben.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
        >
          Zurück zum Dashboard
        </Link>
      </div>
    </div>
  );
}
