import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  linkText?: string;
  linkHref?: string;
}

export function StatCard({ title, value, icon, color, linkText, linkHref }: StatCardProps) {
  const bgClass = {
    "primary": "bg-primary-500",
    "secondary": "bg-secondary-500",
    "accent": "bg-accent-500",
  }[color] || "bg-primary-500";

  return (
    <Card className="bg-white overflow-hidden shadow rounded-lg">
      <CardContent className="px-4 py-5 sm:p-6">
        <div className="flex items-center">
          <div className={cn("flex-shrink-0 rounded-md p-3", bgClass)}>
            <div className="h-6 w-6 text-white">
              {icon}
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd>
                <div className="text-lg font-semibold text-gray-900">{value}</div>
              </dd>
            </dl>
          </div>
        </div>
      </CardContent>
      {linkText && linkHref && (
        <CardFooter className="bg-gray-50 px-4 py-4 sm:px-6">
          <div className="text-sm">
            <Link 
              to={linkHref}
              className="font-medium text-primary-600 hover:text-primary-500"
            >
              {linkText}<span className="sr-only"> {title}</span>
            </Link>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
