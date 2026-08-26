import { Card } from '@/components/ui/card';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card padding="lg" className="max-w-md text-center">
        <div className="mb-4 text-5xl">📡</div>
        <h1 className="mb-2 text-xl font-bold text-gray-900">Du bist offline</h1>
        <p className="text-gray-500">
          Bitte überprüfe deine Internetverbindung und versuche es erneut.
        </p>
      </Card>
    </div>
  );
}
