import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Link } from 'wouter';
import { useMeta } from '@/lib/util';

export default function NotFound() {
  useMeta('Page not found', 'This page is unavailable. Browse free PDF, Word, Excel, image and text tools on KTAS Tools.');
  return (
    <div className="min-h-[40vh] w-full flex items-center justify-center">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">
              404 Page Not Found
            </h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            This page could not be found. Browse the toolkit to find what you need.
          </p>
          <Link href="/tools" className="btn btn-primary mt-5">Browse all tools</Link>
        </CardContent>
      </Card>
    </div>
  );
}
