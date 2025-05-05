import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Badge } from '@shared/schema';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { generateBadgeIcon } from '@/lib/badge-icons';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';

interface BadgeProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge: Badge;
  userId: number;
  organizationId: number;
  existingProgress?: {
    id: number;
    progress: number;
    progressData?: any;
    notes?: string;
    status: string;
  };
}

const progressFormSchema = z.object({
  progress: z.number().min(0).max(100),
  notes: z.string().optional(),
  progressData: z.any().optional(),
  completedItems: z.array(z.string()).optional(),
});

type ProgressFormValues = z.infer<typeof progressFormSchema>;

export function BadgeProgressDialog({ 
  open, 
  onOpenChange, 
  badge, 
  userId,
  organizationId,
  existingProgress 
}: BadgeProgressDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Parse criteria sections from badge if available
  const criteriaSections = badge.criteriaSections 
    ? (typeof badge.criteriaSections === 'string' 
        ? JSON.parse(badge.criteriaSections as string) 
        : badge.criteriaSections)
    : [];
  
  // Get all criteria items for checkboxes
  const allCriteriaItems = React.useMemo(() => {
    const items: string[] = [];
    if (Array.isArray(criteriaSections)) {
      criteriaSections.forEach((section: any) => {
        if (section.items && Array.isArray(section.items)) {
          section.items.forEach((item: any) => {
            if (item.id) items.push(item.id);
          });
        }
      });
    }
    return items;
  }, [criteriaSections]);

  // Parse existing progress data if available
  const existingCompletedItems = React.useMemo(() => {
    if (existingProgress?.progressData) {
      const data = typeof existingProgress.progressData === 'string'
        ? JSON.parse(existingProgress.progressData)
        : existingProgress.progressData;
      
      return data.completedItems || [];
    }
    return [];
  }, [existingProgress]);

  // Setup form with default values from existing progress
  const form = useForm<ProgressFormValues>({
    resolver: zodResolver(progressFormSchema),
    defaultValues: {
      progress: existingProgress?.progress || 0,
      notes: existingProgress?.notes || '',
      completedItems: existingCompletedItems,
    },
  });

  // Calculate progress % based on completed items
  const calculateProgress = (completedItems: string[]) => {
    if (allCriteriaItems.length === 0) return 0;
    return Math.round((completedItems.length / allCriteriaItems.length) * 100);
  };

  // Update progress when checkboxes change
  const onCompletedItemsChange = (completedItems: string[]) => {
    const newProgress = calculateProgress(completedItems);
    form.setValue('progress', newProgress);
  };

  // Setup mutation for saving progress
  const updateProgressMutation = useMutation({
    mutationFn: async (data: ProgressFormValues) => {
      const progressData = {
        completedItems: data.completedItems,
      };
      
      return apiRequest('POST', `/api/badges/${badge.id}/progress/${userId}`, {
        progress: data.progress,
        progressData,
        notes: data.notes,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Progress updated',
        description: 'Badge progress has been updated successfully',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/progress`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/progress`] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error updating progress',
        description: error.message || 'Could not update badge progress',
        variant: 'destructive',
      });
    },
  });

  // Form submission handler
  function onSubmit(data: ProgressFormValues) {
    // Update progressData field with completed items
    data.progressData = {
      completedItems: data.completedItems,
    };
    updateProgressMutation.mutate(data);
  }

  const badgeIcon = generateBadgeIcon(badge.name, badge.color || '#4F46E5');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            {badgeIcon && <div className="w-10 h-10">{badgeIcon}</div>}
            <DialogTitle>{badge.name} Progress</DialogTitle>
          </div>
          <DialogDescription>
            Update progress for this badge
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Progress Slider */}
            <FormField
              control={form.control}
              name="progress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Progress</FormLabel>
                  <FormControl>
                    <div className="space-y-2">
                      <Slider
                        value={[field.value]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(vals) => field.onChange(vals[0])}
                        disabled={criteriaSections.length > 0}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0%</span>
                        <span>{field.value}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </FormControl>
                  <FormDescription>
                    {criteriaSections.length > 0 
                      ? 'Progress is automatically calculated based on completed items' 
                      : 'Set the current progress level for this badge'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Criteria Checklist (if badge has criteria sections) */}
            {criteriaSections.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Requirements</h3>
                
                {criteriaSections.map((section: any, idx: number) => (
                  <div key={idx} className="space-y-2">
                    <h4 className="font-medium">{section.title}</h4>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                    
                    <div className="space-y-2 ml-2">
                      {section.items && section.items.map((item: any) => (
                        <FormField
                          key={item.id}
                          control={form.control}
                          name="completedItems"
                          render={({ field }) => (
                            <FormItem className="flex items-start space-x-3 space-y-0 p-2 rounded-md hover:bg-muted/50">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(item.id)}
                                  onCheckedChange={(checked) => {
                                    const currentValue = field.value || [];
                                    const newValue = checked
                                      ? [...currentValue, item.id]
                                      : currentValue.filter((v) => v !== item.id);
                                    
                                    field.onChange(newValue);
                                    onCompletedItemsChange(newValue);
                                  }}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel className="text-sm font-normal">
                                  {item.text}
                                </FormLabel>
                                {item.description && (
                                  <FormDescription className="text-xs">
                                    {item.description}
                                  </FormDescription>
                                )}
                              </div>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notes Field */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add notes about this badge progress"
                      {...field}
                      className="resize-none"
                    />
                  </FormControl>
                  <FormDescription>
                    Optional notes about progress or achievements
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateProgressMutation.isPending}
              >
                {updateProgressMutation.isPending ? 'Saving...' : 'Save Progress'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}