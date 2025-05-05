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

  const { data: stats = { totalBadges: 0, totalUsers: 0, totalAwarded: 0 } } = useQuery({
    queryKey: [`/api/organizations/${organizationId}/stats`],
  });

  const { data: categories = [] } = useQuery({
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

  const { data: recentActivity = [] } = useQuery({
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
    <div className="h-screen flex overflow-hidden bg-gray-50">
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
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-white shadow">
          <button
            type="button"
            className="lg:hidden px-4 border-r border-gray-200 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-6 w-6" />
          </button>
          
          <div className="flex-1 px-4 flex justify-between">
            <div className="flex-1 flex">
              <form className="w-full flex md:ml-0" action="#" method="GET">
                <label htmlFor="search-field" className="sr-only">Search</label>
                <div className="relative w-full text-gray-400 focus-within:text-gray-600">
                  <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none">
                    <Search className="h-5 w-5" />
                  </div>
                  <input
                    id="search-field"
                    className="block w-full h-full pl-8 pr-3 py-2 border-transparent text-gray-900 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-0 focus:border-transparent sm:text-sm"
                    placeholder="Search badges, users..."
                    type="search"
                  />
                </div>
              </form>
            </div>
            
            <div className="ml-4 flex items-center md:ml-6">
              <button
                type="button"
                className="bg-white p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                <span className="sr-only">View notifications</span>
                <Bell className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
        
        {/* Page header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Organization Dashboard</h1>
              <p className="mt-1 text-sm text-gray-500">Manage your badge system and user achievements</p>
            </div>
            <div>
              <Button
                onClick={handleCreateBadge}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-500 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create New Badge
              </Button>
            </div>
          </div>
        </header>
        
        {/* Main content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="py-6">
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
              <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h2>
              <div className="bg-white shadow overflow-hidden sm:rounded-md mb-8">
                <ul className="divide-y divide-gray-200">
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
                                   activity.badgeColor === "#F59E0B" ? "accent" : "primary"}
                      />
                    ))
                  ) : (
                    <li className="px-4 py-6 text-center text-gray-500">
                      No recent activity found.
                    </li>
                  )}
                </ul>
              </div>
              
              {/* Badge Management Section */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">Badge Management</h2>
                <div className="relative">
                  <Select 
                    value={selectedCategoryId} 
                    onValueChange={setSelectedCategoryId}
                  >
                    <SelectTrigger className="w-[180px]">
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
                {badges.map((badge: any) => (
                  <BadgeCard
                    key={badge.id}
                    badge={badge}
                    onEdit={handleEditBadge}
                    onAward={handleAwardBadge}
                  />
                ))}
                
                <NewBadgeCard onClick={handleCreateBadge} />
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
