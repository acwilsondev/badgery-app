import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { Sidebar } from '@/components/sidebar';
import { BadgeProgressDialog } from '@/components/badge-progress-dialog';
import { generateBadgeIcon } from '@/lib/badge-icons';
import { formatDate } from '@/lib/utils';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { LucideEdit, Award, ArrowRight } from 'lucide-react';

interface ProgressProps {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    organizationId?: number;
  };
  onLogout: () => void;
}

export default function ProgressTracker({ user, onLogout }: ProgressProps) {
  const { toast } = useToast();
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('my-progress');
  
  // Define types for progress data
  type ProgressItem = {
    id: number;
    badgeId: number;
    userId: number;
    progress: number;
    status: string;
    lastUpdated: string;
    notes?: string;
    progressData?: any;
    badgeName: string;
    badgeDescription: string;
    badgeColor: string;
    badgeImageUrl: string | null;
    criteriaSections?: any;
  };

  // Fetch user progress
  const { data: userProgress, isLoading: loadingUserProgress } = useQuery<ProgressItem[]>({
    queryKey: [`/api/users/${user.id}/progress`],
    enabled: !!user.id,
  });

  // Fetch organization progress (for admins/managers)
  const { data: orgProgress, isLoading: loadingOrgProgress } = useQuery<ProgressItem[]>({
    queryKey: [`/api/organizations/${user.organizationId}/progress`],
    enabled: !!user.organizationId && (user.role === 'admin' || user.role === 'manager'),
  });

  // Fetch all badges
  const { data: badges } = useQuery<Badge[]>({
    queryKey: [`/api/organizations/${user.organizationId}/badges`],
    enabled: !!user.organizationId,
  });

  // Get badges that need progress tracking but don't have progress records
  const badgesWithoutProgress = React.useMemo(() => {
    if (!badges || !userProgress) return [];
    
    return badges.filter((badge: Badge) => {
      return badge.requiresProgress && !userProgress.some(
        (progress: any) => progress.badgeId === badge.id
      );
    });
  }, [badges, userProgress]);

  // Handle starting progress tracking for a badge
  const handleStartProgress = (badge: Badge) => {
    setSelectedBadge(badge);
    setSelectedUserId(user.id);
    setProgressDialogOpen(true);
  };

  // Handle updating progress for a badge
  const handleUpdateProgress = (badge: Badge, userId: number, existingProgress: any) => {
    setSelectedBadge(badge);
    setSelectedUserId(userId);
    setProgressDialogOpen(true);
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar user={user} onLogout={onLogout} />
      
      <div className="flex-1 overflow-auto p-6">
        <h1 className="text-3xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-brand-purple to-brand-lilac">Progress Tracking</h1>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4 bg-accent/10 dark:bg-accent/5">
            <TabsTrigger value="my-progress" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-primary">My Progress</TabsTrigger>
            {(user.role === 'admin' || user.role === 'manager') && (
              <TabsTrigger value="organization-progress" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-primary">Organization Progress</TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="my-progress" className="space-y-6">
            {/* In Progress Badges */}
            <Card bordered>
              <CardHeader>
                <CardTitle gradient>In Progress Badges</CardTitle>
                <CardDescription>Badges you are currently working towards</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingUserProgress ? (
                  <div className="flex justify-center py-6 text-muted-foreground">Loading progress data...</div>
                ) : userProgress && userProgress.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {userProgress.filter((item: any) => item.status === 'in_progress').map((item: any) => (
                      <Card key={item.id} bordered className="overflow-hidden">
                        <CardHeader className="pb-2 pt-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div 
                                className="w-8 h-8 flex items-center justify-center rounded-full"
                                style={{ 
                                  backgroundColor: `${item.badgeColor}20`,
                                  color: item.badgeColor || "#5E2B97" 
                                }}
                              >
                                {generateBadgeIcon(item.badgeName, item.badgeColor)}
                              </div>
                              <CardTitle className="text-lg">{item.badgeName}</CardTitle>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleUpdateProgress(
                                {
                                  id: item.badgeId,
                                  name: item.badgeName,
                                  description: item.badgeDescription,
                                  color: item.badgeColor,
                                  imageUrl: item.badgeImageUrl,
                                  requiresProgress: true,
                                  criteriaSections: item.criteriaSections,
                                  organizationId: user.organizationId || 0,
                                } as Badge, 
                                user.id,
                                item
                              )}
                            >
                              <LucideEdit className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>Progress</span>
                              <span>{Number(item.progress).toFixed(0)}%</span>
                            </div>
                            <Progress value={Number(item.progress)} gradient className="h-2" />
                            <div className="text-xs text-muted-foreground">
                              Last updated: {formatDate(item.lastUpdated)}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    You don't have any badges in progress
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Ready to Start Badges */}
            {badgesWithoutProgress.length > 0 && (
              <Card bordered>
                <CardHeader>
                  <CardTitle gradient>Ready to Start</CardTitle>
                  <CardDescription>Badges you can work towards</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {badgesWithoutProgress.map((badge: Badge) => (
                      <Card key={badge.id} bordered className="overflow-hidden">
                        <CardHeader className="pb-2 pt-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div 
                                className="w-8 h-8 flex items-center justify-center rounded-full"
                                style={{ 
                                  backgroundColor: `${badge.color}20` || 'rgba(94, 43, 151, 0.1)',
                                  color: badge.color || "#5E2B97" 
                                }}
                              >
                                {generateBadgeIcon(badge.name, badge.color || '#5E2B97')}
                              </div>
                              <CardTitle className="text-lg">{badge.name}</CardTitle>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{badge.description}</p>
                          <Button 
                            variant="outline" 
                            className="w-full"
                            onClick={() => handleStartProgress(badge)}
                          >
                            Start Progress
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Completed Badges */}
            <Card bordered>
              <CardHeader>
                <CardTitle gradient>Completed Badges</CardTitle>
                <CardDescription>Badges you have earned</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingUserProgress ? (
                  <div className="flex justify-center py-6 text-muted-foreground">Loading completed badges...</div>
                ) : userProgress && userProgress.filter((item: any) => item.status === 'completed').length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {userProgress.filter((item: any) => item.status === 'completed').map((item: any) => (
                      <Card key={item.id} className="overflow-hidden border-brand-orange/30 dark:border-brand-orange/20">
                        <CardHeader className="pb-2 pt-4 bg-brand-orange/10 dark:bg-brand-orange/5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div 
                                className="w-8 h-8 flex items-center justify-center rounded-full"
                                style={{ 
                                  backgroundColor: `${item.badgeColor}20`,
                                  color: item.badgeColor || "#5E2B97" 
                                }}
                              >
                                {generateBadgeIcon(item.badgeName, item.badgeColor)}
                              </div>
                              <CardTitle className="text-lg">{item.badgeName}</CardTitle>
                            </div>
                            <Award className="h-5 w-5 text-brand-orange" />
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>Completed</span>
                              <span>100%</span>
                            </div>
                            <Progress value={100} gradient color="accent" className="h-2" />
                            <div className="text-xs text-muted-foreground">
                              Completed on: {formatDate(item.lastUpdated)}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    You haven't completed any badges yet
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Organization Progress (Admin/Manager View) */}
          {(user.role === 'admin' || user.role === 'manager') && (
            <TabsContent value="organization-progress">
              <Card bordered>
                <CardHeader>
                  <CardTitle gradient>Organization Progress</CardTitle>
                  <CardDescription>Track progress of all users in your organization</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingOrgProgress ? (
                    <div className="flex justify-center py-6 text-muted-foreground">Loading organization progress...</div>
                  ) : orgProgress && orgProgress.length > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Badge</TableHead>
                            <TableHead>Progress</TableHead>
                            <TableHead>Last Updated</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orgProgress.map((item: any) => (
                            <TableRow key={item.id}>
                              <TableCell>{item.userName}</TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <div 
                                    className="w-6 h-6 flex items-center justify-center rounded-full"
                                    style={{ 
                                      backgroundColor: `${item.badgeColor}20` || 'rgba(94, 43, 151, 0.1)',
                                      color: item.badgeColor || "#5E2B97"
                                    }}
                                  >
                                    {generateBadgeIcon(item.badgeName, item.badgeColor || '#5E2B97')}
                                  </div>
                                  <span>{item.badgeName}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="w-24">
                                  <Progress value={Number(item.progress)} gradient className="h-2" />
                                </div>
                                <div className="text-xs mt-1 text-muted-foreground">{Number(item.progress).toFixed(0)}%</div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">{formatDate(item.lastUpdated)}</div>
                                <div className="text-xs text-muted-foreground">by {item.updatedByName}</div>
                              </TableCell>
                              <TableCell>
                                <div className={`rounded-full px-2 py-1 text-xs font-medium inline-block
                                  ${item.status === 'completed' 
                                    ? 'bg-brand-orange/10 text-brand-orange dark:bg-brand-orange/20 dark:text-brand-orange' 
                                    : 'bg-brand-purple/10 text-brand-purple dark:bg-brand-purple/20 dark:text-brand-purple'}`}>
                                  {item.status === 'completed' ? 'Completed' : 'In Progress'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    // Find the full badge from badges array
                                    const badge = badges?.find((b: Badge) => b.id === item.badgeId);
                                    if (badge) {
                                      handleUpdateProgress(badge, item.userId, item);
                                    } else {
                                      toast({
                                        title: "Error",
                                        description: "Could not find badge details",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                >
                                  <LucideEdit className="h-4 w-4 mr-1" />
                                  Update
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      No badge progress data found for your organization
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
      
      {progressDialogOpen && selectedBadge && selectedUserId && (
        <BadgeProgressDialog
          open={progressDialogOpen}
          onOpenChange={setProgressDialogOpen}
          badge={selectedBadge}
          userId={selectedUserId}
          organizationId={user.organizationId || 0}
          existingProgress={
            userProgress?.find((p: any) => 
              p.badgeId === selectedBadge.id && p.userId === selectedUserId
            )
          }
        />
      )}
    </div>
  );
}