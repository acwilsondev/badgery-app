import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/sidebar";
import { BadgeCard, NewBadgeCard } from "@/components/ui/badge-card";
import { BadgeDialog } from "@/components/badge-dialog";
import { AwardBadgeDialog } from "@/components/award-badge-dialog";
import { Badge } from "@shared/schema";
import { Menu, Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

interface BadgesProps {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    organizationId?: number;
  };
  onLogout: () => void;
}

export default function Badges({ user, onLogout }: BadgesProps) {
  const organizationId = user.organizationId || 1;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [badgeDialogOpen, setBadgeDialogOpen] = useState(false);
  const [awardDialogOpen, setAwardDialogOpen] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [currentTab, setCurrentTab] = useState("all");

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

  // Enhance badges with category information
  const badgesWithCategories = Array.isArray(badges) ? badges.map((badge: Badge) => {
    // Find the category that matches this badge's categoryId
    const category = Array.isArray(categories) 
      ? categories.find((cat: any) => cat.id === badge.categoryId) 
      : null;
      
    // Return badge with added category property
    return {
      ...badge,
      category: category ? { 
        id: category.id, 
        name: category.name 
      } : null
    };
  }) : [];
  
  const filteredBadges = badgesWithCategories.filter((badge: any) => {
    const matchesSearch = searchQuery
      ? badge.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        badge.description.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    
    const matchesTab = currentTab === "all" || 
      (currentTab === "technical" && badge.category?.name === "Technical") ||
      (currentTab === "leadership" && badge.category?.name === "Leadership") ||
      (currentTab === "professional" && badge.category?.name === "Professional") ||
      (currentTab === "special" && badge.category?.name === "Special Achievement");
    
    return matchesSearch && matchesTab;
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

  const handleViewBadge = (badge: Badge) => {
    // This would show a badge details view in a real app
    console.log("View badge:", badge);
  };

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50 dark:bg-gray-900">
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
        {/* Mobile menu button - only visible on mobile */}
        <button
          type="button"
          className="lg:hidden absolute left-0 top-0 z-50 px-4 h-16 border-r border-border text-brand-purple hover:text-brand-purple/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-purple/50 transition-colors"
          onClick={() => setMobileMenuOpen(true)}
        >
          <span className="sr-only">Open sidebar</span>
          <Menu className="h-6 w-6" />
        </button>
        
        {/* Standardized Page Header */}
        <PageHeader
          title="Badges"
          description="Manage and award badges to users"
          showSearch={true}
          searchPlaceholder="Search badges..."
          onSearchChange={setSearchQuery}
          actionButton={{
            label: "Create Badge",
            onClick: handleCreateBadge,
            icon: <Plus className="h-4 w-4 mr-1" />
          }}
        />
        
        {/* Main content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none bg-background">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {/* Remove filter dropdown as requested */}
              
              {/* Tabs for category filtering */}
              <div className="mb-6">
                <div className="inline-flex rounded-md overflow-hidden bg-muted/30 border border-border p-1">
                  <button
                    onClick={() => setCurrentTab("all")}
                    className={`px-4 py-2 text-sm font-medium rounded-md ${
                      currentTab === "all" 
                        ? "bg-brand-purple/10 text-brand-purple" 
                        : "text-foreground/70 hover:text-foreground hover:bg-background/60"
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setCurrentTab("technical")}
                    className={`px-4 py-2 text-sm font-medium rounded-md ${
                      currentTab === "technical" 
                        ? "bg-brand-purple/10 text-brand-purple" 
                        : "text-foreground/70 hover:text-foreground hover:bg-background/60"
                    }`}
                  >
                    Technical
                  </button>
                  <button
                    onClick={() => setCurrentTab("leadership")}
                    className={`px-4 py-2 text-sm font-medium rounded-md ${
                      currentTab === "leadership" 
                        ? "bg-brand-purple/10 text-brand-purple" 
                        : "text-foreground/70 hover:text-foreground hover:bg-background/60"
                    }`}
                  >
                    Leadership
                  </button>
                  <button
                    onClick={() => setCurrentTab("professional")}
                    className={`px-4 py-2 text-sm font-medium rounded-md ${
                      currentTab === "professional" 
                        ? "bg-brand-purple/10 text-brand-purple" 
                        : "text-foreground/70 hover:text-foreground hover:bg-background/60"
                    }`}
                  >
                    Professional
                  </button>
                  <button
                    onClick={() => setCurrentTab("special")}
                    className={`px-4 py-2 text-sm font-medium rounded-md ${
                      currentTab === "special" 
                        ? "bg-brand-purple/10 text-brand-purple" 
                        : "text-foreground/70 hover:text-foreground hover:bg-background/60"
                    }`}
                  >
                    Special
                  </button>
                </div>
              </div>
              
              {/* Badge Grid */}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredBadges.map((badge: Badge) => (
                  <BadgeCard
                    key={badge.id}
                    badge={badge}
                    onEdit={handleEditBadge}
                    onAward={handleAwardBadge}
                    onClick={handleViewBadge}
                  />
                ))}
                
                <NewBadgeCard onClick={handleCreateBadge} />
              </div>
              
              {filteredBadges.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-muted-foreground">No badges found. Try adjusting your filters or create a new badge.</p>
                </div>
              )}
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
