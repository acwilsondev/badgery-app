import { Badge } from "@shared/schema";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateBadgeIcon } from "@/lib/badge-icons";

interface BadgeCardProps {
  badge: Badge & { 
    category?: { name: string } | null;
    awarded?: number;
  };
  onEdit?: (badge: Badge) => void;
  onAward?: (badge: Badge) => void;
  onClick?: (badge: Badge) => void;
}

export function BadgeCard({ badge, onEdit, onAward, onClick }: BadgeCardProps) {
  return (
    <Card 
      bordered 
      className="overflow-hidden shadow hover:shadow-md transition-all duration-200"
    >
      <CardContent 
        className="p-0 cursor-pointer"
        onClick={() => onClick && onClick(badge)}
      >
        <div className="px-4 py-5 sm:p-6 flex flex-col items-center text-center">
          <div 
            className="badge-circle w-20 h-20 mb-4 flex items-center justify-center"
            style={{ 
              backgroundColor: `${badge.color}20`,
              color: badge.color || "#5E2B97" 
            }}
          >
            {badge.imageUrl ? (
              <img 
                src={badge.imageUrl} 
                alt={badge.name}
                className="w-full h-full object-cover"
              />
            ) : (
              generateBadgeIcon(badge.name, badge.color || "#5E2B97")
            )}
          </div>
          
          <h3 className="text-lg font-medium text-foreground mb-1">{badge.name}</h3>
          <p className="text-sm text-muted-foreground mb-4">{badge.description}</p>
          
          <div className="flex justify-between w-full mt-auto pt-2 border-t border-brand-lilac/20 dark:border-brand-lilac/10">
            <span className="text-xs text-muted-foreground">{badge.category?.name || "Uncategorized"}</span>
            <span className="text-xs text-muted-foreground">{badge.awarded || 0} awarded</span>
          </div>
        </div>
      </CardContent>
      
      {(onEdit || onAward) && (
        <CardFooter className="border-t border-brand-lilac/20 dark:border-brand-lilac/10 bg-accent/5 px-4 py-3 sm:px-6 flex justify-between items-center">
          {onEdit && (
            <Button 
              variant="ghost" 
              onClick={() => onEdit(badge)}
            >
              Edit
            </Button>
          )}
          
          {onAward && (
            <Button 
              variant="ghost" 
              onClick={() => onAward(badge)}
            >
              Award
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

export function NewBadgeCard({ onClick }: { onClick: () => void }) {
  return (
    <Card className="bg-gray-50 dark:bg-gray-800/50 overflow-hidden shadow-sm border border-dashed border-gray-300 dark:border-gray-700 hover:shadow-md hover:border-gray-400 dark:hover:border-gray-600 transition-all duration-200">
      <button 
        type="button" 
        className="w-full h-full px-4 py-5 sm:p-6 flex flex-col items-center text-center"
        onClick={onClick}
      >
        <div className="badge-circle w-20 h-20 bg-gray-100 dark:bg-gray-700 mb-4 flex items-center justify-center">
          <svg className="h-10 w-10 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Create New Badge</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Add a new achievement to your organization's system</p>
      </button>
    </Card>
  );
}
