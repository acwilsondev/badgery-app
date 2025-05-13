import { formatDate } from "@/lib/utils";

interface ActivityItemProps {
  title: string;
  userName: string;
  date: string | Date;
  status: string;
  icon: React.ReactNode;
  iconColor: string;
}

export function ActivityItem({
  title,
  userName,
  date,
  status,
  icon,
  iconColor
}: ActivityItemProps) {
  const bgColorClass = {
    "primary": "bg-brand-purple/10 text-brand-purple",
    "secondary": "bg-brand-lilac/10 text-brand-lilac",
    "accent": "bg-brand-orange/10 text-brand-orange",
    "brand-purple": "bg-brand-purple/10 text-brand-purple",
    "brand-lilac": "bg-brand-lilac/10 text-brand-lilac",
  }[iconColor] || "bg-brand-purple/10 text-brand-purple";

  const statusColorClass = status === "completed" 
    ? "bg-brand-orange/10 text-brand-orange" 
    : "bg-brand-purple/10 text-brand-purple";

  return (
    <li>
      <div className="px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`badge-circle w-10 h-10 flex items-center justify-center rounded-lg ${bgColorClass}`}>
                {icon}
              </div>
            </div>
            <div className="ml-4">
              <div className="text-sm font-semibold text-foreground">{title}</div>
              <div className="text-sm text-muted-foreground">
                Awarded to <span className="font-medium text-foreground">{userName}</span> on <time>{formatDate(date)}</time>
              </div>
            </div>
          </div>
          <div className="ml-2 flex-shrink-0 flex">
            <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-md ${statusColorClass}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
