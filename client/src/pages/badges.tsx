import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/sidebar";
import { BadgeCard, NewBadgeCard } from "@/components/ui/badge-card";
import { BadgeDialog } from "@/components/badge-dialog";
import { AwardBadgeDialog } from "@/components/award-badge-dialog";
import { Badge } from "@shared/schema";
import { Menu, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  const filteredBadges = badges.filter((badge: Badge) => {
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
        </div>
        
        {/* Page header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
            <h1 className="text-lg font-semibold text-gray-900">Badges</h1>
            <p className="mt-1 text-sm text-gray-500">Manage and award badges to users</p>
          </div>
        </header>
        
        {/* Main content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {/* Search and filter section */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 space-y-4 md:space-y-0">
                <div className="relative w-full md:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                  </div>
                  <Input
                    type="search"
                    placeholder="Search badges..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <div className="flex space-x-2">
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
                  
                  <button
                    type="button"
                    onClick={handleCreateBadge}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-500 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    Create Badge
                  </button>
                </div>
              </div>
              
              {/* Tabs for category filtering */}
              <Tabs defaultValue="all" value={currentTab} onValueChange={setCurrentTab} className="mb-6">
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="technical">Technical</TabsTrigger>
                  <TabsTrigger value="leadership">Leadership</TabsTrigger>
                  <TabsTrigger value="professional">Professional</TabsTrigger>
                  <TabsTrigger value="special">Special</TabsTrigger>
                </TabsList>
              </Tabs>
              
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
                  <p className="text-gray-500">No badges found. Try adjusting your filters or create a new badge.</p>
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
