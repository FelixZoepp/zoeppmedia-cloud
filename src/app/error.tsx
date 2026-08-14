'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 rounded-2xl bg-red-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-8">
          Z
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Etwas ist schiefgelaufen</h1>
        <p className="text-gray-500 mb-2">
          Ein unerwarteter Fehler ist aufgetreten.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 font-mono mb-6">Fehler-ID: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
        >
          Erneut versuchen
        </button>
      </div>
    </div>
  );
}
