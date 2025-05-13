import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlusCircle, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Type definitions
type ApiError = {
  message: string;
  status?: number;
};

interface BadgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge?: Badge;
  organizationId: number;
}

type CriterionItem = {
  id: number;
  name: string;
  description: string;
  maxValue?: number;
  valueType?: string;
};

type CriteriaSection = {
  title: string;
  criteria: CriterionItem[];
};

type BadgeCategory = {
  id: number;
  name: string;
  organizationId: number;
};

type Badge = {
  id: number;
  name: string;
  description: string;
  imageUrl?: string;
  categoryId?: number;
  organizationId: number;
  requiresProgress: boolean;
  criteriaType?: string;
  criteriaSections?: CriteriaSection[];
  criteriaSectionsJson?: string;
};

// Badge Form Schema
const badgeFormSchema = z.object({
  name: z.string().min(1, "Badge name is required"),
  description: z.string().min(1, "Description is required"),
  categoryId: z.coerce.number().optional(),
  imageUrl: z.string().optional(),
  organizationId: z.coerce.number(),
  requiresProgress: z.boolean().default(true),
  criteriaType: z.string().optional(),
  criteriaSections: z
    .array(
      z.object({
        title: z.string(),
        criteria: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
            description: z.string().optional(),
            maxValue: z.number().optional(),
          })
        ),
      })
    )
    .optional(),
});

type BadgeFormValues = z.infer<typeof badgeFormSchema>;

