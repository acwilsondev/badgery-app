import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/sidebar";
import { Menu, Award, Calendar, ArrowLeft } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { getInitials, formatDate } from "@/lib/utils";
import { generateBadgeIcon } from "@/lib/badge-icons";
import { Link } from "wouter";
import { AwardBadgeDialog } from "@/components/award-badge-dialog";

interface UserProfileProps {
  id: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    organizationId?: number;
  };
  onLogout: () => void;
}

export default function UserProfile({ id, user, onLogout }: UserProfileProps) {
  const organizationId = user.organizationId || 1;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [awardDialogOpen, setAwardDialogOpen] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);

  // Define types for the API responses
  interface ProfileUser {
    id: number;
    name: string;
    email: string;
    role: string;
    organizationId?: number;
    username: string;
  }

  interface Badge {
    id: number;
    name: string;
    description: string;
    imageUrl: string | null;
    color: string;
    categoryId?: number;
    organizationId: number;
    createdAt: string;
    criteriaSections?: any;
  }

  interface AwardedBadge {
    id: number;
    badgeId: number;
    userId: number;
    awardedBy: number;
    awardedAt: string;
    status: string;
    badgeColor: string;
    badgeName: string;
    badgeDescription: string;
    badgeImageUrl: string | null;
    awardedByName: string;
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
  }

  const { data: profileUser, isLoading: isLoadingUser } = useQuery<ProfileUser>({
    queryKey: [`/api/users/${id}`],
  });

  const { data: awardedBadges = [], isLoading: isLoadingBadges } = useQuery<AwardedBadge[]>({
    queryKey: [`/api/users/${id}/awarded-badges`],
  });

  const { data: availableBadges = [] } = useQuery<Badge[]>({
    queryKey: [`/api/organizations/${organizationId}/badges`],
  });

  const handleAwardBadge = (badge: Badge) => {
    setSelectedBadge(badge);
    setAwardDialogOpen(true);
  };

  if (isLoadingUser) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-purple/20 border-t-brand-purple mx-auto"></div>
          <p className="mt-3 text-muted-foreground">Loading user profile...</p>
        </div>
      </div>
    );
  }
  
  // Ensure we have the profile data before rendering
  if (!profileUser) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">User not found</p>
        </div>
      </div>
    );
  }

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
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/20">
          <button
            type="button"
            className="lg:hidden px-4 border-r border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 dark:focus:ring-primary-400"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-6 w-6" />
          </button>
        </div>
        
        {/* Content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none dark:bg-gray-900">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {/* Back button */}
              <div className="mb-6">
                <Link to="/users">
                  <Button variant="outline" size="sm" className="text-brand-purple hover:text-brand-lilac hover:bg-accent/10 transition-colors gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Users
                  </Button>
                </Link>
              </div>
              
              {/* User profile header */}
              <div className="bg-card border-border shadow-sm overflow-hidden rounded-lg mb-8">
                <div className="px-6 py-6 sm:px-8 flex items-center justify-between">
                  <div className="flex items-center">
                    <Avatar className="h-20 w-20 border-2 border-brand-purple/20">
                      <AvatarFallback className="text-2xl font-bold bg-brand-purple/10 text-brand-purple">
                        {profileUser && getInitials(profileUser.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="ml-6">
                      <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-purple to-brand-lilac">
                        {profileUser?.name}
                      </h1>
                      <p className="text-sm text-muted-foreground mt-1">{profileUser?.email}</p>
                      <div className="mt-2">
                        <Badge variant="secondary" className="capitalize text-brand-purple bg-brand-purple/10 hover:bg-brand-purple/20">
                          {profileUser?.role}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="default"
                    className="gap-2 bg-brand-purple hover:bg-brand-purple/90 text-white"
                    onClick={() => {
                      const badgeList = Array.isArray(availableBadges) ? availableBadges : [];
                      if (badgeList.length > 0) {
                        handleAwardBadge(badgeList[0]);
                      }
                    }}
                  >
                    <Award className="h-4 w-4" />
                    Award Badge
                  </Button>
                </div>
              </div>
              
              {/* Tabs for different sections */}
              <Tabs defaultValue="badges" className="mb-6">
                <TabsList className="bg-accent/10 p-1">
                  <TabsTrigger 
                    value="badges" 
                    className="data-[state=active]:bg-background data-[state=active]:text-brand-purple data-[state=active]:shadow-sm gap-2"
                  >
                    <Award className="h-4 w-4" />
                    Badges
                  </TabsTrigger>
                  <TabsTrigger 
                    value="activity" 
                    className="data-[state=active]:bg-background data-[state=active]:text-brand-purple data-[state=active]:shadow-sm gap-2"
                  >
                    <Calendar className="h-4 w-4" />
                    Activity
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="badges" className="mt-6">
                  <h2 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-brand-purple to-brand-lilac mb-6">Earned Badges</h2>
                  
                  {isLoadingBadges ? (
                    <div className="text-center py-10">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-purple mx-auto"></div>
                      <p className="mt-2 text-muted-foreground">Loading badges...</p>
                    </div>
                  ) : Array.isArray(awardedBadges) && awardedBadges.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {awardedBadges.map((award) => (
                        <Card key={award.id} bordered className="overflow-hidden shadow-sm hover:shadow transition-all duration-200">
                          <CardContent className="p-0">
                            <div className="px-4 py-5 sm:p-6 flex flex-col items-center text-center">
                              <div 
                                className="badge-circle w-20 h-20 mb-4 flex items-center justify-center badge-earned rounded-lg"
                                style={{ 
                                  backgroundColor: award.badgeColor === "#8A63D2" || award.badgeColor === "#4F46E5" 
                                    ? "rgba(138, 99, 210, 0.1)" 
                                    : `${award.badgeColor}15`,
                                  color: award.badgeColor === "#4F46E5" ? "#8A63D2" : (award.badgeColor || "#8A63D2")
                                }}
                              >
                                {award.badgeImageUrl ? (
                                  <img 
                                    src={award.badgeImageUrl} 
                                    alt={award.badgeName}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  generateBadgeIcon(award.badgeName, award.badgeColor || "#4F46E5")
                                )}
                              </div>
                              
                              <h3 className="text-lg font-semibold mb-1">{award.badgeName}</h3>
                              <p className="text-sm text-muted-foreground mb-4">{award.badgeDescription}</p>
                              
                              <div className="mt-auto pt-3 border-t border-border w-full flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Award className="h-3.5 w-3.5 text-brand-orange" />
                                  Awarded on {formatDate(award.awardedAt)}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  By {award.awardedByName}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-card border-border p-8 rounded-lg shadow-sm text-center">
                      <div className="mb-6">
                        <div className="badge-circle w-20 h-20 mx-auto bg-brand-purple/10 flex items-center justify-center rounded-full">
                          <Award className="h-10 w-10 text-brand-purple" />
                        </div>
                      </div>
                      <h3 className="text-xl font-semibold">No badges yet</h3>
                      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                        This user hasn't earned any badges yet. Award them their first achievement!
                      </p>
                      <Button
                        variant="default"
                        className="mt-6 gap-2"
                        onClick={() => {
                          if (availableBadges && availableBadges.length > 0) {
                            handleAwardBadge(availableBadges[0]);
                          }
                        }}
                      >
                        <Award className="h-4 w-4" />
                        Award First Badge
                      </Button>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="activity" className="mt-6">
                  <h2 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-brand-purple to-brand-lilac mb-6">Recent Activity</h2>
                  
                  {isLoadingBadges ? (
                    <div className="text-center py-10">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-purple mx-auto"></div>
                      <p className="mt-2 text-muted-foreground">Loading activity...</p>
                    </div>
                  ) : Array.isArray(awardedBadges) && awardedBadges.length > 0 ? (
                    <div className="bg-card border-border shadow-sm overflow-hidden rounded-lg">
                      <ul className="divide-y divide-border">
                        {awardedBadges.map((award) => (
                          <li key={award.id}>
                            <div className="px-6 py-4 sm:px-6">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0">
                                    <div 
                                      className="badge-circle w-10 h-10 flex items-center justify-center rounded-lg"
                                      style={{ 
                                        backgroundColor: award.badgeColor === "#8A63D2" || award.badgeColor === "#4F46E5" 
                                          ? "rgba(138, 99, 210, 0.1)" 
                                          : `${award.badgeColor}15`,
                                        color: award.badgeColor === "#4F46E5" ? "#8A63D2" : (award.badgeColor || "#8A63D2")
                                      }}
                                    >
                                      {generateBadgeIcon(award.badgeName, award.badgeColor === "#4F46E5" ? "#8A63D2" : (award.badgeColor || "#8A63D2"))}
                                    </div>
                                  </div>
                                  <div className="ml-4">
                                    <div className="text-sm font-semibold text-foreground">{award.badgeName}</div>
                                    <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                      <Award className="h-3.5 w-3.5 text-brand-orange" />
                                      <span>Awarded by <span className="font-medium">{award.awardedByName}</span> on <time>{formatDate(award.awardedAt)}</time></span>
                                    </div>
                                  </div>
                                </div>
                                <div className="ml-2 flex-shrink-0 flex">
                                  <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-md bg-brand-orange/10 text-brand-orange">
                                    {award.status.charAt(0).toUpperCase() + award.status.slice(1)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="bg-card border-border p-8 rounded-lg shadow-sm text-center">
                      <div className="mb-4">
                        <div className="h-16 w-16 mx-auto bg-brand-purple/10 rounded-full flex items-center justify-center">
                          <Calendar className="h-8 w-8 text-brand-purple" />
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold">No activity yet</h3>
                      <p className="text-sm text-muted-foreground mt-2">This user doesn't have any recent activity.</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </main>
      </div>
      
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
