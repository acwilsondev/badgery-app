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
    "primary": "bg-primary-100 text-primary-500 dark:bg-primary-900 dark:text-primary-300",
    "secondary": "bg-secondary-100 text-secondary-500 dark:bg-secondary-900 dark:text-secondary-300",
    "accent": "bg-accent-100 text-accent-500 dark:bg-accent-900 dark:text-accent-300",
  }[iconColor] || "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300";

  const statusColorClass = status === "completed" 
    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" 
    : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";

  return (
    <li>
      <div className="px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`badge-circle w-10 h-10 flex items-center justify-center ${bgColorClass}`}>
                {icon}
              </div>
            </div>
            <div className="ml-4">
              <div className="text-sm font-medium text-primary-600 dark:text-primary-400">{title}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Awarded to <span className="font-medium text-gray-900 dark:text-white">{userName}</span> on <time>{formatDate(date)}</time>
              </div>
            </div>
          </div>
          <div className="ml-2 flex-shrink-0 flex">
            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColorClass}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
