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
    "primary": "bg-brand-purple",
    "secondary": "bg-brand-lilac",
    "accent": "bg-brand-orange",
    "brand-purple": "bg-brand-purple",
    "brand-lilac": "bg-brand-lilac",
  }[color] || "bg-brand-purple";

  return (
    <Card bordered className="overflow-hidden shadow-sm hover:shadow transition-all duration-200">
      <CardContent className="px-4 py-5 sm:p-6">
        <div className="flex items-center">
          <div className={cn("flex-shrink-0 rounded-md p-3", bgClass)}>
            <div className="h-6 w-6 text-white">
              {icon}
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-muted-foreground truncate">{title}</dt>
              <dd>
                <div className="text-2xl font-bold">{value}</div>
              </dd>
            </dl>
          </div>
        </div>
      </CardContent>
      {linkText && linkHref && (
        <CardFooter className="bg-accent/10 px-4 py-3 sm:px-6 border-t">
          <div className="text-sm">
            <Link 
              to={linkHref}
              className="font-medium text-brand-purple hover:text-brand-lilac transition-colors"
            >
              {linkText}<span className="sr-only"> {title}</span>
            </Link>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
