import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
// Define custom ApiError type
type ApiError = {
  message: string;
  status?: number;
};
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, BadgeCategory } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { PlusCircle, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { useState } from "react";

interface BadgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge?: Badge;
  organizationId: number;
}

// Define types for criteria sections
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

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  criteria: z.string().optional(),
  imageUrl: z.string().optional(),
  color: z.string().optional(),
  categoryId: z.coerce.number().optional(),
  requiresProgress: z.boolean().default(true),
  criteriaType: z.enum(["binary", "numeric"]).default("binary"),
  criteriaSections: z.array(
    z.object({
      title: z.string(),
      criteria: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          description: z.string(),
          maxValue: z.number().optional(),
          valueType: z.string().optional(),
        })
      ),
    })
  ).optional(),
});

export function BadgeDialog({ open, onOpenChange, badge, organizationId }: BadgeDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for managing criteria sections
  const [showProgressOptions, setShowProgressOptions] = useState(true); // Always show progress options
  
  const { data: categories = [] } = useQuery<BadgeCategory[]>({
    queryKey: [`/api/organizations/${organizationId}/categories`],
    enabled: !!organizationId,
  });

  // Parse existing criteria sections if available
  const parseCriteriaSections = (): CriteriaSection[] => {
    if (badge?.criteriaSections) {
      try {
        if (typeof badge.criteriaSections === 'string') {
          return JSON.parse(badge.criteriaSections);
        }
        return badge.criteriaSections as unknown as CriteriaSection[];
      } catch (error) {
        console.error("Error parsing criteria sections:", error);
        return [];
      }
    }
    return [];
  };

  // Default empty section for new badges
  const defaultSection: CriteriaSection = {
    title: "Criteria Section",
    criteria: [
      { id: 1, name: "Requirement 1", description: "Description of the requirement" }
    ]
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: badge?.name || "",
      description: badge?.description || "",
      criteria: badge?.criteria || "",
      imageUrl: badge?.imageUrl || "",
      color: badge?.color || "#4F46E5",
      categoryId: badge?.categoryId || undefined,
      requiresProgress: badge?.requiresProgress !== false, // Default to true
      criteriaType: badge?.criteriaType as "binary" | "numeric" || "binary",
      criteriaSections: parseCriteriaSections().length > 0 
        ? parseCriteriaSections() 
        : [defaultSection], // Always include a default section
    },
  });

  const createBadgeMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const res = await apiRequest(
        "POST", 
        `/api/organizations/${organizationId}/badges`, 
        values
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Badge created",
        description: "Your badge has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/badges`] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/stats`] });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create badge. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateBadgeMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const res = await apiRequest("PUT", `/api/badges/${badge?.id}`, values);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Badge updated",
        description: "Your badge has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/badges`] });
      queryClient.invalidateQueries({ queryKey: [`/api/badges/${badge?.id}`] });
      onOpenChange(false);
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update badge. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // Create a new object without the criteriaSections field
    const { criteriaSections, ...otherValues } = values;
    
    // Add the stringified criteriaSections to the object
    const dataToSubmit = {
      ...otherValues,
      criteriaSections: criteriaSections 
        ? JSON.stringify(criteriaSections) 
        : undefined
    };
    
    if (badge) {
      updateBadgeMutation.mutate(dataToSubmit as any);
    } else {
      createBadgeMutation.mutate(dataToSubmit as any);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {badge ? "Edit Badge" : "Create New Badge"}
              </DialogTitle>
              <DialogDescription>
                {badge
                  ? "Update the badge details below."
                  : "Fill in the details below to create a new badge for your organization."}
              </DialogDescription>
            </DialogHeader>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Badge Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Innovation Champion"
                      {...field}
                    />
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
                      placeholder="Describe what this badge represents"
                      rows={3}
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
                  <FormLabel>Category</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(Number(value))}
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem
                          key={category.id}
                          value={category.id.toString()}
                        >
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
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Badge Color</FormLabel>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="w-10 h-10 rounded cursor-pointer"
                      {...field}
                    />
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image URL (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com/image.jpg"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="criteria"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Criteria for Earning</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="List the specific requirements for earning this badge"
                      rows={3}
                      {...field}
                      value={field.value || ""}
                    />
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
                </>
              )}
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
                {createBadgeMutation.isPending || updateBadgeMutation.isPending ? (
                  "Saving..."
                ) : badge ? (
                  "Update Badge"
                ) : (
                  "Create Badge"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
