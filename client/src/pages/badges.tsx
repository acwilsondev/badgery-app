import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/sidebar";
import { BadgeCard, NewBadgeCard } from "@/components/ui/badge-card";
import { BadgeDialog } from "@/components/badge-dialog";
import { AwardBadgeDialog } from "@/components/award-badge-dialog";
import { Badge } from "@shared/schema";
import { Menu, Search, Plus, LayoutGrid, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { generateBadgeIcon } from "@/lib/badge-icons";

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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

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

  // Enhanced handler functions with better state management
  const handleEditBadge = (badge: Badge) => {
    console.log("Edit badge:", badge.id);
    // Set the badge first, then open the dialog
    setSelectedBadge(badge);
    // Make sure to close other dialogs
    setAwardDialogOpen(false);
    // Open the edit dialog
    setTimeout(() => {
      setBadgeDialogOpen(true);
    }, 50);
  };

  const handleAwardBadge = (badge: Badge) => {
    console.log("Award badge:", badge.id);
    // Set the badge first, then open the dialog
    setSelectedBadge(badge);
    // Make sure to close other dialogs
    setBadgeDialogOpen(false);
    // Open the award dialog
    setTimeout(() => {
      setAwardDialogOpen(true);
    }, 50);
  };

  const handleViewBadge = (badge: Badge) => {
    // This would show a badge details view in a real app
    console.log("View badge:", badge);
    // Simple view functionality - could be enhanced later
    // For now we're just logging the badge details
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
              
              {/* Category filtering and view toggle */}
              <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                {/* Category tabs */}
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
                
                {/* View toggle */}
                <div className="inline-flex rounded-md overflow-hidden bg-muted/30 border border-border p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`px-3 py-2 text-sm font-medium rounded-md flex items-center ${
                      viewMode === 'grid'
                        ? "bg-brand-purple/10 text-brand-purple" 
                        : "text-foreground/70 hover:text-foreground hover:bg-background/60"
                    }`}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4 mr-1" />
                    Grid
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-2 text-sm font-medium rounded-md flex items-center ${
                      viewMode === 'list'
                        ? "bg-brand-purple/10 text-brand-purple" 
                        : "text-foreground/70 hover:text-foreground hover:bg-background/60"
                    }`}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4 mr-1" />
                    List
                  </button>
                </div>
              </div>
              
              {/* Badge Display - Conditionally render grid or list view */}
              {filteredBadges.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-muted-foreground">No badges found. Try adjusting your filters or create a new badge.</p>
                </div>
              ) : viewMode === 'grid' ? (
                // Grid View
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
                  
                  {/* Only show "Add New Badge" card for admin users */}
                  {user.role === 'admin' && (
                    <NewBadgeCard onClick={handleCreateBadge} />
                  )}
                </div>
              ) : (
                // List View
                <div className="bg-card rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-12 bg-muted/50 p-4 font-medium text-sm border-b border-border">
                    <div className="col-span-6 sm:col-span-3">Badge</div>
                    <div className="hidden sm:block sm:col-span-3">Category</div>
                    <div className="col-span-4 sm:col-span-3">Description</div>
                    <div className="col-span-2 sm:col-span-3 text-right">Actions</div>
                  </div>
                  {filteredBadges.map((badge: Badge) => (
                    <div 
                      key={badge.id} 
                      className="grid grid-cols-12 p-4 items-center border-b border-border hover:bg-muted/10 transition-colors"
                    >
                      <div className="col-span-6 sm:col-span-3 flex items-center gap-3">
                        <Avatar className="h-10 w-10 rounded-md">
                          <AvatarFallback 
                            style={{ backgroundColor: badge.color || '#6941C6' }}
                            className="text-white rounded-md"
                          >
                            {generateBadgeIcon(badge.name, badge.color || '#6941C6')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{badge.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {badge.categoryId ? categories.find(c => c.id === badge.categoryId)?.name || 'Uncategorized' : 'Uncategorized'}
                          </div>
                        </div>
                      </div>
                      <div className="hidden sm:block sm:col-span-3 text-sm text-muted-foreground">
                        {badge.categoryId ? categories.find(c => c.id === badge.categoryId)?.name || 'Uncategorized' : 'Uncategorized'}
                      </div>
                      <div className="col-span-4 sm:col-span-3 text-sm text-muted-foreground truncate max-w-[250px]">
                        {badge.description}
                      </div>
                      <div className="col-span-2 sm:col-span-3 flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleViewBadge(badge)}
                          className="h-8 w-8 p-0"
                          title="View badge details"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-eye">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </Button>
                        {user.role === 'admin' && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleEditBadge(badge)}
                              className="h-8 w-8 p-0"
                              title="Edit badge"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                <path d="m15 5 4 4" />
                              </svg>
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleAwardBadge(badge)}
                              className="h-8 w-8 p-0"
                              title="Award badge"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-award">
                                <circle cx="12" cy="8" r="6" />
                                <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                              </svg>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* Add new badge option in list view */}
                  {user.role === 'admin' && (
                    <button
                      onClick={handleCreateBadge}
                      className="w-full p-4 text-left hover:bg-muted/10 transition-colors flex items-center gap-3 text-brand-purple"
                    >
                      <div className="h-10 w-10 rounded-md bg-brand-purple/10 flex items-center justify-center">
                        <Plus className="h-5 w-5" />
                      </div>
                      <span className="font-medium">Create New Badge</span>
                    </button>
                  )}
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
