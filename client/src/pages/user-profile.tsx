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
  const [selectedBadge, setSelectedBadge] = useState<any>(null);

  const { data: profileUser, isLoading: isLoadingUser } = useQuery({
    queryKey: [`/api/users/${id}`],
  });

  const { data: awardedBadges = [], isLoading: isLoadingBadges } = useQuery({
    queryKey: [`/api/users/${id}/awarded-badges`],
  });

  const { data: availableBadges = [] } = useQuery({
    queryKey: [`/api/organizations/${organizationId}/badges`],
  });

  const handleAwardBadge = (badge: any) => {
    setSelectedBadge(badge);
    setAwardDialogOpen(true);
  };

  if (isLoadingUser) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-500 dark:border-primary-400 mx-auto"></div>
          <p className="mt-3 text-gray-600 dark:text-gray-400">Loading user profile...</p>
        </div>
      </div>
    );
  }

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
              <div className="mb-4">
                <Link to="/users">
                  <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Users
                  </Button>
                </Link>
              </div>
              
              {/* User profile header */}
              <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/20 overflow-hidden sm:rounded-lg mb-6">
                <div className="px-4 py-5 sm:px-6 flex items-center justify-between">
                  <div className="flex items-center">
                    <Avatar className="h-16 w-16">
                      <AvatarFallback className="text-xl bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-300">
                        {profileUser && getInitials(profileUser.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="ml-4">
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {profileUser?.name}
                      </h1>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{profileUser?.email}</p>
                      <div className="mt-1">
                        <Badge variant="outline" className="capitalize text-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-600">
                          {profileUser?.role}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    className="bg-primary-500 hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-700"
                    onClick={() => {
                      if (availableBadges.length > 0) {
                        handleAwardBadge(availableBadges[0]);
                      }
                    }}
                  >
                    <Award className="mr-2 h-4 w-4" />
                    Award Badge
                  </Button>
                </div>
              </div>
              
              {/* Tabs for different sections */}
              <Tabs defaultValue="badges" className="mb-6">
                <TabsList className="bg-gray-100 dark:bg-gray-800">
                  <TabsTrigger value="badges" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-primary-600 dark:data-[state=active]:text-primary-400">
                    <Award className="h-4 w-4 mr-2" />
                    Badges
                  </TabsTrigger>
                  <TabsTrigger value="activity" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-primary-600 dark:data-[state=active]:text-primary-400">
                    <Calendar className="h-4 w-4 mr-2" />
                    Activity
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="badges" className="mt-6">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Earned Badges</h2>
                  
                  {isLoadingBadges ? (
                    <div className="text-center py-10">
                      <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500 dark:border-primary-400 mx-auto"></div>
                      <p className="mt-2 text-gray-600 dark:text-gray-400">Loading badges...</p>
                    </div>
                  ) : awardedBadges.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {awardedBadges.map((award: any) => (
                        <Card key={award.id} className="overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                          <CardContent className="p-0">
                            <div className="px-4 py-5 sm:p-6 flex flex-col items-center text-center">
                              <div 
                                className="badge-circle w-20 h-20 mb-4 flex items-center justify-center badge-earned"
                                style={{ 
                                  backgroundColor: `${award.badgeColor}10`,
                                  color: award.badgeColor || "#4F46E5" 
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
                              
                              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">{award.badgeName}</h3>
                              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{award.badgeDescription}</p>
                              
                              <div className="mt-auto pt-2 border-t border-gray-100 dark:border-gray-700 w-full">
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  Awarded on {formatDate(award.awardedAt)}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  By {award.awardedByName}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-700/20 text-center">
                      <div className="mb-4">
                        <div className="badge-circle w-20 h-20 mx-auto bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          <Award className="h-10 w-10 text-gray-400 dark:text-gray-500" />
                        </div>
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">No badges yet</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        This user hasn't earned any badges yet.
                      </p>
                      <Button
                        className="mt-4 bg-primary-500 hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-700"
                        onClick={() => {
                          if (availableBadges.length > 0) {
                            handleAwardBadge(availableBadges[0]);
                          }
                        }}
                      >
                        Award First Badge
                      </Button>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="activity" className="mt-6">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent Activity</h2>
                  
                  {isLoadingBadges ? (
                    <div className="text-center py-10">
                      <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500 dark:border-primary-400 mx-auto"></div>
                      <p className="mt-2 text-gray-600 dark:text-gray-400">Loading activity...</p>
                    </div>
                  ) : awardedBadges.length > 0 ? (
                    <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/20 overflow-hidden sm:rounded-lg">
                      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {awardedBadges.map((award: any) => (
                          <li key={award.id}>
                            <div className="px-4 py-4 sm:px-6">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0">
                                    <div 
                                      className="badge-circle w-10 h-10 flex items-center justify-center"
                                      style={{ 
                                        backgroundColor: `${award.badgeColor}10`,
                                        color: award.badgeColor || "#4F46E5" 
                                      }}
                                    >
                                      {generateBadgeIcon(award.badgeName, award.badgeColor || "#4F46E5")}
                                    </div>
                                  </div>
                                  <div className="ml-4">
                                    <div className="text-sm font-medium text-primary-600 dark:text-primary-400">{award.badgeName}</div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                      Awarded by <span className="font-medium text-gray-900 dark:text-gray-300">{award.awardedByName}</span> on <time>{formatDate(award.awardedAt)}</time>
                                    </div>
                                  </div>
                                </div>
                                <div className="ml-2 flex-shrink-0 flex">
                                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
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
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-700/20 text-center">
                      <p className="text-gray-500 dark:text-gray-400">No recent activity</p>
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
