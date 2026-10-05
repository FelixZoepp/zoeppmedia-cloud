import { SplitText } from '@/components/ui/motion';
import { Card } from '@/components/ui/card';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card padding="lg" className="max-w-md text-center">
        <div className="mb-4 text-5xl">📡</div>
        <SplitText as="h1" text="Du bist offline" className="mb-2 text-[28px] font-semibold leading-tight tracking-[-0.035em]" />
        <p className="text-gray-500">
          Bitte überprüfe deine Internetverbindung und versuche es erneut.
        </p>
      </Card>
    </div>
  );
}
