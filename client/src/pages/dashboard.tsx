import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/sidebar";
import { StatCard } from "@/components/ui/stat-card";
import { ActivityItem } from "@/components/ui/activity-item";
import { BadgeCard, NewBadgeCard } from "@/components/ui/badge-card";
import { BadgeDialog } from "@/components/badge-dialog";
import { AwardBadgeDialog } from "@/components/award-badge-dialog";
import { Button } from "@/components/ui/button";
import {
  Tag,
  Users,
  CheckCircle,
  Search,
  Menu,
  Bell,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@shared/schema";
import { generateBadgeIcon } from "@/lib/badge-icons";
import { useMobile } from "@/hooks/use-mobile";

interface DashboardProps {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    organizationId?: number;
  };
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const organizationId = user.organizationId || 1;
  const isMobile = useMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [badgeDialogOpen, setBadgeDialogOpen] = useState(false);
  const [awardDialogOpen, setAwardDialogOpen] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);

  type StatsData = {
    totalBadges: number;
    totalUsers: number;
    totalAwarded: number;
    inProgress: number;
  };

  const { data: stats = { totalBadges: 0, totalUsers: 0, totalAwarded: 0, inProgress: 0 } } = useQuery<StatsData>({
    queryKey: [`/api/organizations/${organizationId}/stats`],
  });

  type CategoryData = {
    id: number;
    name: string;
    organizationId: number;
    createdAt: string;
  };

  const { data: categories = [] } = useQuery<CategoryData[]>({
    queryKey: [`/api/organizations/${organizationId}/categories`],
  });

  const { data: badges = [] } = useQuery({
    queryKey: [`/api/organizations/${organizationId}/badges`, selectedCategoryId],
    queryFn: async ({ queryKey }) => {
      const [base, categoryId] = queryKey;
      const url = categoryId && categoryId !== "all" 
        ? `${base}?categoryId=${categoryId}` 
        : base;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch badges");
      return res.json();
    },
  });

  type ActivityData = {
    id: number;
    badgeId: number;
    userId: number;
    awardedBy: number;
    awardedAt: string;
    badge: {
      name: string;
      description: string;
      color: string;
      imageUrl: string | null;
    };
    user: {
      name: string;
    };
    awardedByUser: {
      name: string;
    };
  };

  const { data: recentActivity = [] } = useQuery<ActivityData[]>({
    queryKey: [`/api/organizations/${organizationId}/awarded-badges`],
  });

  const handleCreateBadge = () => {
    setSelectedBadge(null);
    setBadgeDialogOpen(true);
  };

  const handleEditBadge = (badge: Badge) => {
    setSelectedBadge(badge);
    setBadgeDialogOpen(true);
  };

  const handleAwardBadge = (badge: Badge) => {
    setSelectedBadge(badge);
    setAwardDialogOpen(true);
  };

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar 
        user={user} 
        onLogout={onLogout} 
        isMobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      
      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Top navigation */}
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-background border-b">
          <button
            type="button"
            className="lg:hidden px-4 border-r border-border text-brand-purple hover:text-brand-purple/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-purple/50 transition-colors"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-6 w-6" />
          </button>
          
          <div className="flex-1 px-4 flex justify-between">
            <div className="flex-1 flex">
              <form className="w-full flex md:ml-0" action="#" method="GET">
                <label htmlFor="search-field" className="sr-only">Search</label>
                <div className="relative w-full focus-within:text-primary">
                  <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none pl-3">
                    <Search className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <input
                    id="search-field"
                    className="block w-full h-full pl-10 pr-3 py-2 border-transparent rounded-md text-foreground placeholder:text-muted-foreground bg-accent/10 focus:outline-none focus:ring-1 focus:ring-primary/50 sm:text-sm"
                    placeholder="Search badges, users..."
                    type="search"
                  />
                </div>
              </form>
            </div>
            
            <div className="ml-4 flex items-center md:ml-6">
              <button
                type="button"
                className="bg-accent/10 p-2 rounded-md text-brand-purple hover:text-brand-purple/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-purple/50 transition-colors"
              >
                <span className="sr-only">View notifications</span>
                <Bell className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
        
        {/* Page header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm">
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-purple to-brand-lilac">Organization Dashboard</h1>
              <p className="mt-1 text-sm text-muted-foreground">Manage your badge system and user achievements</p>
            </div>
            <div>
              <Button
                onClick={handleCreateBadge}
                variant="default"
                className="gap-2"
              >
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create New Badge
              </Button>
            </div>
          </div>
        </header>
        
        {/* Main content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none bg-background">
          <div className="py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {/* Stats section */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-8">
                <StatCard
                  title="Total Badges"
                  value={stats.totalBadges}
                  icon={<Tag />}
                  color="primary"
                  linkText="View all badges"
                  linkHref="/badges"
                />
                
                <StatCard
                  title="Enrolled Users"
                  value={stats.totalUsers}
                  icon={<Users />}
                  color="secondary"
                  linkText="View all users"
                  linkHref="/users"
                />
                
                <StatCard
                  title="Badges Awarded"
                  value={stats.totalAwarded}
                  icon={<CheckCircle />}
                  color="accent"
                  linkText="View all awards"
                  linkHref="/reports"
                />
              </div>
              
              {/* Recent Activity Section */}
              <h2 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-brand-purple to-brand-lilac mb-6">Recent Activity</h2>
              <div className="bg-card border-border shadow-sm overflow-hidden rounded-lg mb-8">
                <ul className="divide-y divide-border">
                  {recentActivity.length > 0 ? (
                    recentActivity.slice(0, 3).map((activity: any) => (
                      <ActivityItem
                        key={activity.id}
                        title={activity.badgeName}
                        userName={activity.userName}
                        date={activity.awardedAt}
                        status={activity.status}
                        icon={generateBadgeIcon(activity.badgeName, activity.badgeColor)}
                        iconColor={activity.badgeColor === "#4F46E5" ? "primary" : 
                                   activity.badgeColor === "#10B981" ? "secondary" : 
                                   activity.badgeColor === "#F59E0B" ? "accent" : 
                                   activity.badgeColor === "#8A63D2" ? "brand-purple" : "brand-lilac"}
                      />
                    ))
                  ) : (
                    <li className="px-6 py-6 text-center text-muted-foreground">
                      No recent activity found.
                    </li>
                  )}
                </ul>
              </div>
              
              {/* Badge Management Section */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-brand-purple to-brand-lilac">Badge Management</h2>
                <div className="relative">
                  <Select 
                    value={selectedCategoryId} 
                    onValueChange={setSelectedCategoryId}
                  >
                    <SelectTrigger className="w-[180px] bg-white/50 dark:bg-gray-800/50 border-brand-lilac/30 dark:border-brand-lilac/20">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((category: any) => (
                        <SelectItem key={category.id} value={category.id.toString()}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Badge grid */}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {badges && badges.length > 0 ? (
                  <>
                    {badges.map((badge: any) => (
                      <BadgeCard
                        key={badge.id}
                        badge={badge}
                        onEdit={handleEditBadge}
                        onAward={handleAwardBadge}
                      />
                    ))}
                    <NewBadgeCard onClick={handleCreateBadge} />
                  </>
                ) : (
                  <div className="col-span-full py-10 text-center">
                    <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-brand-purple/10 mb-4">
                      <Tag className="h-10 w-10 text-brand-purple" />
                    </div>
                    <h3 className="mt-2 text-lg font-semibold">No badges found</h3>
                    <p className="mt-1 text-sm text-muted-foreground mb-4">Get started by creating your first badge.</p>
                    <Button onClick={handleCreateBadge} variant="default" className="gap-2">
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Create New Badge
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
      
      {/* Badge Dialog */}
      {badgeDialogOpen && (
        <BadgeDialog
          open={badgeDialogOpen}
          onOpenChange={setBadgeDialogOpen}
          badge={selectedBadge || undefined}
          organizationId={organizationId}
        />
      )}
      
      {/* Award Badge Dialog */}
      {awardDialogOpen && selectedBadge && (
        <AwardBadgeDialog
          open={awardDialogOpen}
          onOpenChange={setAwardDialogOpen}
          badge={selectedBadge}
          organizationId={organizationId}
        />
      )}
    </div>
  );
}