export function BadgeDialog({ open, onOpenChange, badge, organizationId }: BadgeDialogProps) {
  // Initialize form with default values or existing badge data
  const form = useForm<BadgeFormValues>({
    resolver: zodResolver(badgeFormSchema),
    defaultValues: {
      name: badge?.name || "",
      description: badge?.description || "",
      categoryId: badge?.categoryId || undefined,
      imageUrl: badge?.imageUrl || "",
      organizationId,
      requiresProgress: true, // Always enabled
      criteriaType: badge?.criteriaType || "binary",
      criteriaSections: badge?.criteriaSections || [
        {
          title: "Basic Requirements",
          criteria: [
            {
              id: 1,
              name: "Requirement 1",
              description: "Description of the requirement",
            },
          ],
        },
      ],
    },
  });

  // State for managing criteria sections
  const [showProgressOptions, setShowProgressOptions] = useState(true); // Always show progress options

  const { data: categories = [] } = useQuery<BadgeCategory[]>({
    queryKey: ["/api/badge-categories", organizationId],
    queryFn: () => apiRequest(`/api/badge-categories?organizationId=${organizationId}`),
  });

  // Mutation for creating a new badge
  const createBadgeMutation = useMutation({
    mutationFn: async (data: BadgeFormValues) => {
      // Serialize criteriaSections to JSON
      const payload = {
        ...data,
        criteriaSectionsJson: data.criteriaSections ? JSON.stringify(data.criteriaSections) : undefined,
      };
      return apiRequest("/api/badges", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/badges"] });
      onOpenChange(false);
    },
    onError: (error: ApiError) => {
      console.error("Failed to create badge:", error.message);
    },
  });

  // Mutation for updating an existing badge
  const updateBadgeMutation = useMutation({
    mutationFn: async (data: BadgeFormValues) => {
      // Serialize criteriaSections to JSON
      const payload = {
        ...data,
        criteriaSectionsJson: data.criteriaSections ? JSON.stringify(data.criteriaSections) : undefined,
      };
      return apiRequest(`/api/badges/${badge?.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/badges"] });
      onOpenChange(false);
    },
    onError: (error: ApiError) => {
      console.error("Failed to update badge:", error.message);
    },
  });

  function onSubmit(data: BadgeFormValues) {
    if (badge?.id) {
      updateBadgeMutation.mutate(data);
    } else {
      createBadgeMutation.mutate(data);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{badge ? "Edit Badge" : "Create Badge"}</DialogTitle>
          <DialogDescription>
            {badge
              ? "Update the badge details and criteria"
              : "Create a new badge with specific criteria"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Badge Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Badge Name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Badge description and purpose"
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category (Optional)</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    value={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">No Category</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id.toString()}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Badge Image URL (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="URL to badge image" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Progress tracking options */}
            <div className="border rounded-md p-4 space-y-4">
              <div className="flex flex-row items-center justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-medium">Progress Tracking</h3>
                  <p className="text-sm text-muted-foreground">
                    Progress tracking is enabled for all badges
                  </p>
                </div>
                <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 text-xs px-2 py-1 rounded-full font-medium">
                  Enabled
                </div>
              </div>
              
              {/* Criteria type and sections are always shown */}
              <FormField
                control={form.control}
                name="criteriaType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Criteria Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select criteria type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="binary">Binary (Yes/No)</SelectItem>
                        <SelectItem value="numeric">Numeric (Points)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Binary criteria are checkbox-style (completed or not). 
                      Numeric criteria track points or specific values.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-medium">Criteria Sections</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const current = form.getValues('criteriaSections') || [];
                      form.setValue('criteriaSections', [
                        ...current,
                        {
                          title: `Section ${current.length + 1}`,
                          criteria: [
                            { 
                              id: 1, 
                              name: "New Requirement", 
                              description: "Description of the requirement" 
                            }
                          ]
                        }
                      ]);
                    }}
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add Section
                  </Button>
                </div>
                
                {form.watch('criteriaSections')?.map((section, sectionIndex) => (
                  <div key={sectionIndex} className="border rounded-md p-3 space-y-3">
                    <div className="flex justify-between items-center">
                      <input
                        className="bg-transparent border-0 border-b border-gray-300 focus:border-primary-500 focus-visible:ring-0 px-0 py-1 text-sm font-medium"
                        value={section.title}
                        onChange={(e) => {
                          const currentSections = [...form.getValues('criteriaSections') || []];
                          currentSections[sectionIndex].title = e.target.value;
                          form.setValue('criteriaSections', currentSections);
                        }}
                      />
                      <div className="flex space-x-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const current = [...form.getValues('criteriaSections') || []];
                            
                            // Don't remove if it's the only section
                            if (current.length <= 1) return;
                            
                            current.splice(sectionIndex, 1);
                            form.setValue('criteriaSections', current);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {section.criteria.map((criterion, criterionIndex) => (
                        <div key={criterionIndex} className="grid grid-cols-1 gap-2 border border-dashed p-2 rounded-md">
                          <div className="flex items-center justify-between">
                            <input
                              className="bg-transparent border-0 border-b border-gray-300 focus:border-primary-500 focus-visible:ring-0 px-0 py-1 w-full text-sm"
                              placeholder="Criterion name"
                              value={criterion.name}
                              onChange={(e) => {
                                const currentSections = [...form.getValues('criteriaSections') || []];
                                currentSections[sectionIndex].criteria[criterionIndex].name = e.target.value;
                                form.setValue('criteriaSections', currentSections);
                              }}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const currentSections = [...form.getValues('criteriaSections') || []];
                                
                                // Don't remove if it's the only criterion
                                if (currentSections[sectionIndex].criteria.length <= 1) return;
                                
                                currentSections[sectionIndex].criteria.splice(criterionIndex, 1);
                                form.setValue('criteriaSections', currentSections);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          <textarea
                            className="min-h-[60px] resize-none bg-transparent border rounded-md text-sm p-2"
                            placeholder="Description"
                            value={criterion.description}
                            onChange={(e) => {
                              const currentSections = [...form.getValues('criteriaSections') || []];
                              currentSections[sectionIndex].criteria[criterionIndex].description = e.target.value;
                              form.setValue('criteriaSections', currentSections);
                            }}
                          />
                          
                          {form.watch('criteriaType') === 'numeric' && (
                            <div className="flex space-x-2 items-center">
                              <Input
                                type="number"
                                placeholder="Points"
                                className="w-20"
                                value={criterion.maxValue || 0}
                                onChange={(e) => {
                                  const currentSections = [...form.getValues('criteriaSections') || []];
                                  currentSections[sectionIndex].criteria[criterionIndex].maxValue = Number(e.target.value);
                                  form.setValue('criteriaSections', currentSections);
                                }}
                              />
                              <span className="text-sm text-gray-500">points</span>
                            </div>
                          )}
                        </div>
                      ))}
                      
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => {
                          const currentSections = [...form.getValues('criteriaSections') || []];
                          const nextId = Math.max(0, ...currentSections[sectionIndex].criteria.map(c => c.id)) + 1;
                          
                          currentSections[sectionIndex].criteria.push({
                            id: nextId,
                            name: `Requirement ${nextId}`,
                            description: "Description of the requirement"
                          });
                          
                          form.setValue('criteriaSections', currentSections);
                        }}
                      >
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Add Criterion
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

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
                className="bg-primary-600 hover:bg-primary-700"
                disabled={createBadgeMutation.isPending || updateBadgeMutation.isPending}
              >
                {badge ? "Update Badge" : "Create Badge"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}